import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { createModelClient, createServiceClient, getConfig, processDocumentUpload, reviewDocument } from "@lob/core";

/**
 * Batch-ingest a folder of documents into the repository.
 *
 *   npm run ingest -- "<dir>" [--review] [--limit=N]
 *
 * Walks <dir> recursively for PDF/DOCX/MD/TXT, uploads each (extract → Storage →
 * register with sha256 dedup → chunk + embed). With --review, also runs the AI
 * literature-note review on each newly-ingested document (slower).
 */

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith("--"));
const review = argv.includes("--review");
const limitArg = argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const mendeley = argv.includes("--mendeley") || argv.some((a) => a.startsWith("--mendeley-db="));
const mendeleyDbArg = argv.find((a) => a.startsWith("--mendeley-db="))?.split("=")[1];

interface MendeleyMeta { title: string; authors?: string[]; published?: string; venue?: string; doi?: string }

function findMendeleyDb(): string | undefined {
  if (mendeleyDbArg) return mendeleyDbArg;
  const dir = join(homedir(), "Library/Application Support/Mendeley Reference Manager/databases");
  let best: string | undefined;
  let bestN = -1;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".db") || f === "Databases.db") continue;
      const p = join(dir, f);
      try {
        const n = Number(execFileSync("sqlite3", [p, "SELECT count(*) FROM files_fts"]).toString().trim());
        if (n > bestN) { bestN = n; best = p; }
      } catch { /* not the right schema */ }
    }
  } catch { /* no Mendeley */ }
  return best;
}

/** Map each PDF file UUID -> citation metadata from Mendeley's library DB. */
function loadMendeleyMap(): Map<string, MendeleyMeta> {
  const map = new Map<string, MendeleyMeta>();
  const db = findMendeleyDb();
  if (!db) { console.log("Mendeley DB not found — falling back to filenames."); return map; }
  const sql = "SELECT f.id as id, d.title, d.authors, d.source, d.year, d.identifiers FROM files_fts f JOIN documents_fts d ON f.document_id = d.id WHERE d.title != ''";
  let rows: { id: string; title: string; authors: string; source: string; year: string | number; identifiers: string }[] = [];
  try {
    rows = JSON.parse(execFileSync("sqlite3", ["-json", db, sql], { maxBuffer: 128 * 1024 * 1024 }).toString() || "[]");
  } catch (e) {
    console.log(`Mendeley DB read failed (${(e as Error).message}) — falling back to filenames.`);
    return map;
  }
  for (const r of rows) {
    const year = r.year == null || r.year === "" ? undefined : String(r.year).replace(/\.0$/, "").trim();
    const doi = String(r.identifiers ?? "").match(/10\.\d{4,}\/\S+/)?.[0];
    map.set(r.id, {
      title: r.title.trim(),
      authors: r.authors?.trim() ? [r.authors.trim()] : undefined,
      published: year,
      venue: r.source?.trim() || undefined,
      doi,
    });
  }
  console.log(`Loaded ${map.size} citations from Mendeley.`);
  return map;
}

if (!dir) {
  console.error('usage: npm run ingest -- "<dir>" [--review] [--limit=N]');
  process.exit(1);
}

const EXTS = new Set([".pdf", ".docx", ".doc", ".md", ".txt"]);
const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".md": "text/markdown",
  ".txt": "text/plain",
};

function walk(d: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(d)) {
    if (entry.startsWith(".")) continue;
    const p = join(d, entry);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) out.push(...walk(p));
    else if (EXTS.has(extname(entry).toLowerCase())) out.push(p);
  }
  return out;
}

const config = getConfig();
const db = createServiceClient(config);
const model = createModelClient(config);

const meta = mendeley ? loadMendeleyMap() : new Map<string, MendeleyMeta>();

const files = walk(dir).slice(0, limit === Infinity ? undefined : limit);
console.log(`Found ${files.length} file(s) under ${dir}${review ? " (with AI review)" : ""}\n`);

let added = 0, duped = 0, failed = 0, reviewed = 0, enriched = 0;
for (let i = 0; i < files.length; i++) {
  const f = files[i]!;
  const name = f.split("/").pop()!;
  const tag = `[${i + 1}/${files.length}]`;
  try {
    const bytes = new Uint8Array(readFileSync(f));
    const m = meta.get(basename(name, extname(name)));
    if (m) enriched++;
    const r = await processDocumentUpload(db, model, {
      filename: name,
      mime: MIME[extname(name).toLowerCase()] ?? "application/octet-stream",
      bytes,
      title: m?.title,
      authors: m?.authors,
      published: m?.published,
      venue: m?.venue,
      doi: m?.doi,
    });
    if (r.deduped) { duped++; console.log(`${tag} dup   ${name}`); }
    else { added++; console.log(`${tag} ok    ${r.chunkCount} chunks  ${name}`); }
    if (review && !r.deduped) {
      await reviewDocument(db, model, config, { documentId: r.document.id });
      reviewed++;
    }
  } catch (e) {
    failed++;
    console.log(`${tag} FAIL  ${name}: ${(e as Error).message}`);
  }
}

console.log(`\nDone: ${added} new, ${duped} duplicate, ${failed} failed${mendeley ? `, ${enriched} with Mendeley metadata` : ""}${review ? `, ${reviewed} reviewed` : ""}.`);
