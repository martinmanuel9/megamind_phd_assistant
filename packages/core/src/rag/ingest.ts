import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import { chunkText, type ChunkOptions, DEFAULT_CHUNK_OPTIONS } from "./chunk.js";

/**
 * Document ingestion + RAG retrieval. This is the bridge between raw source
 * documents and searchable, traceable passages.
 *
 *   registerDocument  → row in `documents` (the repository entry)
 *   ingestDocument    → parse text → chunk → embed → rows in `chunks`
 *   ragQuery          → embed the question → match_chunks → passages + source
 */

export interface RegisterDocumentInput {
  title: string;
  authors?: string[];
  sourceUrl?: string;
  doi?: string;
  published?: string;
  venue?: string;
  kind?: string;
  storagePath?: string;
  mimeType?: string;
  pageCount?: number;
  /** Raw bytes, used only to compute a dedup sha256. Not stored here. */
  bytes?: Uint8Array;
  metadata?: Record<string, unknown>;
}

export interface DocumentRow {
  id: string;
  title: string;
  authors: string[];
  source_url: string | null;
  doi: string | null;
  status: string;
  [k: string]: unknown;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Insert a document row, or return the existing one if an identical file
 * (same sha256) was already registered. Idempotent on content.
 */
export async function registerDocument(
  db: SupabaseClient,
  input: RegisterDocumentInput,
): Promise<DocumentRow> {
  const hash = input.bytes ? sha256(input.bytes) : undefined;

  if (hash) {
    const { data: existing } = await db
      .from("documents")
      .select("*")
      .eq("sha256", hash)
      .maybeSingle();
    if (existing) return existing as DocumentRow;
  }

  const { data, error } = await db
    .from("documents")
    .insert({
      title: input.title,
      authors: input.authors ?? [],
      source_url: input.sourceUrl ?? null,
      doi: input.doi ?? null,
      published: input.published ?? null,
      venue: input.venue ?? null,
      kind: input.kind ?? "article",
      storage_path: input.storagePath ?? null,
      mime_type: input.mimeType ?? null,
      sha256: hash ?? null,
      page_count: input.pageCount ?? null,
      status: "registered",
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) throw new Error(`registerDocument failed: ${error.message}`);
  return data as DocumentRow;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

/**
 * Chunk + embed a document's extracted text and store the chunks. Replaces any
 * existing chunks for the document (re-ingest safe). Embeds in batches.
 */
export async function ingestDocument(
  db: SupabaseClient,
  model: ModelClient,
  documentId: string,
  text: string,
  opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): Promise<IngestResult> {
  await db.from("documents").update({ status: "ingesting", ingest_error: null }).eq("id", documentId);

  try {
    await db.from("chunks").delete().eq("document_id", documentId);

    const chunks = chunkText(text, opts);
    const BATCH = 64;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vectors = await model.embed(batch.map((c) => c.text), "document");
      const rows = batch.map((c, j) => ({
        document_id: documentId,
        ord: c.ord,
        text: c.text,
        embedding: vectors[j]!,
        section: c.section ?? null,
        token_count: c.tokenCount,
      }));
      const { error } = await db.from("chunks").insert(rows);
      if (error) throw new Error(error.message);
    }

    await db.from("documents").update({ status: "ingested" }).eq("id", documentId);
    return { documentId, chunkCount: chunks.length };
  } catch (err) {
    await db
      .from("documents")
      .update({ status: "failed", ingest_error: (err as Error).message })
      .eq("id", documentId);
    throw err;
  }
}

export interface RagHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  ord: number;
  section: string | null;
  page: number | null;
  text: string;
  similarity: number;
}

/** Semantic search over chunks. Returns passages with their source document. */
export async function ragQuery(
  db: SupabaseClient,
  model: ModelClient,
  query: string,
  opts: { limit?: number; threshold?: number; documentId?: string } = {},
): Promise<RagHit[]> {
  const embedding = await model.embedOne(query, "query");
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: opts.threshold ?? 0.3,
    match_count: opts.limit ?? 10,
    filter_document_id: opts.documentId ?? null,
  });
  if (error) throw new Error(`ragQuery failed: ${error.message}`);

  const hits = (data ?? []) as {
    id: string; document_id: string; ord: number; text: string;
    page: number | null; section: string | null; similarity: number;
  }[];
  if (hits.length === 0) return [];

  // Resolve document titles in one query.
  const ids = [...new Set(hits.map((h) => h.document_id))];
  const { data: docs } = await db.from("documents").select("id, title").in("id", ids);
  const titleById = new Map((docs ?? []).map((d) => [d.id as string, d.title as string]));

  return hits.map((h) => ({
    chunkId: h.id,
    documentId: h.document_id,
    documentTitle: titleById.get(h.document_id) ?? "(unknown)",
    ord: h.ord,
    section: h.section,
    page: h.page,
    text: h.text,
    similarity: h.similarity,
  }));
}
