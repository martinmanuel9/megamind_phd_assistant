# Using Megamind

A practical, end-to-end guide to the **Megamind PhD Assistant** — how to launch it, load
your research, generate traceable notes, and connect it to your AI tools.

---

## 1. Launch

```bash
npm run start:app
```

…or double-click **`research-assistant.command`** (macOS). This brings up Docker → local Supabase →
the web app and opens **https://research-assistant** (a local hostname with a trusted Caddy cert).
For plain localhost during development use `npm run web` (hot reload) → http://localhost:3000.

Stop with `Ctrl-C` (the web app); `npm run down` stops Supabase + the proxy.

---

## 2. First-run setup (`/onboarding`)

A brand-new launch routes you through a wizard. Each step verifies live status before you continue:

1. **Supabase** — paste your project URL + service-role key (defaults to the local stack at
   `http://127.0.0.1:54321`). It tests the connection and checks the schema is migrated.
2. **Models** — the OpenAI-compatible endpoint (local Ollama by default). The **Model advisor**
   on `/setup` detects your RAM/GPU and recommends an agent-capable chat model — click **Pull** to
   download it (live progress) and **Use** to make it the chat model.
3. **Vault** — the absolute path to your Obsidian vault; saving scaffolds the `Research/…` folders.
4. **GitHub** *(optional)* — connect a remote so your vault can be versioned + synced.

You can revisit any of this anytime under **`/setup`**. Settings live in
`~/.localopenbrain/settings.json` (secrets, 0600) — the UI writes it; env vars override it.

---

## 3. Add documents to the repository

Two intake paths, both ending in *parsed → chunked → embedded → searchable*:

- **Upload** (`/documents`): drag-and-drop PDFs, Word docs, or Markdown. Optional batch metadata
  (authors, source URL, published date) applies to the upload.
- **Mendeley sync** (`/sync`): connect your local Mendeley library (auto-detected). **Sync now**
  imports papers new since the last sync (matched by content hash, so re-syncing is cheap). Set a
  cadence for automatic syncing, and optionally **Enable background sync** (a launchd agent that
  keeps syncing even when the app is closed).

Bulk import from any folder via CLI: `npm run ingest -- "/path/to/pdfs" --mendeley`.

---

## 4. Turn sources into traceable notes

This is the heart of Megamind — **every claim in a note links to the exact source passage**.

- **AI review** (`/documents` → a document → *AI review*): the local model reads the paper and
  writes a literature note with a summary and key claims, each grounded in a verbatim quote and
  linked to its source chunk. Auto-creates the source note so wikilinks resolve in Obsidian.
- **Ask** (`/ask`): ask a question across your whole library. The model answers grounded only in
  retrieved passages, with inline `[n]` citations. Hit **Save as Obsidian note** to keep the answer
  as a synthesis note with the same claim-level traceability.

Notes land in your vault as Markdown; read them in-app at **`/notes`** or open the vault in Obsidian.

---

## 5. Agentic review (agents & workflows)

Define reviewer **personas** and compose them into **workflows** on `/agents`. Two templates ship
ready to use: **Committee** (independent reviews + a synthesis) and **Debate** (Advocate → Challenger
→ Reviewer). On `/agents/run`, pick an artifact (a vault note, an uploaded Word/PDF/MD file, or pasted
text), choose a persona or workflow, pick the Obsidian Vault folder to write into (create one inline),
and optionally tick "add to open brain" to also ingest the artifact and/or reviews into the repository.
Each agent writes its own note; workflows add a synthesis note with a verdict and prioritized actions.

Organize the document repository into **collections** on `/documents` (a left-rail: create, rename,
move documents, filter). A persona's grounding can be scoped to a collection, so a reviewer cites only
the relevant sources. Uploads (and Mendeley imports, after syncing) can be assigned to a collection.

---

## 6. Find, verify, and reuse

- **Search** (`/search`): semantic search across document passages + captured memory, ranked by
  meaning. Click a result to open the source document scrolled to the exact passage.
- **Traceability** (`/documents/[id]`): a document's passages are shown with a **cited** badge where
  notes reference them; the **Traced claims** sidebar lets you click a claim to jump to its passage,
  and **Cited by** lists every note that draws from the document.
- **Vault & git** (`/vault`): see status and **Commit & sync** your notes to GitHub.

---

## 7. Connect your AI tools (MCP)

Megamind is also an **MCP server**, so external clients can use the same tools.

1. Start it in **`/server`** (Start, or enable **Auto-start on login**). The server also runs the
   scheduled Mendeley auto-sync heartbeat while it's up.
2. Open **`/connect`** and copy the config for your client — **Claude Code, Claude Desktop, Cursor,
   Codex, or Perplexity**. stdio-only clients use the bundled `mcp-remote` bridge; Claude Code can
   use the HTTP transport directly.
3. Restart the client. It can now `rag_query`, `create_literature_note`, `register/ingest_document`,
   `capture_thought`, and more — writing the same traceable notes into your vault.

---

## 8. Local vs. hosted

Everything runs locally by default (Supabase + Ollama + your vault). To move the data layer to
**managed Supabase** later, just paste the hosted project's URL + keys in `/setup` and run the same
migration — no code changes. Document files live in Supabase Storage, so they migrate with it.

---

## 9. Syncing your Obsidian notes

`/notes` mirrors your vault — notes you write directly in Obsidian appear automatically (a light
reconcile runs when the app loads). Click **Sync vault** (on `/notes` or the dashboard) to also embed
your notes into the repository so they become searchable in `/search` and usable as grounding by
`/ask` and agents. Re-syncing only re-embeds notes whose content changed. Deleting a note in Obsidian
removes it from the index on the next load.

---

## Troubleshooting

- **Dashboard shows a red item** — run `npm run setup` for a precise checklist, or check `/setup`.
- **UI didn't update after editing code** — `npm run start:app` serves a production build (it
  rebuilds when sources change, then restart it); use `npm run web` for live hot reload.
- **Supabase "not migrated"** — run `supabase db reset` (applies `supabase/migrations/0001_init.sql`).
- **Models unreachable** — make sure Ollama is running and the chat/embedding models are pulled.
- **Mendeley not detected** — set the DB + userfiles paths in `/sync` (auto-detect assumes the
  default macOS install). Requires the `sqlite3` CLI.
- **Changed embedding model** — the vector dimension is fixed at 768; a different model/dimension
  requires updating the schema and re-embedding.
