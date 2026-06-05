# Vault Note Indexing ("Sync vault") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the front end reflect Obsidian-authored notes — `/notes` mirrors the vault (cheap auto-reconcile on load), and a manual "Sync vault" button embeds notes into the repository so they're searchable/grounded — keeping the index in sync with the filesystem.

**Architecture:** A new `vault/scan.ts` in `@lob/core` with PURE helpers (frontmatter `type` reader, embed-eligibility filter, add/remove diff) plus two DB-orchestration functions: `reconcileNotes` (light: upsert new `notes` rows, delete rows + their note-documents for missing files) and `scanVault` (full: reconcile + embed changed notes via the existing `registerDocument`/`ingestDocument`, linked through a new `notes.document_id`). Server actions expose both; the UI adds a "Sync vault" button and a quiet reconcile on dashboard load.

**Tech Stack:** TypeScript ESM (NodeNext), Supabase (Postgres + pgvector), Ollama embeddings via the existing model client, Next.js 15 server actions. Tests: `node --import tsx --test`. Pure logic is unit-tested; DB flows are verified with a throwaway live script.

**Spec:** `docs/superpowers/specs/2026-06-05-vault-note-indexing-design.md`

---

## Conventions for every task
- Relative imports use `.js` specifiers (NodeNext). `@lob/core` is server-only.
- Unit tests run from `packages/core`: `npm test` (or one file: `node --import tsx --test "src/path/file.test.ts"`).
- Typecheck from repo root: `npm run typecheck`. Web build: `npm run build --workspace @lob/web`.
- NEVER run `supabase db reset` (it wipes the user's real data). Apply migrations with `supabase migration up --local`.
- Commit after each task with the message shown. You are already on branch `feat/vault-note-indexing`.

---

## Task 1: Migration — `notes.document_id`

**Files:**
- Create: `supabase/migrations/0003_note_documents.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0003_note_documents.sql — link a vault note to its embedded representation so
-- the "Sync vault" index can keep notes searchable and reconcile cleanly.
-- ON DELETE SET NULL: deleting the embedded document just unlinks the note.

alter table notes add column if not exists document_id uuid
  references documents(id) on delete set null;

create index if not exists notes_document_idx on notes (document_id);
```

- [ ] **Step 2: Apply non-destructively and verify (NEVER `db reset`)**

Run: `supabase migration up --local`
Expected: applies `0003_note_documents.sql` with no error, existing rows intact.

Verify (local DB container; host has no psql — use docker):
Run: `docker exec "$(docker ps --format '{{.Names}}' | grep supabase_db)" psql -U postgres -c "\d notes" | grep document_id`
Expected: a `document_id | uuid` line.
Run: `docker exec "$(docker ps --format '{{.Names}}' | grep supabase_db)" psql -U postgres -c "select count(*) from notes;"`
Expected: a count (data preserved; do not modify it).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_note_documents.sql
git commit -m "feat(db): notes.document_id link for vault note indexing"
```

---

## Task 2: Pure scan helpers (TDD)

**Files:**
- Create: `packages/core/src/vault/scan.ts`
- Test: `packages/core/src/vault/scan.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { frontmatterType, isEmbeddable, diffNotes } from "./scan.js";

test("frontmatterType reads the type scalar from frontmatter", () => {
  assert.equal(frontmatterType("---\ntype: literature\nstatus: x\n---\n# T"), "literature");
  assert.equal(frontmatterType('---\ntype: "source"\n---\nbody'), "source");
  assert.equal(frontmatterType("# no frontmatter"), undefined);
  assert.equal(frontmatterType("---\nstatus: x\n---\n"), undefined);
});

test("isEmbeddable skips source notes only", () => {
  assert.equal(isEmbeddable("literature"), true);
  assert.equal(isEmbeddable("draft"), true);
  assert.equal(isEmbeddable(undefined), true);
  assert.equal(isEmbeddable("source"), false);
});

test("diffNotes computes added and removed sets", () => {
  const d = diffNotes(["a.md", "b.md", "c.md"], ["b.md", "x.md"]);
  assert.deepEqual(d.added, ["a.md", "c.md"]);
  assert.deepEqual(d.removed, ["x.md"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test "src/vault/scan.test.ts"` (from `packages/core`)
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure helpers in `scan.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test "src/vault/scan.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vault/scan.ts packages/core/src/vault/scan.test.ts
git commit -m "feat(vault): pure scan helpers (frontmatterType, isEmbeddable, diffNotes)"
```

---

## Task 3: Markdown file walker (TDD)

**Files:**
- Modify: `packages/core/src/vault/paths.ts`
- Test: `packages/core/src/vault/paths.test.ts`

- [ ] **Step 1: Add the failing test** (append to `paths.test.ts`; add `listVaultMarkdown` to the existing `./paths.js` import)

```ts
import { listVaultMarkdown } from "./paths.js";

test("listVaultMarkdown returns non-hidden .md files relative to root, sorted", () => {
  const root = makeVault();
  mkdirSync(join(root, "Sub"), { recursive: true });
  mkdirSync(join(root, ".obsidian"), { recursive: true });
  writeFileSync(join(root, "a.md"), "# a");
  writeFileSync(join(root, "Sub", "b.md"), "# b");
  writeFileSync(join(root, "Sub", "c.txt"), "not md");
  writeFileSync(join(root, ".obsidian", "hidden.md"), "# hidden");
  try {
    const files = listVaultMarkdown(root);
    assert.deepEqual(files, ["Sub/b.md", "a.md"].sort());
    assert.ok(!files.some((f) => f.includes(".obsidian")));
    assert.ok(!files.some((f) => f.endsWith(".txt")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Note: `writeFileSync` is already imported in `paths.test.ts`? It is NOT by default — the file imports `mkdirSync, mkdtempSync, rmSync`. Add `writeFileSync` to that `node:fs` import in the test file.

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test "src/vault/paths.test.ts"`
Expected: FAIL — `listVaultMarkdown` not exported.

- [ ] **Step 3: Implement `listVaultMarkdown` in `paths.ts`** (add at the end; `readdirSync`, `join`, `assertVaultRoot` are already imported/defined)

```ts
/**
 * List every non-hidden Markdown file in the vault, as vault-relative POSIX
 * paths, sorted. Companion to listVaultTree (which lists folders).
 */
export function listVaultMarkdown(root: string): string[] {
  const realRoot = assertVaultRoot(root);
  const out: string[] = [];
  const walk = (absDir: string, rel: string) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(absDir, e.name), childRel);
      else if (e.isFile() && /\.md$/i.test(e.name)) out.push(childRel);
    }
  };
  walk(realRoot, "");
  return out.sort();
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test "src/vault/paths.test.ts"`
Expected: PASS (all paths tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vault/paths.ts packages/core/src/vault/paths.test.ts
git commit -m "feat(vault): listVaultMarkdown file walker"
```

---

## Task 4: DB orchestration — `reconcileNotes` + `scanVault`

**Files:**
- Modify: `packages/core/src/vault/scan.ts`
- Modify: `packages/core/src/index.ts`

No unit test (stateful DB flow — verified live in Task 7, per the project's verification discipline). Verify with `npm run typecheck`.

- [ ] **Step 1: Add imports + the two functions to `scan.ts`**

At the top of `scan.ts` add:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";
import type { ModelClient } from "../embeddings/client.js";
import { requireVaultRoot } from "../config.js";
import { listVaultMarkdown } from "./paths.js";
import { readNote } from "./notes.js";
import { registerDocument, ingestDocument, sha256 } from "../rag/ingest.js";
```

Append:
```ts
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
    if (docIds.length) await db.from("documents").delete().in("id", docIds);
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
```

- [ ] **Step 2: Export from the index**

In `packages/core/src/index.ts`, add (anywhere among the exports):
```ts
export * from "./vault/scan.js";
```
Note: `vault/index.js` may already barrel-export the vault modules. Check `packages/core/src/vault/index.ts` — if it re-exports siblings, add `export * from "./scan.js";` there INSTEAD to match the pattern; otherwise add to the top-level `index.ts`. Do whichever matches the existing convention; ensure `frontmatterType`, `reconcileNotes`, `scanVault`, `ScanSummary` are reachable from `@lob/core`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Confirm existing tests still pass**

Run: `npm test` (from `packages/core`)
Expected: all pass (the new pure tests + prior suite).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vault/scan.ts packages/core/src/index.ts packages/core/src/vault/index.ts
git commit -m "feat(vault): reconcileNotes + scanVault (index notes; embed non-source)"
```
(Only `git add` `vault/index.ts` if you modified it.)

---

## Task 5: Server actions

**Files:**
- Modify: `apps/web/app/actions.ts`

- [ ] **Step 1: Add the actions** (merge imports into the existing `@lob/core` import block — `getConfig`, `createServiceClient`, `createModelClient` are already imported; add `reconcileNotes`, `scanVault`, and the type `ScanSummary`)

```ts
export type { ScanSummary };

export async function reconcileNotesAction(): Promise<void> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey || !config.vault.root) return;
  try {
    await reconcileNotes(createServiceClient(config), config);
  } catch {
    // Light reconcile is best-effort; never surface as a hard error on load.
  }
}

export async function scanVaultAction(): Promise<ScanSummary> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey || !config.vault.root) {
    return { added: 0, removed: 0, embedded: 0, skipped: 0, failed: 0 };
  }
  const db = createServiceClient(config);
  const model = createModelClient(config);
  return scanVault(db, model, config);
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @lob/web`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/actions.ts
git commit -m "feat(web): scanVaultAction + reconcileNotesAction"
```

---

## Task 6: UI — Sync button + dashboard reconcile

**Files:**
- Create: `apps/web/components/notes/sync-vault-button.tsx`
- Modify: `apps/web/app/notes/page.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1: Create the client button** `apps/web/components/notes/sync-vault-button.tsx`

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scanVaultAction, type ScanSummary } from "@/app/actions";

export function SyncVaultButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      try {
        const s = await scanVaultAction();
        setSummary(s);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md border border-input bg-secondary px-3 text-sm text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync vault"}
      </button>
      {summary ? (
        <span className="text-xs text-muted-foreground">
          +{summary.added} new · {summary.removed} removed · {summary.embedded} embedded
          {summary.failed ? ` · ${summary.failed} failed` : ""}
        </span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
```
(Confirm the Tailwind tokens — `border-input`, `bg-secondary`, `text-secondary-foreground`, `bg-accent`, `text-destructive` — match the project by checking `apps/web/components/ui/button.tsx`; adjust to the real tokens if different.)

- [ ] **Step 2: Add the button to `/notes`** — `apps/web/app/notes/page.tsx`

Read the file first. It's a server component listing notes. Import the button and render it in the header area (next to the page title). Example edit — add the import:
```tsx
import { SyncVaultButton } from "@/components/notes/sync-vault-button";
```
and place `<SyncVaultButton />` in the header row (e.g. wrap the existing `<h1>`/description and the button in a `flex items-center justify-between` container). Keep the existing notes list untouched.

- [ ] **Step 3: Reconcile on dashboard load + a dashboard button** — `apps/web/app/page.tsx`

The dashboard is a server component. Import the action and call it (best-effort) before rendering so `/notes` is fresh:
```tsx
import { reconcileNotesAction } from "@/app/actions";
```
Inside `Dashboard()`, after `const report = await doctor();` (and after the onboarding redirect), add:
```tsx
  // Keep /notes mirroring the vault (cheap, best-effort; never blocks render).
  await reconcileNotesAction();
```
`reconcileNotesAction` already swallows its own errors, so this is safe. (It returns void.)

Also surface the full sync on the dashboard: the dashboard already renders `NavCard`s. The `SyncVaultButton` is a client component and can be dropped into the server page. Add it near the "How to use" header link area, e.g. inside the existing header `<div className="ml-auto flex items-center gap-3">`:
```tsx
import { SyncVaultButton } from "@/components/notes/sync-vault-button";
// ...
<SyncVaultButton />
```
Place it before the `Badge`. Keep it compact.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck`
Run: `npm run build --workspace @lob/web`
Expected: both succeed; `/notes` and `/` build.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/notes/sync-vault-button.tsx apps/web/app/notes/page.tsx apps/web/app/page.tsx
git commit -m "feat(web): Sync vault button (/notes + dashboard) + reconcile on load"
```

---

## Task 7: Live verification + docs

**Files:**
- Create (throwaway): `scripts/verify-scan.mts` (deleted after)
- Modify: `README.md`, `docs/USAGE.md`, `docs/FAQ.md`, `CLAUDE.md`

- [ ] **Step 1: Preconditions** — `supabase status` running; `ollama list` shows `nomic-embed-text` + `gemma4`; `~/.localopenbrain/settings.json` has a `vault.root`.

- [ ] **Step 2: Write the throwaway verification script** `scripts/verify-scan.mts`

```ts
// scripts/verify-scan.mts — npx tsx scripts/verify-scan.mts
import { getConfig, requireSupabase, createServiceClient, createModelClient,
  reconcileNotes, scanVault, ragQuery } from "../packages/core/src/index.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const config = getConfig();
requireSupabase(config);
const db = createServiceClient(config);
const model = createModelClient(config);
const root = config.vault.root!;
const dir = "ScanVerify_tmp";
const rel = `${dir}/Idea.md`;
mkdirSync(join(root, dir), { recursive: true });
writeFileSync(join(root, dir, "Idea.md"),
  "---\ntype: draft\n---\n# Idea\n\nWidget calibration drift can be corrected with a Kalman filter.");

const r1 = await reconcileNotes(db, config);
console.log("reconcile:", r1);
const s1 = await scanVault(db, model, config);
console.log("scan:", s1);
if (s1.embedded < 1) throw new Error("expected at least 1 embedded note");

const hits = await ragQuery(db, model, "Kalman filter calibration drift", { limit: 5, threshold: 0.1 });
const found = hits.some((h) => /Kalman/i.test(h.text));
console.log("ragQuery found the note:", found);
if (!found) throw new Error("note content not retrievable after scan");

// Delete the file, reconcile, assert the note row + its document are gone.
rmSync(join(root, dir), { recursive: true, force: true });
const r2 = await reconcileNotes(db, config);
console.log("reconcile after delete:", r2);
const { data: leftover } = await db.from("notes").select("id").eq("vault_path", rel);
if ((leftover ?? []).length) {
  await db.from("notes").delete().eq("vault_path", rel);
  throw new Error("note row not reconciled on delete");
}
console.log("OK — scan/search/reconcile verified and cleaned up");
```

- [ ] **Step 3: Run it**

Run: `npx tsx scripts/verify-scan.mts`
Expected: prints reconcile/scan summaries, `ragQuery found the note: true`, reconcile-after-delete removes the row, then "OK — …". Allow ~1 minute (one embed call).

- [ ] **Step 4: Confirm cleanup + delete the script**

Run: `ls "$(node -e "console.log(require('os').homedir())")" >/dev/null 2>&1; rm scripts/verify-scan.mts`
Also confirm `ScanVerify_tmp` is gone from the vault (the script removed it).

- [ ] **Step 5: Full suite + typecheck**

Run (repo root): `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Docs**

**README.md** — add to the Web routes table description for `/notes` (or a bullet): note that `/notes` mirrors the vault and a "Sync vault" button indexes + embeds Obsidian notes. Add a "What it does" bullet:
```
- **Vault note indexing** — your Obsidian notes (even ones written directly in Obsidian) show up in `/notes` and, with one **Sync vault** click, are embedded so `/ask`, `/search`, and agents can ground in them.
```

**docs/USAGE.md** — add a short subsection after the notes/reuse section:
```
## Syncing your Obsidian notes

`/notes` mirrors your vault — notes you write directly in Obsidian appear automatically (a light
reconcile runs when the app loads). Click **Sync vault** (on `/notes` or the dashboard) to also embed
your notes into the repository so they become searchable in `/search` and usable as grounding by
`/ask` and agents. Re-syncing only re-embeds notes whose content changed. Deleting a note in Obsidian
removes it from the index on the next load.
```

**docs/FAQ.md** — add under the existing "Notes & traceability" (or a new short section):
```
**Do notes I write directly in Obsidian show up?**
Yes. `/notes` mirrors the vault on app load. Click **Sync vault** to also embed them so they're
searchable and usable as grounding. (Auto-generated source pointer notes are skipped from embedding.)
```

**CLAUDE.md** — under the vault bullet in the architecture tree, note `scan.ts`:
```
    vault/            paths (guard + tree/markdown walkers), frontmatter, bibliography, notes, git, scan (note indexing)
```
and one sentence near the data-model note:
```
Vault note indexing (`vault/scan.ts`) mirrors the vault into the `notes` table on load and, via
"Sync vault", embeds notes (linked by `notes.document_id`) so user-authored notes are searchable.
```

- [ ] **Step 7: Build + commit**

Run: `npm run build --workspace @lob/web` → succeeds.
```bash
git add README.md docs/USAGE.md docs/FAQ.md CLAUDE.md
git commit -m "docs: vault note indexing (Sync vault)"
```

---

## Final verification (after all tasks)
- [ ] `npm test` — all pass.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build --workspace @lob/web` — clean; `/notes`, `/` build.
- [ ] `supabase migration up --local` — `0003` applied (NEVER `db reset`).
- [ ] Manual smoke: create a `.md` directly in the vault → open the app → it appears in `/notes`; click **Sync vault** → it's findable in `/search`; delete the file → it disappears from `/notes` on reload.

## Notes for the implementer
- **Service client + config helpers** (`createServiceClient`, `createModelClient`, `getConfig`) are already imported in `actions.ts` — merge, don't duplicate.
- **No fake-DB unit tests** for `reconcileNotes`/`scanVault` — the project verifies DB flows with the live throwaway script (Task 7). Pure helpers (Task 2) and the walker (Task 3) are unit-tested.
- **Incremental embed** keys on `notes.metadata.indexed_sha`; unchanged notes are skipped, so re-syncing a large vault is cheap.
- **`registerDocument` dedups by sha256** — two notes with byte-identical content would share one document row; acceptable edge case.
