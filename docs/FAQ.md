# Megamind — FAQ

Frequently asked questions. New here? Start with the in-app **How to use** guide (`/help`) or the
full walkthrough in [USAGE.md](USAGE.md). To install from scratch, see [../INSTALL.md](../INSTALL.md).

## Getting started & configuration

**What do I have to configure before I can use it?**
Three things, all on `/setup` (or the first-run `/onboarding` wizard): **Supabase** (the database —
local defaults are pre-filled), **Models** (a local Ollama endpoint + a chat model), and your
**Obsidian vault** path. GitHub is optional. The `/help` page shows a live checklist of these.

**What is optional?**
**GitHub** (only to version/sync your vault), **Mendeley** (only to import an existing library — you
can upload files instead), and the **MCP server** (only to drive the system from external tools like
Perplexity or Claude). Everything else works without them.

**Where are my settings stored?**
In `~/.localopenbrain/settings.json` (permissions `0600`) on your machine. The UI writes it;
environment variables override it. Secrets are never committed to the repo.

**How do I know everything is configured correctly?**
The dashboard shows a green/red *System status* panel, and `/help` shows a live setup checklist.
From a terminal, `npm run setup` prints a precise report of what is configured vs. missing.

## Privacy & data

**Does any of my data leave my machine?**
No, not by default. Documents, the database (Supabase), embeddings, the chat model (Ollama), and your
vault all run locally. Data only leaves your machine if *you* connect an external service — a hosted
Supabase project, a remote model endpoint, or a GitHub remote for your vault.

**Where do my generated notes live?**
As Markdown files inside your Obsidian vault folder — you own them. Open them in Obsidian or read them
in-app at `/notes`.

**Can the AI follow instructions hidden in my documents?**
No. Captured and AI-extracted content is treated strictly as data, never as instructions, and all
vault writes go through a path guard that rejects writes outside your configured folders.

## Models

**Which chat model should I use?**
The **Model advisor** on `/setup` detects your RAM/GPU and recommends an agent-capable model that
fits, with one-click **Pull** and **Use**. The current recommended default is `gemma4` (tool-use +
128k context). The embedding model is fixed at `nomic-embed-text`.

**Can I change the chat model later?**
Yes — pick another on `/setup` and click **Use**. It takes effect on your next Ask/Review/Search; no
restart needed.

**Can I change the embedding model?**
Not casually. The vector dimension is fixed at **768** in the schema. A different embedding
model/dimension requires a migration and re-embedding everything.

**The dashboard says models are unreachable.**
Make sure Ollama is running and you have pulled `nomic-embed-text` plus a chat model (`ollama list`).
Confirm the endpoint on `/setup`.

## Documents, Mendeley & search

**What file types can I upload?**
PDF, Word (`.docx`), and Markdown. Each is parsed, chunked, and embedded automatically.

**Do I need Mendeley?**
No. Mendeley is just a convenient bulk-import path. You can drag files into `/documents` instead, or
batch-import a folder with `npm run ingest -- "/path/to/pdfs"`.

**Mendeley isn't detected.**
Set the database + userfiles paths manually on `/sync` (auto-detect assumes a default macOS install).
Requires the `sqlite3` CLI.

**What's the difference between Ask and Search?**
`/search` returns the most relevant *passages* for you to read and click through. `/ask` sends those
passages to the chat model and returns a *written, cited answer* you can save as a note.

## Notes & traceability

**What does "claim-level traceability" actually mean?**
Every claim in a generated note is linked to the exact source *passage* (chunk) that backs it. You can
navigate note → passage, passage → document, and document → every note that cites it. The links are
structural (RAG-resolved), not invented by the model.

**How do I verify a claim back to its source?**
On a document page (`/documents` → a document), the *Traced claims* sidebar lets you click a claim to
jump to its passage; passages with a *cited* badge show which notes reference them.

**Do notes I write directly in Obsidian show up?**
Yes. `/notes` mirrors the vault on app load. Click **Sync vault** to also embed them so they're
searchable and usable as grounding. (Auto-generated source pointer notes are skipped from embedding.)

## Connecting AI tools (MCP)

**How do I use this from Perplexity / Claude / Cursor / Codex?**
Start the server on `/server`, then copy a ready-made config from `/connect` for your client and
restart it. It can then call the same tools (`rag_query`, `create_literature_note`, etc.).

**Do I need the MCP server running for the web app to work?**
No. The web app works on its own. The MCP server is only for external clients.

## Agents (review workflows)

**What's the difference between Committee and Debate?**
Committee runs each persona independently and then a Chair synthesizes — good for diverse, unbiased
takes. Debate runs personas in sequence so each sees the prior ones (Advocate → Challenger → Reviewer)
— good for stress-testing a thesis or hypothesis.

**Where do agent reviews go?**
Into the Obsidian Vault folder you pick on the run (you can create a new folder there). They only enter
the Supabase repository if you tick "add to open brain."

**What are collections?**
A way to group repository documents (from uploads or Mendeley). Assign documents to a collection on
`/documents`, then scope a persona's grounding to that collection so reviews cite only those sources.

## Hosting & scaling

**Can I move to a hosted database later?**
Yes. Paste a managed Supabase project URL + keys on `/setup` and run the same migration — no code
changes. Document files live in Supabase Storage, so they move with it.

**Can my whole lab use one instance?**
The data layer (hosted Supabase) is shareable. The app and models are designed to run per-researcher
locally; point several installs at the same hosted Supabase to share a repository.
