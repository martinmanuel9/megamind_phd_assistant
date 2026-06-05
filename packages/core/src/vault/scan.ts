import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";
import type { ModelClient } from "../embeddings/client.js";
import { requireVaultRoot } from "../config.js";
import { listVaultMarkdown } from "./paths.js";
import { readNote } from "./notes.js";
import { registerDocument, ingestDocument, sha256 } from "../rag/ingest.js";

/** Read the `type:` scalar from a note's YAML frontmatter, if present. */
export function frontmatterType(content: string): string | undefined {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const t = fm[1]!.match(/^type:\s*(.+)$/m);
  if (!t) return undefined;
  return t[1]!.trim().replace(/^["']|["']$/g, "") || undefined;
}

/** Source notes are thin citation pointers — everything else is worth embedding. */
export function isEmbeddable(noteType: string | undefined): boolean {
  return noteType !== "source";
}

export interface NoteDiff {
  added: string[];
  removed: string[];
}

/** Compare disk paths to DB paths: what to add, what to remove. */
export function diffNotes(diskPaths: string[], dbPaths: string[]): NoteDiff {
  const disk = new Set(diskPaths);
  const db = new Set(dbPaths);
  return {
    added: diskPaths.filter((p) => !db.has(p)),
    removed: dbPaths.filter((p) => !disk.has(p)),
  };
}

const KNOWN_NOTE_TYPES = ["literature", "source", "synthesis", "annotation", "draft"];

function noteTypeFromContent(content: string): string {
  const t = frontmatterType(content);
  return t && KNOWN_NOTE_TYPES.includes(t) ? t : "draft";
}

function titleFromPath(relPath: string): string {
  return relPath.split("/").pop()!.replace(/\.md$/i, "");
}

export interface ReconcileResult {
  added: number;
  removed: number;
}

/**
 * Light tier: make the `notes` table mirror the vault's .md files. Inserts rows
 * for new files, deletes rows (and their linked note-documents) for files that
 * no longer exist. No embedding. The filesystem is the source of truth.
 */
export async function reconcileNotes(
  db: SupabaseClient,
  config: Config,
): Promise<ReconcileResult> {
  const root = requireVaultRoot(config);
  const diskPaths = listVaultMarkdown(root);

  const { data: rows, error } = await db.from("notes").select("id, vault_path, document_id");
  if (error) throw new Error(`reconcileNotes: ${error.message}`);
  const existing = (rows ?? []) as { id: string; vault_path: string; document_id: string | null }[];

  const { added, removed } = diffNotes(diskPaths, existing.map((r) => r.vault_path));

  if (removed.length) {
    const removedRows = existing.filter((r) => removed.includes(r.vault_path));
    const docIds = removedRows.map((r) => r.document_id).filter(Boolean) as string[];
    // Delete embedded note-documents first (cascades chunks + note_links), then
    // the note rows (cascades remaining note_links by note_id).
    if (docIds.length) {
      const { error: docErr } = await db.from("documents").delete().in("id", docIds);
      if (docErr) throw new Error(`reconcileNotes delete documents: ${docErr.message}`);
    }
    const { error: delErr } = await db.from("notes").delete().in("vault_path", removed);
    if (delErr) throw new Error(`reconcileNotes delete: ${delErr.message}`);
  }

  for (const rel of added) {
    let noteType = "draft";
    try { noteType = noteTypeFromContent(readNote(config, rel)); } catch { noteType = "draft"; }
    const { error: insErr } = await db.from("notes").insert({
      vault_path: rel,
      title: titleFromPath(rel),
      note_type: noteType,
      metadata: { source: "vault-scan" },
    });
    if (insErr) throw new Error(`reconcileNotes insert ${rel}: ${insErr.message}`);
  }

  return { added: added.length, removed: removed.length };
}

export interface ScanSummary {
  added: number;
  removed: number;
  embedded: number;
  skipped: number;
  failed: number;
}

/**
 * Full tier: reconcile, then embed each note (except `source` pointers) into the
 * repository so it's searchable/grounded. Incremental — only (re)embeds a note
 * whose content sha256 changed since the last index (tracked in notes.metadata).
 */
export async function scanVault(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
): Promise<ScanSummary> {
  const { added, removed } = await reconcileNotes(db, config);
  let embedded = 0, skipped = 0, failed = 0;

  const { data: rows, error } = await db
    .from("notes")
    .select("id, vault_path, title, note_type, document_id, metadata");
  if (error) throw new Error(`scanVault: ${error.message}`);
  const notes = (rows ?? []) as {
    id: string; vault_path: string; title: string; note_type: string;
    document_id: string | null; metadata: Record<string, unknown> | null;
  }[];

  for (const note of notes) {
    if (!isEmbeddable(note.note_type)) { skipped++; continue; }
    try {
      const text = readNote(config, note.vault_path);
      const sha = sha256(new TextEncoder().encode(text));
      const lastSha = (note.metadata as { indexed_sha?: string } | null)?.indexed_sha;
      if (note.document_id && lastSha === sha) { skipped++; continue; }

      let documentId = note.document_id;
      if (documentId) {
        await db.from("documents").update({ title: note.title, sha256: sha }).eq("id", documentId);
      } else {
        const doc = await registerDocument(db, {
          title: note.title, kind: "note", mimeType: "text/markdown",
          bytes: new TextEncoder().encode(text),
          metadata: { source: "vault-note", vault_path: note.vault_path },
        });
        documentId = doc.id;
      }
      await ingestDocument(db, model, documentId, text);
      await db.from("notes").update({
        document_id: documentId,
        metadata: { ...(note.metadata ?? {}), indexed_sha: sha },
      }).eq("id", note.id);
      embedded++;
    } catch {
      failed++;
    }
  }

  return { added, removed, embedded, skipped, failed };
}
