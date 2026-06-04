import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import { ragQuery, type RagHit } from "../rag/ingest.js";
import { createLiteratureNote, createSourceNote, NoteExistsError } from "../vault/notes.js";

/**
 * Retrieval-augmented Q&A over the document repository: retrieve the most
 * relevant passages, then have the local model answer grounded ONLY in them,
 * citing passages inline. A saved answer becomes a synthesis note with
 * claim-level traceability (reusing createLiteratureNote).
 */

export interface RagAnswer {
  answer: string;
  sources: RagHit[];
}

export async function answerWithRag(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  opts: { question: string; limit?: number; threshold?: number },
): Promise<RagAnswer> {
  const hits = await ragQuery(db, model, opts.question, {
    limit: opts.limit ?? 8,
    threshold: opts.threshold ?? 0.25,
  });
  if (hits.length === 0) {
    return { answer: "I couldn't find relevant passages in your library for that question.", sources: [] };
  }

  const context = hits
    .map((h, i) => `[${i + 1}] (${h.documentTitle}${h.section ? ` § ${h.section}` : ""})\n${h.text}`)
    .join("\n\n");

  const answer = await model.chat([
    {
      role: "system",
      content:
        "You are a precise research assistant. Answer the user's question using ONLY the numbered passages provided. " +
        "Cite the passages you rely on inline as [n]. If the passages don't contain enough to answer, say exactly what's missing. " +
        "Be concise and do not invent facts beyond the passages.",
    },
    { role: "user", content: `Question: ${opts.question}\n\nPassages:\n${context}` },
  ]);

  return { answer, sources: hits };
}

export interface SaveAnswerResult {
  relPath: string;
  linkCount: number;
}

export async function saveAnswerAsNote(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  input: { question: string; answer: string; sources: RagHit[] },
): Promise<SaveAnswerResult> {
  // Ensure source notes exist so [[wikilinks]] resolve in Obsidian.
  const docIds = [...new Set(input.sources.map((s) => s.documentId))];
  for (const id of docIds) {
    const { data: doc } = await db
      .from("documents")
      .select("id, title, authors, source_url, doi, published, venue")
      .eq("id", id)
      .single();
    if (doc) {
      try { await createSourceNote(db, config, doc, ["q-and-a"]); } catch (e) {
        if (!(e instanceof NoteExistsError)) throw e;
      }
    }
  }

  const result = await createLiteratureNote(db, model, config, {
    title: input.question.slice(0, 110),
    noteType: "synthesis",
    topics: ["q-and-a"],
    summary: input.answer,
    claims: input.sources.map((s) => ({
      text: `Evidence from ${s.documentTitle}${s.section ? ` (§ ${s.section})` : ""}`,
      documentId: s.documentId,
      chunkId: s.chunkId,
      quote: s.text.slice(0, 400),
    })),
  });

  return { relPath: result.relPath, linkCount: result.linkCount };
}
