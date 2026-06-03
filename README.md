# localopenbrainobsidian

A local-first **PhD research assistant + second brain**. Review journal articles
with Perplexity / Ollama / any MCP client, write the findings **directly into
your Obsidian vault as Markdown**, and keep every note **traceable back to the
exact source passage** through a managed document repository with RAG.

> Built as a product for any new user — nothing is hardcoded, and it runs
> **fully local** (Supabase + Ollama + your vault on your machine). The
> architecture is **hosted-ready**: point it at managed Supabase later by
> swapping credentials, with no code changes.

## What it does

- **Document repository (Supabase).** Register source documents (PDFs, articles),
  chunk + embed them, and search passages semantically (RAG).
- **Traceable notes (Obsidian).** Generate literature notes and literature-review
  syntheses straight into your vault. Every claim links to the **exact passage**
  (chunk) that backs it — dissertation-grade traceability, both directions
  (note → source, and source → every note that cites it).
- **Model-agnostic.** An OpenAI-compatible client points at local Ollama by
  default; swap to Perplexity / OpenAI with a base-URL + key change.
- **Second-brain memory.** Capture standalone thoughts and recall them
  semantically.
- **Vault git.** Connect a GitHub remote and commit / pull / push / sync from the
  app.

## Architecture

```
Frontend (Next.js, P2)  ── manages ──►  settings.json (Supabase creds, vault, git, models)
        │
        ├── MCP server (Node)  ◄── Perplexity / Claude / Codex / your UI (MCP)
        │       ├─ memory + RAG tools
        │       └─ traceable note writers ──►  Obsidian vault (.md, git)
        │
        └── Ollama (embeddings: nomic-embed-text 768d, chat: llama3.1)
                                   │
                Supabase: documents → chunks(pgvector) → note_links ← notes · thoughts
```

The traceability spine is `documents → chunks → note_links ← notes`
(see `supabase/migrations/0001_init.sql`).

## Repo layout

```
packages/core/        @lob/core — settings, config, db, embeddings, vault, rag, setup
apps/mcp-server/      @lob/mcp-server — the Node MCP server + setup CLI
apps/web/             Next.js frontend (Phase 2)
supabase/migrations/  schema (vector(768))
```

## Getting started (new user)

1. **Install**
   ```bash
   npm install
   ```
2. **Local models** — install [Ollama](https://ollama.com) and pull the models:
   ```bash
   ollama pull nomic-embed-text     # embeddings (768-dim)
   ollama pull llama3.1:8b          # chat / metadata
   ```
3. **Supabase (local-first)** — install the
   [Supabase CLI](https://supabase.com/docs/guides/local-development), make sure
   Docker is running, then from the repo root:
   ```bash
   supabase start                 # Postgres+pgvector, Storage, Studio (Docker)
   supabase db reset              # applies supabase/migrations/0001_init.sql
   supabase status                # shows your local API URL + service-role key
   ```
   Everything (documents, vectors, files, memory) stays on your machine.
   **Upgrading to managed Supabase later** is just swapping the URL + keys in
   settings and running the same migration — no code changes.
4. **Configure** — set your Supabase URL + service-role key and vault path.
   Until the frontend (P2) lands, set them via env (`.env`, see `.env.example`)
   or directly in `~/.localopenbrain/settings.json`.
5. **Check your setup**
   ```bash
   npm run setup        # prints exactly what's configured / missing
   ```
6. **Run the MCP server**
   ```bash
   npm run mcp:dev      # prints the access key + client URL
   ```
7. **Connect a client** (Perplexity/Claude/etc.) to
   `http://127.0.0.1:8787?key=<access-key>`.

## MCP tools

| Tool | Purpose |
|------|---------|
| `register_document` / `ingest_document` | add a source doc, then chunk+embed it |
| `rag_query` | semantic search over passages (returns chunk ids to cite) |
| `list_documents` | browse / dedup the repository |
| `create_source_note` | vault note representing a document |
| `create_literature_note` | literature note / synthesis with **claim-level** source links |
| `trace_document` | every note that cites a given document |
| `generate_bibliography` | markdown / APA / Chicago citations |
| `capture_thought` / `search_thoughts` | second-brain memory |
| `vault_status` / `vault_sync` | git status + commit/pull/push |

## Status

Phase 1 (backend foundation) — in progress. Phase 2 adds the Next.js frontend
(setup wizard for Supabase creds, document upload + viewer, MCP start/stop, and
vault git management).
