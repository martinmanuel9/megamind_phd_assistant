# Megamind

> Megamind PhD Assistant &nbsp;·&nbsp; repo: `megamind_phd_assistant`

A local-first **PhD research assistant + second brain**. Review journal articles with
Perplexity / Ollama / any MCP client, write the findings **directly into your Obsidian vault as
Markdown**, and keep every note **traceable back to the exact source passage** through a managed
document repository with RAG.

> Runs **fully local** (Supabase + Ollama + your vault on your machine) and is **hosted-ready** —
> point it at managed Supabase by swapping credentials, no code changes. Nothing is hardcoded;
> a new user is guided through setup on first launch.

![Dashboard](docs/screenshots/dashboard.png)

## What it does

- **Document repository** — upload PDFs/Word/Markdown (or sync your Mendeley library); they're
  parsed, chunked, embedded into Supabase + pgvector, and stored in Supabase Storage.
- **Claim-level traceability** — AI-review a paper or ask a question, and every claim in the
  resulting Obsidian note links to the **exact source passage** (chunk). Navigate note → passage,
  passage → document, document → every note that cites it.
- **RAG chat & search** — ask your library in natural language; a local model answers grounded in
  retrieved passages with inline citations, and you can save the answer as a traceable note.
- **Model-agnostic + hardware-aware** — OpenAI-compatible client (local Ollama by default). A
  built-in advisor detects the machine (RAM / GPU / VRAM) and recommends + one-click-pulls a model
  suited to agent workflows.
- **Connect any MCP client** — generated configs for Claude Code, Claude Desktop, Cursor, Codex,
  Perplexity.
- **Agentic review** — define persona agents (advisor, professor, peer reviewer, committee) and run Committee/Debate workflows over a draft; each agent's review and a synthesis are written into your Obsidian Vault, optionally grounded in a collection and optionally saved to the repository.
- **Vault note indexing** — your Obsidian notes (even ones written directly in Obsidian) show up in
  `/notes` and, with one **Sync vault** click, are embedded so `/ask`, `/search`, and agents can
  ground in them.
- **Autonomous** — scheduled Mendeley sync (in-app heartbeat or always-on launchd agent) and vault
  GitHub sync.

## Architecture

![Architecture](docs/diagrams/architecture.png)

<sub>Diagram source: [`docs/diagrams/architecture.mmd`](docs/diagrams/architecture.mmd) · regenerate with `npm run diagrams`.</sub>

The traceability spine is `documents → chunks → note_links ← notes` (see
`supabase/migrations/0001_init.sql`). The same `@lob/core` engine powers the web UI, the MCP
server, and the CLIs — so a paper uploaded in the browser and one registered by Perplexity are
identical, and "a grounded, cited claim" means the same thing everywhere.

## Screenshots

| Documents repository | Model advisor (hardware-aware) |
|---|---|
| ![Documents](docs/screenshots/documents.png) | ![Setup](docs/screenshots/setup.png) |

| Mendeley sync + scheduling | Connect MCP clients |
|---|---|
| ![Sync](docs/screenshots/sync.png) | ![Connect](docs/screenshots/connect.png) |

## Repo layout

```
packages/core/        @lob/core — settings, config, db, embeddings, vault, rag,
                      documents (process/review/ask), integrations/mendeley,
                      process (mcp/launchd), system/hardware, storage, setup
apps/mcp-server/      @lob/mcp-server — Node MCP server + CLIs (setup, ingest, sync)
apps/web/             @lob/web — Next.js 15 + React 19 + Tailwind dashboard
supabase/             config.toml (local stack) + migrations/0001_init.sql
```

## Quickstart

> **First time on this machine?** Follow **[INSTALL.md](INSTALL.md)** — it walks through downloading
> and installing every prerequisite (Node, Docker, Supabase CLI, Ollama) from scratch. The steps
> below assume those are already installed.

```bash
npm install
ollama pull nomic-embed-text          # embeddings (768-dim)
supabase start && supabase db reset   # local Postgres+pgvector+Storage + schema
npm run start:app                     # Docker → Supabase → web, opens https://research-assistant
```

`npm run start:app` (or double-click **`research-assistant.command`** on macOS) brings everything
up and opens the app at a clean hostname over HTTPS — **https://research-assistant**. It:

- maps `research-assistant → 127.0.0.1` in `/etc/hosts` (one-time sudo),
- runs the web app on a unique internal port (`8788`),
- fronts it with a [Caddy](https://caddyserver.com) reverse proxy that terminates **TLS with a
  locally-trusted cert** (`tls internal` + `caddy trust`), so the browser shows a valid padlock —
  no Node ever runs as root.

If Caddy/sudo isn't available it falls back to `http://research-assistant:8788`. Configure via
`.env` (`RA_HOST`, `RA_SCHEME=https|http`, `RA_PORT`, `RA_INTERNAL_PORT`; see `.env.example`) or
inline. (`npm run up` is the plain `localhost:3000` variant; `npm run down` stops Supabase + proxy.)

First launch opens the **/onboarding** wizard (Supabase → Models → Vault → GitHub). The
**Model advisor** (Setup) detects your hardware and pulls a suitable chat model with one click.

CLIs: `npm run setup` (health check) · `npm run ingest -- "<dir>" --mendeley` (batch import) ·
`npm run sync` (one-shot Mendeley sync) · `npm run mcp:dev` (MCP server).

## How to use

The everyday flow — add sources, turn them into traceable notes, then search and cite:

![Process flow](docs/diagrams/process-flow.png)

1. **Set up** (`/onboarding` on first launch, or `/setup`): connect Supabase, pick your vault,
   and let the **Model advisor** pull a local chat model that fits your machine.
2. **Add documents**: drag PDFs/Word/Markdown into **`/documents`**, or pull your reference library
   in **`/sync`** (Mendeley). Each is parsed, chunked, and embedded automatically.
3. **Turn sources into notes**: on a document hit **AI review** to generate a literature note where
   every claim links to its exact source passage — or use **`/ask`** to question your whole library
   and **Save as note**.
4. **Find & reuse**: **`/search`** ranks passages semantically; click a result to jump to the exact
   passage. **`/notes`** reads your generated notes. **`/vault`** commits + syncs them to GitHub.
5. **Use from your AI tools**: start the server in **`/server`**, grab a config from **`/connect`**,
   and Perplexity/Claude/Codex can call the same tools.

**In the app:** the dashboard links to the built-in **`/help`** guide (live setup checklist + this
workflow + common-task playbooks + route reference) and an **`/faq`** page. **More:** the full
walkthrough in **[docs/USAGE.md](docs/USAGE.md)** and the **[FAQ](docs/FAQ.md)**.

## Web routes

| Route | What |
|---|---|
| `/` | Dashboard — live system status + workspace nav |
| `/help` | In-app how-to guide — live setup checklist, workflow, use cases, route reference |
| `/faq` | Frequently asked questions |
| `/onboarding` | First-run setup wizard |
| `/setup` | Supabase, Vault, GitHub, Models + hardware-aware model advisor |
| `/ask` | RAG chat grounded in your library; save answers as traceable notes |
| `/search` | Semantic search across documents + memory |
| `/documents` (`/[id]`) | Upload, manage; viewer with click-through claim→passage traceability |
| `/notes` (`/[id]`) | Read your literature notes; **Sync vault** indexes Obsidian-authored notes |
| `/connect` | Copy-paste MCP configs for Claude/Perplexity/Codex/Cursor |
| `/sync` | Mendeley access, sync, cadence, always-on scheduling |
| `/server` | Start/stop the MCP server + live logs + auto-start |
| `/agents` | Persona reviewers & review workflows |
| `/agents/run` | Run a review; writes per-agent + synthesis notes to the Obsidian Vault |
| `/vault` | Vault git status + commit/sync |

## MCP tools

`register_document` · `ingest_document` · `rag_query` · `list_documents` ·
`create_source_note` · `create_literature_note` (claim-level links) · `trace_document` ·
`generate_bibliography` · `capture_thought` · `search_thoughts` · `vault_status` · `vault_sync`

## Stack

Node monorepo (TypeScript/ESM) · Next.js 15 / React 19 / Tailwind (dark) · Supabase (Postgres +
pgvector + Storage) · Ollama (`nomic-embed-text` embeddings, `gemma4`/`qwen2.5`/`gpt-oss` chat) ·
`@modelcontextprotocol/sdk` over Hono. Unit-tested core with GitHub Actions CI.

## License

MIT — see [LICENSE](LICENSE).
