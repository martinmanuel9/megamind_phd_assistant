import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { settingsPath } from "../settings.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import { type Config } from "../config.js";
import { loadSettings, saveSettings } from "../settings.js";
import { processDocumentUpload } from "../documents/process.js";
import { reviewDocument } from "../documents/review.js";

/**
 * Mendeley Reference Manager integration. Mendeley stores PDFs under userfiles/
 * named by a file UUID, and metadata in a SQLite DB (FTS5 tables): the PDF
 * filename == files_fts.id, which joins to documents_fts for title/authors/
 * year/source/identifiers.
 *
 * Sync is incremental by CONTENT HASH: we compute each file's sha256 and skip
 * any already present in `documents` — so re-syncing only uploads genuinely new
 * papers. Requires the `sqlite3` CLI (ships with macOS).
 */

const mendeleyDir = () => join(homedir(), "Library/Application Support/Mendeley Reference Manager");

/**
 * Candidate locations for the SQLite databases. Newer Mendeley Reference Manager
 * builds nest them under `mrm/databases`; older ones use `databases` directly.
 */
const dbSearchDirs = (): string[] => [
  join(mendeleyDir(), "databases"),
  join(mendeleyDir(), "mrm", "databases"),
];

/** First existing PDF store: newer builds may nest it under `mrm/userfiles`. */
function findUserfiles(): string {
  for (const c of [join(mendeleyDir(), "userfiles"), join(mendeleyDir(), "mrm", "userfiles")]) {
    if (existsSync(c)) return c;
  }
  return join(mendeleyDir(), "userfiles");
}

export interface MendeleyEntry {
  fileId: string;
  title?: string;
  authors?: string[];
  published?: string;
  venue?: string;
  doi?: string;
}

function sqlite(dbPath: string, sql: string, json = false): string {
  const args = json ? ["-json", dbPath, sql] : [dbPath, sql];
  return execFileSync("sqlite3", args, { maxBuffer: 128 * 1024 * 1024 }).toString();
}

/** Largest .db under Mendeley/databases that has the files_fts table. */
export function findMendeleyDb(): string | undefined {
  let best: string | undefined;
  let bestN = -1;
  for (const dir of dbSearchDirs()) {
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".db") || f === "Databases.db") continue;
        const p = join(dir, f);
        try {
          const n = Number(sqlite(p, "SELECT count(*) FROM files_fts").trim());
          if (n > bestN) { bestN = n; best = p; }
        } catch { /* wrong schema */ }
      }
    } catch { /* this location not present */ }
  }
  return best;
}

export function resolveMendeleyPaths(config: Config): { dbPath?: string; userfilesPath: string } {
  const m = config.settings.mendeley;
  // Trust a saved path only if it still exists — Mendeley updates can relocate
  // the DB (e.g. into `mrm/`), leaving a stale path that should fall back to
  // auto-detection rather than reporting "not found".
  const savedDb = m.dbPath && existsSync(m.dbPath) ? m.dbPath : undefined;
  const savedUserfiles = m.userfilesPath && existsSync(m.userfilesPath) ? m.userfilesPath : undefined;
  return {
    dbPath: savedDb ?? findMendeleyDb(),
    userfilesPath: savedUserfiles ?? findUserfiles(),
  };
}

export function readMendeleyLibrary(dbPath: string): MendeleyEntry[] {
  const sql =
    "SELECT f.id as id, d.title, d.authors, d.source, d.year, d.identifiers " +
    "FROM files_fts f LEFT JOIN documents_fts d ON f.document_id = d.id";
  const rows = JSON.parse(sqlite(dbPath, sql, true) || "[]") as {
    id: string; title?: string; authors?: string; source?: string; year?: string | number; identifiers?: string;
  }[];
  return rows.map((r) => ({
    fileId: r.id,
    title: r.title?.trim() || undefined,
    authors: r.authors?.trim() ? [r.authors.trim()] : undefined,
    published: r.year == null || r.year === "" ? undefined : String(r.year).replace(/\.0$/, "").trim(),
    venue: r.source?.trim() || undefined,
    doi: String(r.identifiers ?? "").match(/10\.\d{4,}\/\S+/)?.[0],
  }));
}

export interface MendeleyOverview {
  /** DB readable AND userfiles folder present — ready to sync. */
  connected: boolean;
  dbFound: boolean;
  dbReadable: boolean;
  userfilesExists: boolean;
  sqliteAvailable: boolean;
  dbPath?: string;
  userfilesPath: string;
  libraryCount: number;
  pdfCount: number;
  lastSyncAt?: string;
  lastResult?: Config["settings"]["mendeley"]["lastResult"];
  autoSyncMinutes: number;
  autoSyncReview: boolean;
  reason?: string;
}

export function mendeleyOverview(config: Config): MendeleyOverview {
  const { dbPath, userfilesPath } = resolveMendeleyPaths(config);
  const dbFound = !!dbPath && existsSync(dbPath);
  const userfilesExists = existsSync(userfilesPath);

  let sqliteAvailable = true;
  try { execFileSync("sqlite3", ["-version"]); } catch { sqliteAvailable = false; }

  let dbReadable = false;
  let libraryCount = 0;
  if (dbFound && sqliteAvailable) {
    try {
      libraryCount = Number(
        sqlite(dbPath!, "SELECT count(*) FROM files_fts f LEFT JOIN documents_fts d ON f.document_id = d.id").trim(),
      );
      dbReadable = true;
    } catch { /* locked or wrong schema */ }
  }

  let pdfCount = 0;
  if (userfilesExists) {
    try { pdfCount = readdirSync(userfilesPath).filter((f) => f.toLowerCase().endsWith(".pdf")).length; } catch { /* unreadable */ }
  }

  const connected = dbReadable && userfilesExists;
  const reason = !sqliteAvailable
    ? "sqlite3 CLI not found"
    : !dbFound
      ? "Mendeley database not found — set the path below"
      : !dbReadable
        ? "database found but unreadable (is Mendeley open and locking it?)"
        : !userfilesExists
          ? "userfiles folder not found — set the path below"
          : undefined;

  const m = config.settings.mendeley;
  return {
    connected, dbFound, dbReadable, userfilesExists, sqliteAvailable,
    dbPath, userfilesPath, libraryCount, pdfCount,
    lastSyncAt: m.lastSyncAt, lastResult: m.lastResult,
    autoSyncMinutes: m.autoSyncMinutes ?? 0, autoSyncReview: m.autoSyncReview ?? false,
    reason,
  };
}

/** Whether an auto-sync is due, based on configured cadence + last sync time. */
export function dueForAutoSync(config: Config): boolean {
  const m = config.settings.mendeley;
  const mins = m.autoSyncMinutes ?? 0;
  if (!mins || mins <= 0) return false;
  if (!m.lastSyncAt) return true;
  const elapsedMin = (Date.now() - new Date(m.lastSyncAt).getTime()) / 60000;
  return elapsedMin >= mins;
}

export interface MendeleySyncResult {
  imported: number;
  skipped: number;
  failed: number;
  missingFile: number;
  total: number;
}

/**
 * Pull new papers from the local Mendeley library into Supabase. Incremental:
 * files whose content hash already exists are skipped. Persists last-sync state.
 */
export async function syncMendeley(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  opts: { review?: boolean } = {},
): Promise<MendeleySyncResult> {
  const { dbPath, userfilesPath } = resolveMendeleyPaths(config);
  if (!dbPath || !existsSync(dbPath)) throw new Error("Mendeley database not found");

  // Cross-process lock so the in-process heartbeat and a launchd sync (or two
  // clicks) can't run concurrently. A stale lock (>15 min) is ignored.
  const lock = join(dirname(settingsPath()), "mendeley-sync.lock");
  if (existsSync(lock)) {
    const ageMin = (Date.now() - statSync(lock).mtimeMs) / 60000;
    if (ageMin < 15) throw new Error("a sync is already running");
  }
  writeFileSync(lock, String(process.pid));

  try {
    return await runSync(db, model, config, opts, dbPath, userfilesPath);
  } finally {
    rmSync(lock, { force: true });
  }
}

async function runSync(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  opts: { review?: boolean },
  dbPath: string,
  userfilesPath: string,
): Promise<MendeleySyncResult> {
  const lib = readMendeleyLibrary(dbPath);

  const { data } = await db.from("documents").select("sha256").not("sha256", "is", null);
  const existing = new Set((data ?? []).map((r) => (r as { sha256: string }).sha256));

  let imported = 0, skipped = 0, failed = 0, missingFile = 0;
  for (const e of lib) {
    const file = join(userfilesPath, `${e.fileId}.pdf`);
    if (!existsSync(file)) { missingFile++; continue; }
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(readFileSync(file)); } catch { missingFile++; continue; }

    const sha = createHash("sha256").update(bytes).digest("hex");
    if (existing.has(sha)) { skipped++; continue; }

    try {
      const r = await processDocumentUpload(db, model, {
        filename: `${e.fileId}.pdf`,
        mime: "application/pdf",
        bytes,
        title: e.title,
        authors: e.authors,
        published: e.published,
        venue: e.venue,
        doi: e.doi,
        metadata: { source: "mendeley", mendeley_file_id: e.fileId },
      });
      existing.add(sha);
      imported++;
      if (opts.review) {
        try { await reviewDocument(db, model, config, { documentId: r.document.id }); } catch { /* note exists / model error */ }
      }
    } catch {
      failed++;
    }
  }

  const result = { imported, skipped, failed, total: lib.length };
  const s = loadSettings();
  saveSettings({
    ...s,
    mendeley: { ...s.mendeley, enabled: true, dbPath, userfilesPath, lastSyncAt: new Date().toISOString(), lastResult: result },
  });

  return { ...result, missingFile };
}
