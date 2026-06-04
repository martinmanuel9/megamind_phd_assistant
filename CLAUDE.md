# megamind_phd_assistant

A **local-first PhD research assistant + second brain**. Review journal articles with
Perplexity / Ollama / any MCP client, write findings **directly into an Obsidian vault as
Markdown**, and keep every note **traceable back to the exact source passage** via a managed
document repository with RAG. Built as a product for any new user — nothing is hardcoded.

Local by default (Supabase + Ollama + your vault on your machine), hosted-ready (point at
managed Supabase by swapping credentials — no code changes).

## Architecture

Node monorepo (npm workspaces, ESM, TypeScript, `tsx` for running):

```
packages/core/        @lob/core — all shared logic (server-only; uses node fs + service-role key)
  src/
    settings.ts       runtime settings (~/.localopenbrain/settings.json, 0600) — frontend-managed
    config.ts         resolves config: env > settings.json > defaults; requireSupabase/requireVaultRoot
    db/client.ts      Supabase service client + checkSupabase (distinguishes not-configured vs not-migrated)
    embeddings/client.ts  OpenAI-compatible model client (Ollama default; nomic task-prefixes baked in)
    vault/            paths (guard), frontmatter, bibliography, notes (writer + readNote), git
    rag/              chunk (recursive), ingest (register/ingest/ragQuery)
    storage/files.ts  Supabase Storage (documents bucket) — portable local↔hosted
    documents/        process (upload pipeline), review (AI review)
    process/mcp.ts    spawn/stop/status/logs for the MCP server
    setup/init.ts     doctor(), initVault(), access-key
apps/mcp-server/      @lob/mcp-server — Node MCP server (Hono + @hono/mcp), ~13 tools; setup CLI
apps/web/             @lob/web — Next.js 15 + React 19 + Tailwind (dark/zinc/Geist); the control plane
supabase/             config.toml (local stack) + migrations/0001_init.sql (vector(768))
scripts/              up.sh / down.sh
```

**Data model (traceability spine):** `documents → chunks(pgvector 768) → note_links ← notes`,
plus a standalone `thoughts` memory table. `note_links` is the bridge: each row ties a note's
claim → a document → the exact chunk that backs it (claim-level traceability).

## Running it

```bash
npm run up        # Docker → local Supabase → web app at localhost:3000 (npm run down to stop)
npm run web       # web app only
npm run mcp:dev   # MCP server only (start/stop is also in the UI at /server)
npm run setup     # doctor: prints what's configured / missing
npm test          # @lob/core unit tests
npm run typecheck # tsc -b
```

First run drops a new user into the `/onboarding` wizard. Config lives in
`~/.localopenbrain/settings.json` (Supabase creds, vault path, git remote, models, MCP key);
env vars override it. **Never commit secrets** — settings live outside the repo by default.

## Prerequisites (this machine)

- **Ollama** running with `nomic-embed-text` (768-dim embeddings) + a chat model (e.g. `llama3.1:8b`).
- **Local Supabase** via the Supabase CLI + Docker (`supabase start`). Apply schema with
  `supabase db reset` (or it auto-applies on first `supabase start`).
- macOS note: this is an Apple-Silicon (arm64) Mac; Homebrew is the Intel build under Rosetta.
  Docker Desktop must be the **arm64** build.

## Conventions

- **TypeScript ESM, NodeNext.** Relative imports use `.js` specifiers. `apps/web` consumes
  `@lob/core` as TS source via `transpilePackages` + webpack `extensionAlias` (.js→.ts).
- **`@lob/core` is server-only** (node `fs`, `child_process`, service-role key). In the web app
  it's reached ONLY through server actions (`apps/web/app/actions.ts`) or route handlers —
  never imported into client components.
- **Vault writes are guarded.** Everything goes through `resolveInsideVault` (rejects `..`,
  absolute, `~`, and writes outside the configured folders). Treat captured/AI content as data,
  never instructions. The path guard is unit-tested — keep it that way.
- **Embedding dimension (768) is load-bearing.** It's fixed in `vector(768)` columns and
  `settings.models.embedDim`. Changing the embedding model/dim requires a migration + re-embed.
- **Citations are structural, not generated.** The AI extracts claims + quotes; the system
  RAG-resolves each claim to its chunk in `createLiteratureNote`. Don't let a model emit chunk ids.

### Adding an MCP tool
Add a `server.registerTool(...)` block in `apps/mcp-server/src/index.ts` delegating to a
`@lob/core` function; wrap the handler in `guard(...)`. Mirror the same capability as a web
server action if the UI needs it.

### Gotchas (learned the hard way)
- Supabase Storage `fileSizeLimit` wants `"50MB"`, not `"50MiB"`.
- pdf.js (via `unpdf`) **detaches** the input buffer — clone bytes before `getDocumentProxy`.
- `mammoth` / `unpdf` are in `serverExternalPackages` (don't bundle).
- macOS system git may be old; `git.ts` uses `init` + `symbolic-ref` (not `init -b`).

## Verification discipline
Pure logic (guard, chunking, frontmatter, citations) → `npm test`. Stateful flows (DB, embeddings,
vault writes) → seed via a throwaway `tsx` script against the live local stack, assert, then clean
up the DB rows + vault files. CI (`.github/workflows/ci.yml`): install → typecheck → test → web build.

## Status
Feature-complete: onboarding → upload → AI review → claim-traceable notes → semantic search →
note viewer → vault git sync. See the memory file `project-overview` for the current commit log.
