"use server";

import {
  checkSupabase,
  createModelClient,
  createServiceClient,
  DOCUMENTS_BUCKET,
  doctor,
  ensureAccessKey,
  getConfig,
  git,
  initVault,
  loadSettings,
  markOnboarded,
  mendeleyOverview,
  notesCitingDocument,
  ragQuery,
  readNote,
  syncMendeley,
  type MendeleyOverview,
  type MendeleySyncResult,
  reviewDocument,
  mcpListening,
  mcpLogs,
  mcpStatus,
  redactSettings,
  startMcp,
  stopMcp,
  updateSettings,
  type DoctorReport,
  type McpStatus,
  type Settings,
} from "@lob/core";

/**
 * Server actions — the ONLY bridge from the browser to @lob/core. Everything
 * here runs on the Node server; secrets and the filesystem never reach the
 * client. Each export is an async function (Next.js "use server" requirement).
 */

export type { MendeleyOverview, MendeleySyncResult };

const MASK = "••••••••";

export async function fetchStatus(): Promise<DoctorReport> {
  return doctor();
}

export async function fetchSettings(): Promise<Settings> {
  return redactSettings(loadSettings());
}

export async function saveSupabase(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<{ ok: boolean; migrated?: boolean; reason?: string }> {
  const supabase: Settings["supabase"] = {
    url: input.url || undefined,
    anonKey: input.anonKey && input.anonKey !== MASK ? input.anonKey : undefined,
  };
  // Only overwrite the secret if a real (non-masked) value was entered.
  if (input.serviceRoleKey && input.serviceRoleKey !== MASK) {
    supabase.serviceRoleKey = input.serviceRoleKey;
  }
  updateSettings({ supabase });
  return checkSupabase(getConfig());
}

export async function saveModels(input: {
  baseUrl: string;
  apiKey: string;
  embedModel: string;
  embedDim: number;
  chatModel: string;
}): Promise<DoctorReport> {
  const models: Partial<Settings["models"]> = {
    baseUrl: input.baseUrl,
    embedModel: input.embedModel,
    embedDim: Number(input.embedDim),
    chatModel: input.chatModel,
  };
  if (input.apiKey && input.apiKey !== MASK) models.apiKey = input.apiKey;
  updateSettings({ models: models as Settings["models"] });
  return doctor();
}

export async function saveVault(input: { root: string }): Promise<DoctorReport> {
  updateSettings({ vault: { root: input.root || undefined } as Settings["vault"] });
  const config = getConfig();
  if (config.vault.root) initVault(config, { scaffold: true });
  return doctor();
}

export async function connectGitHub(input: {
  remote: string;
  branch?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = getConfig();
    if (!config.vault.root) return { ok: false, error: "Set a vault first." };
    await initVault(config, { initGit: true, remote: input.remote, branch: input.branch ?? "main" });
    const cur = loadSettings();
    updateSettings({
      git: { ...cur.git, enabled: true, remote: input.remote, branch: input.branch ?? "main" },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function vaultGitStatus() {
  const config = getConfig();
  if (!config.vault.root || !git.isGitRepo(config.vault.root)) return null;
  return git.status(config.vault.root);
}

export async function vaultSync(message?: string) {
  const config = getConfig();
  if (!config.vault.root) return { committed: false, pulled: "no vault", pushed: "" };
  return git.sync(config.vault.root, message ?? `vault sync ${new Date().toISOString()}`, config.git.branch);
}

export async function regenerateAccessKey(): Promise<string> {
  // Clear the key, then re-ensure generates a fresh one.
  updateSettings({ mcpAccessKey: undefined });
  return ensureAccessKey();
}

export async function completeOnboarding(): Promise<void> {
  markOnboarded();
}

export interface DocumentSummary {
  id: string;
  title: string;
  authors: string[];
  kind: string;
  status: string;
  created_at: string;
}

export interface McpServerView extends McpStatus {
  listening: boolean;
  accessKey?: string;
  url?: string;
}

export async function mcpServerStatus(): Promise<McpServerView> {
  const status = mcpStatus();
  const listening = status.running ? await mcpListening() : false;
  const config = getConfig();
  return {
    ...status,
    listening,
    accessKey: config.mcp.accessKey,
    url: `http://${config.mcp.host}:${status.port}`,
  };
}

export async function startMcpServer(): Promise<McpServerView> {
  startMcp();
  // Give it a moment to bind the port before reporting.
  await new Promise((r) => setTimeout(r, 1200));
  return mcpServerStatus();
}

export async function stopMcpServer(): Promise<McpServerView> {
  stopMcp();
  return mcpServerStatus();
}

export async function mcpServerLogs(lines = 200): Promise<string> {
  return mcpLogs(lines);
}

export async function reviewDocumentAction(
  documentId: string,
): Promise<{ ok: boolean; relPath?: string; links?: number; resolved?: number; claims?: number; error?: string }> {
  try {
    const config = getConfig();
    const db = createServiceClient(config);
    const model = createModelClient(config);
    const r = await reviewDocument(db, model, config, { documentId });
    return { ok: true, relPath: r.relPath, links: r.linkCount, resolved: r.resolvedChunks, claims: r.claimsExtracted };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface SearchResults {
  passages: { documentId: string; documentTitle: string; chunkId: string; section: string | null; text: string; similarity: number }[];
  thoughts: { content: string; similarity: number }[];
}

export async function semanticSearch(query: string): Promise<SearchResults> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey || !query.trim()) {
    return { passages: [], thoughts: [] };
  }
  const db = createServiceClient(config);
  const model = createModelClient(config);

  const hits = await ragQuery(db, model, query, { limit: 12, threshold: 0.2 });

  let thoughts: SearchResults["thoughts"] = [];
  try {
    const emb = await model.embedOne(query, "query");
    const { data } = await db.rpc("match_thoughts", { query_embedding: emb, match_threshold: 0.2, match_count: 5 });
    thoughts = ((data ?? []) as { content: string; similarity: number }[]).map((t) => ({
      content: t.content,
      similarity: t.similarity,
    }));
  } catch {
    // memory search is best-effort
  }

  return {
    passages: hits.map((h) => ({
      documentId: h.documentId,
      documentTitle: h.documentTitle,
      chunkId: h.chunkId,
      section: h.section,
      text: h.text,
      similarity: h.similarity,
    })),
    thoughts,
  };
}

export interface DocumentDetail {
  document: {
    id: string; title: string; authors: string[]; kind: string; status: string;
    source_url: string | null; doi: string | null; published: string | null;
    venue: string | null; created_at: string;
  };
  chunks: { id: string; ord: number; text: string; section: string | null; page: number | null }[];
  links: { chunk_id: string | null; claim_text: string | null; quote: string | null; note_id: string; note_title: string; note_path: string }[];
  citingNotes: { noteId: string; title: string; vaultPath: string; claims: number }[];
}

export async function documentDetail(id: string): Promise<DocumentDetail | null> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  const db = createServiceClient(config);

  const { data: document } = await db
    .from("documents")
    .select("id, title, authors, kind, status, source_url, doi, published, venue, created_at")
    .eq("id", id)
    .single();
  if (!document) return null;

  const { data: chunks } = await db
    .from("chunks")
    .select("id, ord, text, section, page")
    .eq("document_id", id)
    .order("ord", { ascending: true });

  const { data: rawLinks } = await db
    .from("note_links")
    .select("chunk_id, claim_text, quote, note_id, notes!inner(title, vault_path)")
    .eq("document_id", id);

  const links = ((rawLinks ?? []) as unknown as {
    chunk_id: string | null; claim_text: string | null; quote: string | null;
    note_id: string; notes: { title: string; vault_path: string };
  }[]).map((l) => ({
    chunk_id: l.chunk_id,
    claim_text: l.claim_text,
    quote: l.quote,
    note_id: l.note_id,
    note_title: l.notes.title,
    note_path: l.notes.vault_path,
  }));

  const citingNotes = await notesCitingDocument(db, id);

  return {
    document: document as DocumentDetail["document"],
    chunks: (chunks ?? []) as DocumentDetail["chunks"],
    links,
    citingNotes,
  };
}

export async function updateDocumentMeta(
  id: string,
  fields: { title?: string; authors?: string[]; doi?: string; published?: string; venue?: string; source_url?: string; kind?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createServiceClient(getConfig());
    const patch: Record<string, unknown> = {};
    if (fields.title !== undefined) patch.title = fields.title.trim();
    if (fields.authors !== undefined) patch.authors = fields.authors;
    if (fields.doi !== undefined) patch.doi = fields.doi || null;
    if (fields.published !== undefined) patch.published = fields.published || null;
    if (fields.venue !== undefined) patch.venue = fields.venue || null;
    if (fields.source_url !== undefined) patch.source_url = fields.source_url || null;
    if (fields.kind !== undefined) patch.kind = fields.kind;
    const { error } = await db.from("documents").update(patch).eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteDocument(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = createServiceClient(getConfig());
    const { data: doc } = await db.from("documents").select("storage_path").eq("id", id).maybeSingle();
    if (doc?.storage_path) {
      await db.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]).catch(() => {});
    }
    // Cascades chunks + note_links (vault note files are left intact).
    const { error } = await db.from("documents").delete().eq("id", id);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export interface NoteSummary {
  id: string;
  title: string;
  note_type: string;
  vault_path: string;
  topics: string[];
  updated_at: string;
}

export async function listNotes(): Promise<NoteSummary[]> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return [];
  const db = createServiceClient(config);
  const { data, error } = await db
    .from("notes")
    .select("id, title, note_type, vault_path, topics, updated_at")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) return [];
  return (data ?? []) as NoteSummary[];
}

export interface NoteContent {
  id: string;
  title: string;
  noteType: string;
  vaultPath: string;
  content: string;
}

export async function getNote(id: string): Promise<NoteContent | null> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  const db = createServiceClient(config);
  const { data: note } = await db
    .from("notes")
    .select("id, title, note_type, vault_path")
    .eq("id", id)
    .single();
  if (!note) return null;
  let content = "";
  try {
    content = readNote(config, note.vault_path);
  } catch (e) {
    content = `*Could not read note file: ${(e as Error).message}*`;
  }
  return { id: note.id, title: note.title, noteType: note.note_type, vaultPath: note.vault_path, content };
}

// --- Mendeley sync ---

export async function getMendeleyOverview(): Promise<MendeleyOverview> {
  return mendeleyOverview(getConfig());
}

export async function saveMendeleyPaths(input: { dbPath?: string; userfilesPath?: string }): Promise<MendeleyOverview> {
  updateSettings({
    mendeley: {
      ...loadSettings().mendeley,
      dbPath: input.dbPath?.trim() || undefined,
      userfilesPath: input.userfilesPath?.trim() || undefined,
    },
  });
  return mendeleyOverview(getConfig());
}

export async function saveMendeleyAutoSync(minutes: number, review: boolean): Promise<MendeleyOverview> {
  updateSettings({
    mendeley: {
      ...loadSettings().mendeley,
      autoSyncMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0,
      autoSyncReview: review,
    },
  });
  return mendeleyOverview(getConfig());
}

export async function runMendeleySync(review = false): Promise<{ ok: boolean; result?: MendeleySyncResult; error?: string }> {
  try {
    const config = getConfig();
    const db = createServiceClient(config);
    const model = createModelClient(config);
    const result = await syncMendeley(db, model, config, { review });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return [];
  const db = createServiceClient(config);
  const { data, error } = await db
    .from("documents")
    .select("id, title, authors, kind, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as DocumentSummary[];
}
