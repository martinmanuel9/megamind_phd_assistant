# Megamind — Project Brief

> Product name: **Megamind PhD Assistant**. Repo: `localopenbrainobsidian`.

## What this is
A local-first **PhD research assistant + second brain** that recreates and productionizes the
`open-brain` capability around Obsidian. Review journal articles with Perplexity / Ollama / any
MCP client, write findings directly into an Obsidian vault as Markdown, and keep every note
traceable back to the exact source passage via a managed document repository with RAG.

Built generically for any new user — local by default, hosted-ready.

## Tech stack (as built)
- **Monorepo:** npm workspaces, TypeScript (ESM/NodeNext), `tsx`.
- **Core (`@lob/core`):** shared server-only logic — settings/config, Supabase client, an
  OpenAI-compatible model client (Ollama default), vault tooling, RAG, Storage, MCP process mgmt.
- **MCP server (`@lob/mcp-server`):** Node + Hono + `@hono/mcp`, ~13 research tools.
- **Web (`@lob/web`):** Next.js 15 + React 19 + Tailwind (dark/zinc/Geist) — the control plane.
- **Data:** local Supabase (Postgres + pgvector + Storage), schema `documents → chunks →
  note_links ← notes` + `thoughts`. Embeddings: `nomic-embed-text` (768-dim) via Ollama.

## Core loop
`npm run up` → onboarding → upload paper → AI review → claim-traceable note in Obsidian →
semantic search → click claim → exact source passage → vault git sync. All browser-driven.

## Status
Feature-complete and pushed to GitHub. See `CLAUDE.md` for architecture/conventions and the
`project-overview` memory file for the commit log and remaining optional polish.
