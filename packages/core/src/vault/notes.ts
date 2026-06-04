import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import { requireVaultRoot } from "../config.js";
import {
  ensureVaultLayout,
  resolveInsideVault,
  sanitizeTitle,
} from "./paths.js";
import { emitFrontmatter, type FrontmatterField } from "./frontmatter.js";
import { formatCitation, type CitationInput } from "./bibliography.js";
import { ragQuery } from "../rag/ingest.js";

/**
 * The note writer. Writes Obsidian-native Markdown into the vault AND records
 * the traceability links in Supabase, so every note knows its sources and every
 * source knows which notes cite it. Claim-level: each claim resolves to an exact
 * source passage (chunk) where possible.
 */

export type NoteType = "literature" | "source" | "synthesis" | "annotation" | "draft";

export class NoteExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteExistsError";
  }
}

function dirFor(noteType: NoteType, dirs: Config["vault"]["dirs"]): string {
  switch (noteType) {
    case "source": return dirs.sources;
    case "synthesis": return dirs.syntheses;
    case "annotation": return dirs.annotations;
    case "draft": return dirs.drafts;
    case "literature":
    default: return dirs.literature;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function writeDirsOf(config: Config): string[] {
  return Object.values(config.vault.dirs);
}

/** Write a markdown file into the vault (guarded) and register it in `notes`. */
async function persistNote(
  db: SupabaseClient,
  config: Config,
  args: {
    noteType: NoteType;
    title: string;
    topics: string[];
    frontmatter: FrontmatterField[];
    body: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ noteId: string; relPath: string; absPath: string }> {
  const root = requireVaultRoot(config);
  ensureVaultLayout(root, writeDirsOf(config));

  const dir = dirFor(args.noteType, config.vault.dirs);
  const filename = sanitizeTitle(args.title) + ".md";
  const relPath = join(dir, filename);
  const absPath = resolveInsideVault(root, relPath, {
    forWrite: true,
    writeDirs: writeDirsOf(config),
  });

  if (existsSync(absPath)) {
    throw new NoteExistsError(`note already exists: ${relPath}`);
  }

  const content = emitFrontmatter(args.frontmatter) + "\n" + args.body;
  writeFileSync(absPath, content);

  const { data, error } = await db
    .from("notes")
    .upsert(
      {
        vault_path: relPath,
        title: args.title,
        note_type: args.noteType,
        topics: args.topics,
        metadata: args.metadata ?? {},
      },
      { onConflict: "vault_path" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`note registration failed: ${error.message}`);

  return { noteId: data.id as string, relPath, absPath };
}

/** Read a note's raw Markdown from the vault (guarded, read-only). */
export function readNote(config: Config, relPath: string): string {
  const root = requireVaultRoot(config);
  const abs = resolveInsideVault(root, relPath, { forWrite: false, writeDirs: writeDirsOf(config) });
  return readFileSync(abs, "utf8");
}

// --- Source notes (one vault note per repository document) -------------------

export interface DocumentForNote {
  id: string;
  title: string;
  authors?: string[];
  source_url?: string | null;
  doi?: string | null;
  published?: string | null;
  venue?: string | null;
}

function docToCitation(doc: DocumentForNote): CitationInput {
  return {
    title: doc.title,
    authors: doc.authors ?? [],
    published: doc.published ?? undefined,
    venue: doc.venue ?? undefined,
    doi: doc.doi ?? undefined,
    source: doc.source_url ?? undefined,
  };
}

/**
 * Create the vault-side representation of a repository document. Literature and
 * synthesis notes wikilink to these by title, so [[Source Title]] resolves in
 * Obsidian while the DB keeps the precise document id.
 */
export async function createSourceNote(
  db: SupabaseClient,
  config: Config,
  doc: DocumentForNote,
  topics: string[] = [],
): Promise<{ noteId: string; relPath: string }> {
  const citation = formatCitation(docToCitation(doc), "markdown");
  const body = [
    `# ${doc.title}`,
    "",
    "## Citation",
    "",
    citation,
    "",
    "## Source",
    "",
    `- Document ID: \`${doc.id}\``,
    `- Link: ${doc.source_url ?? ""}`,
    `- DOI: ${doc.doi ?? ""}`,
    `- Authors: ${(doc.authors ?? []).join(", ")}`,
    `- Published: ${doc.published ?? ""}`,
    "",
    "## Notes",
    "",
  ].join("\n");

  const fm: FrontmatterField[] = [
    ["type", "source"],
    ["status", "captured"],
    ["created", todayISO()],
    ["updated", todayISO()],
    ["document_id", doc.id],
    ["source", doc.source_url ?? null],
    ["authors", doc.authors ?? null],
    ["doi", doc.doi ?? null],
    ["tags", ["source", ...topics.map((t) => `topic/${t}`)]],
  ];

  const { noteId, relPath } = await persistNote(db, config, {
    noteType: "source",
    title: doc.title,
    topics,
    frontmatter: fm,
    body,
    metadata: { document_id: doc.id },
  });
  return { noteId, relPath };
}

// --- Literature / synthesis notes with claim-level traceability --------------

export interface SourcedClaim {
  /** The claim/assertion as it appears in the note. */
  text: string;
  /** Repository document this claim is drawn from. */
  documentId?: string;
  /** Exact backing passage. If omitted but documentId is set, auto-resolved. */
  chunkId?: string;
  /** Short fair-use quote (<= 500 chars) backing the claim. */
  quote?: string;
}

export interface LiteratureNoteInput {
  title: string;
  noteType?: Extract<NoteType, "literature" | "synthesis">;
  topics: string[];
  summary?: string;
  claims: SourcedClaim[];
  openQuestions?: string[];
  extraSections?: { heading: string; body: string }[];
  status?: string;
}

export interface LiteratureNoteResult {
  noteId: string;
  relPath: string;
  linkCount: number;
  resolvedChunks: number;
}

const MAX_QUOTE = 500;

/**
 * Write a literature/synthesis note. For each sourced claim we (1) resolve the
 * exact backing chunk via RAG when not given, (2) render an Obsidian-native
 * citation, and (3) record a note_links row tying claim → document → passage.
 */
export async function createLiteratureNote(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  input: LiteratureNoteInput,
): Promise<LiteratureNoteResult> {
  for (const c of input.claims) {
    if (c.quote && c.quote.length > MAX_QUOTE) {
      throw new Error(`quote too long (${c.quote.length} > ${MAX_QUOTE}) for claim: ${c.text.slice(0, 60)}…`);
    }
  }

  // Resolve document metadata for every referenced document (one query).
  const docIds = [...new Set(input.claims.map((c) => c.documentId).filter(Boolean) as string[])];
  const docsById = new Map<string, DocumentForNote>();
  if (docIds.length) {
    const { data } = await db
      .from("documents")
      .select("id, title, authors, source_url, doi, published, venue")
      .in("id", docIds);
    for (const d of data ?? []) docsById.set(d.id as string, d as DocumentForNote);
  }

  // Resolve a backing chunk for each claim that names a document but no chunk.
  let resolvedChunks = 0;
  const resolved: (SourcedClaim & { section?: string | null; page?: number | null })[] = [];
  for (const claim of input.claims) {
    let chunkId = claim.chunkId;
    let section: string | null = null;
    let page: number | null = null;
    if (claim.documentId && !chunkId) {
      const hits = await ragQuery(db, model, claim.text, { documentId: claim.documentId, limit: 1, threshold: 0.2 });
      if (hits[0]) {
        chunkId = hits[0].chunkId;
        section = hits[0].section;
        page = hits[0].page;
        resolvedChunks++;
      }
    }
    resolved.push({ ...claim, chunkId, section, page });
  }

  // Build the body.
  const noteType = input.noteType ?? "literature";
  const lines = [`# ${input.title}`, ""];
  if (input.summary) lines.push("## Summary", "", input.summary, "");

  lines.push("## Key Claims", "");
  resolved.forEach((c, i) => {
    const doc = c.documentId ? docsById.get(c.documentId) : undefined;
    const cite = doc ? ` — [[${sanitizeTitle(doc.title)}]]` : "";
    const where = c.section ? ` (§ ${c.section})` : c.page ? ` (p. ${c.page})` : "";
    lines.push(`${i + 1}. ${c.text}${cite}${where}`);
    if (c.quote) lines.push(`   > ${c.quote}`);
    lines.push("");
  });

  if (input.openQuestions?.length) {
    lines.push("## Open Questions", "");
    for (const q of input.openQuestions) lines.push(`- ${q}`);
    lines.push("");
  }
  for (const s of input.extraSections ?? []) {
    lines.push(`## ${s.heading}`, "", s.body, "");
  }

  const sourceTitles = [...docsById.values()].map((d) => d.title);
  if (sourceTitles.length) {
    lines.push("## Sources", "");
    for (const d of docsById.values()) {
      lines.push(`- [[${sanitizeTitle(d.title)}]] — \`${d.id}\``);
    }
    lines.push("", "## References", "");
    for (const d of docsById.values()) {
      lines.push(`- ${formatCitation(docToCitation(d), "markdown")}`);
    }
    lines.push("");
  }

  const fm: FrontmatterField[] = [
    ["type", noteType],
    ["status", input.status ?? "drafting-ready"],
    ["created", todayISO()],
    ["updated", todayISO()],
    ["sources", sourceTitles.map((t) => `[[${sanitizeTitle(t)}]]`)],
    ["tags", [`research/${noteType}`, ...input.topics.map((t) => `topic/${t}`)]],
  ];

  const { noteId, relPath } = await persistNote(db, config, {
    noteType,
    title: input.title,
    topics: input.topics,
    frontmatter: fm,
    body: lines.join("\n"),
  });

  // Record claim-level traceability links.
  const linkRows = resolved
    .filter((c) => c.documentId)
    .map((c) => ({
      note_id: noteId,
      document_id: c.documentId!,
      chunk_id: c.chunkId ?? null,
      claim_text: c.text,
      quote: c.quote ?? null,
    }));
  if (linkRows.length) {
    const { error } = await db.from("note_links").insert(linkRows);
    if (error) throw new Error(`note_links insert failed: ${error.message}`);
  }

  return { noteId, relPath, linkCount: linkRows.length, resolvedChunks };
}

/** Reverse traceability: every note that cites a given document. */
export async function notesCitingDocument(
  db: SupabaseClient,
  documentId: string,
): Promise<{ noteId: string; title: string; vaultPath: string; claims: number }[]> {
  const { data, error } = await db
    .from("note_links")
    .select("note_id, notes!inner(title, vault_path)")
    .eq("document_id", documentId);
  if (error) throw new Error(error.message);

  const byNote = new Map<string, { title: string; vaultPath: string; claims: number }>();
  for (const row of (data ?? []) as unknown as {
    note_id: string;
    notes: { title: string; vault_path: string };
  }[]) {
    const cur = byNote.get(row.note_id);
    if (cur) cur.claims++;
    else byNote.set(row.note_id, { title: row.notes.title, vaultPath: row.notes.vault_path, claims: 1 });
  }
  return [...byNote.entries()].map(([noteId, v]) => ({ noteId, ...v }));
}
