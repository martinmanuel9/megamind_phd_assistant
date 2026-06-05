import { createHash } from "node:crypto";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import { ensureDocumentsBucket, uploadDocumentFile } from "../storage/files.js";
import { ingestDocument, registerDocument, type DocumentRow } from "../rag/ingest.js";
import { collectionSlugFor, moveDocumentToCollection } from "../collections.js";

/**
 * Full upload pipeline: extract text → store the original file → register the
 * document → chunk + embed. One call turns an uploaded PDF/docx/txt/md into a
 * RAG-searchable, citable document. Idempotent on content (sha256 dedup).
 */

export type ExtractKind = "pdf" | "docx" | "text";

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

/** Extract plain text from a file's bytes by type. */
export async function extractTextFromFile(
  bytes: Uint8Array,
  mime: string,
  filename: string,
): Promise<{ text: string; kind: ExtractKind }> {
  const ext = extOf(filename);
  if (mime.includes("pdf") || ext === "pdf") {
    // pdf.js detaches the buffer it's given; pass a clone so the caller's bytes
    // stay intact for Storage upload + sha256.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: Array.isArray(text) ? text.join("\n\n") : text, kind: "pdf" };
  }
  if (mime.includes("word") || mime.includes("officedocument") || ext === "docx" || ext === "doc") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: result.value, kind: "docx" };
  }
  // Plain text / markdown / anything else decodable as UTF-8.
  return { text: new TextDecoder().decode(bytes), kind: "text" };
}

export interface UploadInput {
  filename: string;
  bytes: Uint8Array;
  mime: string;
  /** Defaults to the filename without extension. */
  title?: string;
  authors?: string[];
  sourceUrl?: string;
  doi?: string;
  published?: string;
  venue?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
  /** When provided, places the Storage object under the collection's slug and sets documents.collection_id. */
  collectionId?: string;
}

export interface UploadResult {
  document: DocumentRow;
  chunkCount: number;
  textLength: number;
  deduped: boolean;
}

export async function processDocumentUpload(
  db: SupabaseClient,
  model: ModelClient,
  input: UploadInput,
): Promise<UploadResult> {
  const { text } = await extractTextFromFile(input.bytes, input.mime, input.filename);
  if (text.trim().length === 0) {
    throw new Error(`no extractable text in ${input.filename}`);
  }

  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const ext = extOf(input.filename) || "bin";
  const slug = await collectionSlugFor(db, input.collectionId ?? null);
  const storagePath = `${slug}/${sha}.${ext}`;

  await ensureDocumentsBucket(db);
  await uploadDocumentFile(db, storagePath, input.bytes, input.mime || "application/octet-stream");

  const title = input.title?.trim() || input.filename.replace(/\.[^.]+$/, "");

  // registerDocument dedups by sha256 — if this file was uploaded before, we get
  // the existing row back instead of a duplicate.
  const before = await db.from("documents").select("id").eq("sha256", sha).maybeSingle();
  const deduped = !!before.data;

  const document = await registerDocument(db, {
    title,
    authors: input.authors,
    sourceUrl: input.sourceUrl,
    doi: input.doi,
    published: input.published,
    venue: input.venue,
    kind: input.kind ?? "article",
    storagePath,
    mimeType: input.mime,
    bytes: input.bytes,
    metadata: input.metadata,
  });

  if (input.collectionId) await moveDocumentToCollection(db, document.id, input.collectionId);

  const ing = await ingestDocument(db, model, document.id, text);

  return { document, chunkCount: ing.chunkCount, textLength: text.length, deduped };
}
