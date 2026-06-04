import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import {
  createLiteratureNote,
  createSourceNote,
  NoteExistsError,
  type LiteratureNoteResult,
} from "../vault/notes.js";

/**
 * "AI review a document": the chat model reads an ingested document's text and
 * extracts a summary + grounded claims, which we turn into a literature note
 * with CLAIM-LEVEL traceability. The model only extracts claims + verbatim
 * quotes; createLiteratureNote RAG-resolves each claim to its exact source
 * chunk, so the citations can't be hallucinated.
 */

export interface ReviewInput {
  documentId: string;
  /** Optional focus for the review (e.g. "the evaluation methodology"). */
  focus?: string;
  /** Note title; defaults to "Notes on <document title>". */
  title?: string;
  topics?: string[];
  noteType?: "literature" | "synthesis";
  /** Max characters of document text to feed the model (local context budget). */
  maxChars?: number;
}

export interface ReviewResult extends LiteratureNoteResult {
  claimsExtracted: number;
  truncated: boolean;
}

interface ModelReview {
  summary: string;
  claims: { text: string; quote?: string }[];
  open_questions?: string[];
}

/** Best-effort JSON parse — tolerate a model that wraps JSON in prose/fences. */
function parseReview(raw: string): ModelReview {
  const tryParse = (s: string): ModelReview | null => {
    try {
      const o = JSON.parse(s);
      if (o && typeof o === "object" && Array.isArray(o.claims)) return o as ModelReview;
      return null;
    } catch {
      return null;
    }
  };
  let out = tryParse(raw.trim());
  if (!out) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) out = tryParse(m[0]);
  }
  if (!out) throw new Error("model did not return parseable review JSON");
  return out;
}

const SYSTEM_PROMPT =
  `You are a meticulous PhD research assistant writing a literature note about ONE source document. ` +
  `Read the provided text and extract its substance. Respond with STRICT JSON only, no prose, in this shape:\n` +
  `{"summary": string, "claims": [{"text": string, "quote": string}], "open_questions": [string]}\n` +
  `Rules:\n` +
  `- Extract 4-8 of the document's most important claims (contributions, methods, findings, limitations).\n` +
  `- Each claim's "quote" MUST be a short verbatim span copied from the provided text that supports the claim. Max ~300 characters.\n` +
  `- Do NOT invent facts not present in the text. If unsure, omit the claim.\n` +
  `- "summary" is 2-4 sentences. "open_questions" are 0-3 genuine follow-ups.`;

export async function reviewDocument(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  input: ReviewInput,
): Promise<ReviewResult> {
  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("id, title, authors, source_url, doi, published, venue")
    .eq("id", input.documentId)
    .single();
  if (docErr || !doc) throw new Error(`document not found: ${input.documentId}`);

  const { data: chunks } = await db
    .from("chunks")
    .select("ord, text, section")
    .eq("document_id", input.documentId)
    .order("ord", { ascending: true });
  if (!chunks || chunks.length === 0) {
    throw new Error("document has no ingested text — ingest it before reviewing");
  }

  const maxChars = input.maxChars ?? 14000;
  let text = "";
  let truncated = false;
  for (const c of chunks as { text: string }[]) {
    if (text.length + c.text.length > maxChars) {
      truncated = true;
      break;
    }
    text += c.text + "\n\n";
  }

  const raw = await model.chat(
    [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Document title: ${doc.title}\n` +
          `Focus: ${input.focus ?? "the key contributions, methods, and findings"}\n\n` +
          `TEXT:\n${text}`,
      },
    ],
    { json: true },
  );

  const review = parseReview(raw);

  // Ensure a source note exists so [[wikilinks]] resolve in Obsidian.
  try {
    await createSourceNote(db, config, doc, input.topics ?? []);
  } catch (e) {
    if (!(e instanceof NoteExistsError)) throw e;
  }

  const claims = review.claims
    .filter((c) => c.text?.trim())
    .map((c) => ({
      text: c.text.trim(),
      documentId: input.documentId,
      quote: c.quote ? c.quote.slice(0, 480) : undefined,
    }));

  const result = await createLiteratureNote(db, model, config, {
    title: input.title ?? `Notes on ${doc.title}`,
    topics: input.topics ?? ["literature"],
    summary: review.summary,
    noteType: input.noteType ?? "literature",
    claims,
    openQuestions: review.open_questions,
  });

  return { ...result, claimsExtracted: claims.length, truncated };
}
