# Vault Note Indexing ("Sync vault") — Design

**Status:** Approved for planning
**Date:** 2026-06-05
**Author:** Martin Lopez (with Claude)

## Summary

Make the front end reflect the notes that exist in the Obsidian vault — including
notes the user authors **directly in Obsidian** (not just notes the app wrote) —
and make them **searchable/grounded** in the repository. Today `/notes` is backed
by the Supabase `notes` table, which only contains notes the app itself created;
a `.md` file written directly in Obsidian never appears. This feature scans the
vault, registers notes so they show in `/notes`, embeds their content so `/ask`,
`/search`, and agents can ground in them, and keeps the index in sync with the
filesystem (the vault on disk is the source of truth).

## Goals

- `/notes` mirrors the Obsidian vault (notes authored in Obsidian appear).
- The user's notes become **searchable + citable** (embedded into the repository).
- A prominent **"Sync vault"** button (dashboard + `/notes`) runs the full index.
- The index stays in sync: notes deleted/renamed in Obsidian are reconciled.
- Cheap freshness: `/notes` reflects the vault on app load without manual action.

## Decisions (from brainstorming)

- **Depth:** visible **+ searchable** (embed note content into the repository).
- **Scope:** the whole vault — every non-hidden `.md` under the vault root.
- **Reconcile:** keep in sync — re-scan deletes rows for files that no longer exist.
- **Trigger:** a manual **"Sync vault"** button (full index incl. embedding) **plus**
  an automatic *light* reconcile on app load.
- **Naming:** the manual full-index button is labeled **"Sync vault."**

## The two-tier model (key design point)

Embedding the whole vault on every app load would be slow, so the scan has two
tiers:

1. **Light reconcile — automatic on dashboard load (cheap, no embedding).**
   Walk the vault, upsert a `notes` row per `.md` (keyed by vault path), delete
   rows whose files are gone. Keeps `/notes` mirroring Obsidian with no model
   calls.

2. **Full index — the "Sync vault" button (heavier).** Runs the light reconcile,
   then **embeds** note content into the repository so it's searchable/grounded.
   Incremental: only (re)embeds notes whose content changed since the last index
   (by sha256). Reports a summary: e.g. `+12 new, 3 updated, 1 removed, 9 embedded`.

## What gets embedded

Every scanned note **except** auto-generated **source** notes (frontmatter
`type: source`) — those are thin citation pointers and would be search noise.
Literature, synthesis, draft, and user-authored notes are embedded.

## Data model

The `notes` table already has a unique `vault_path` (the upsert key) plus
`title`, `note_type`, `topics`, `metadata`, timestamps. One addition:

```sql
-- 0003_note_documents.sql
alter table notes add column if not exists document_id uuid
  references documents(id) on delete set null;
```

`notes.document_id` links a note to its embedded representation (a `documents`
row of `kind:"note"` with its chunks). This makes re-indexing update the
embedding in place (no duplicate documents) and lets reconciliation drop a note's
embedded copy when its file disappears.

**Deletion integrity:** reconcile deletes `notes` rows for missing files. The
plan must ensure dependent rows are handled — `note_links.note_id` and the linked
note-`documents`/`chunks` — via `on delete cascade` (verify/add in the migration)
or explicit cleanup, so a delete never fails on a foreign key.

## Components

### `@lob/core`
- **`vault/scan.ts`** — the scanner:
  - `reconcileNotes(db, config)` — light tier: list non-hidden `.md` via the
    existing vault-walk, derive `{title, note_type}` from frontmatter/filename,
    upsert `notes` rows by `vault_path`, delete rows for files no longer present.
    Returns `{added, updated, removed}`.
  - `scanVault(db, model, config)` — full tier: run `reconcileNotes`, then for
    each note except `type: source`, register/refresh a `documents` row
    (`kind:"note"`) and embed it (reusing `registerDocument`/`ingestDocument`),
    linking `notes.document_id`; skip notes whose content sha256 is unchanged.
    Returns `{added, updated, removed, embedded, skipped, failed}`.
  - A small frontmatter helper to read `type` (reuse `vault/frontmatter.ts`
    parsing if present; else a minimal front-matter `type:` reader).
- Reuses `listVaultTree`/`assertVaultRoot` (vault walk), `readNote`,
  `registerDocument`, `ingestDocument`, `sha256`.

### Server actions (`apps/web/app/actions.ts`)
- `scanVaultAction(): Promise<ScanSummary>` — manual full index.
- `reconcileNotesAction(): Promise<void>` — light reconcile (called on load).

### Web UI
- **"Sync vault"** button on `/notes` (and a compact one on the dashboard) that
  calls `scanVaultAction` and shows the summary + a spinner while running.
- The dashboard (`/`) calls `reconcileNotesAction()` on load (server component,
  fire-and-forget / awaited cheaply) so `/notes` is fresh. Must be cheap and must
  never block render on failure (wrap in try/catch).

## Data flow

1. User writes `Ideas/Outline.md` directly in Obsidian.
2. Opens the app → dashboard load runs `reconcileNotes` → a `notes` row appears →
   `Outline` shows in `/notes` (readable in-app).
3. User clicks **Sync vault** → `scanVault` embeds `Outline` (and any other
   changed notes) into the repository → it's now returned by `/search` and used
   as grounding by `/ask` and agents.
4. User deletes `Outline.md` in Obsidian → next load's reconcile removes its
   `notes` row (and the button drops its embedded document).

## Error handling

- A note that fails to parse or embed is **skipped and counted** (`failed`),
  never aborting the whole scan.
- Missing/invalid vault root → clear `VaultRootError`, surfaced in the UI.
- Supabase not configured → actions no-op (return empty summary), consistent with
  other actions.
- Light reconcile failure on dashboard load is swallowed (logged) so it never
  breaks the page.

## Testing

- **Unit (`npm test`):** frontmatter `type` detection; the embed-eligibility
  filter (skip `type: source`); the add/update/remove **diff** of `reconcileNotes`
  against a temp vault (create files, scan, mutate, re-scan, assert counts) using
  a fake DB; `scanVault`'s incremental skip (unchanged sha256 → not re-embedded)
  with a **stub model**.
- **Stateful (throwaway `tsx`):** against the live stack — author a temp note,
  `scanVault`, assert a `documents` row + chunks exist and `/search`-style
  `ragQuery` finds it, then delete the file, reconcile, assert cleanup. Remove
  DB rows + temp files after.

## Non-goals (v1)

- Git commit/push from this button (Sync = indexing only; `/vault` keeps the git
  flow).
- Watching the filesystem for live changes (scan is on-load + on-demand).
- Embedding `source` pointer notes.
- Two-way edit (the app reads notes; it doesn't rewrite Obsidian-authored files).

## Open questions

None — all resolved during brainstorming.
