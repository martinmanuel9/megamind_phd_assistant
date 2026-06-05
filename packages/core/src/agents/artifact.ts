import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";
import { readNote } from "../vault/notes.js";

export type ArtifactInput =
  | { kind: "note"; relPath: string }
  | { kind: "text"; text: string; title: string }
  | { kind: "document"; documentId: string };

export interface ResolvedArtifact { title: string; text: string }

/** Resolve an artifact reference to plain text + a title for the review run. */
export async function resolveArtifactText(
  config: Config,
  db: SupabaseClient,
  input: ArtifactInput,
): Promise<ResolvedArtifact> {
  let title = "Artifact";
  let text = "";
  if (input.kind === "note") {
    text = readNote(config, input.relPath);
    title = basename(input.relPath).replace(/\.md$/i, "");
  } else if (input.kind === "text") {
    text = input.text;
    title = input.title;
  } else {
    const { data: doc } = await db.from("documents").select("title").eq("id", input.documentId).single();
    const { data: chunks } = await db
      .from("chunks").select("text").eq("document_id", input.documentId).order("ord", { ascending: true });
    title = (doc?.title as string) ?? "Document";
    text = (chunks ?? []).map((c: { text: string }) => c.text).join("\n\n");
  }
  if (!text || !text.trim()) throw new Error("artifact has no text to review");
  return { title, text };
}
