# Installing Megamind

A from-scratch setup guide: download every prerequisite, get the stack running, and open the app.
Everything runs **locally** — your documents, database, and models never leave your machine.

> **macOS (Apple Silicon) is the primary target.** Linux notes are included inline. On Windows,
> use WSL2 and follow the Linux steps inside the WSL shell.

When you're done you'll have: a local Supabase database, Ollama serving models, the repo installed,
and the app open at **https://research-assistant** (or `http://localhost:3000`).

---

## 0. What you'll install (the shopping list)

| Tool | Why | Check |
|---|---|---|
| **Node.js ≥ 20** | runs the app + CLIs | `node -v` |
| **Docker Desktop** | hosts the local Supabase stack | `docker --version` |
| **Supabase CLI** | starts Postgres + pgvector + Storage | `supabase --version` |
| **Ollama** | local embeddings + chat models | `ollama --version` |
| **Git** | clone the repo + version your vault | `git --version` |
| **Caddy** *(optional)* | clean HTTPS hostname | `caddy version` |

If a check already prints a version, you can skip that tool's install step.

---

## 1. Node.js (≥ 20)

**macOS (Homebrew):**
```bash
brew install node
```
**Or** download the LTS installer from <https://nodejs.org>.

**Linux:** use [nodesource](https://github.com/nodesource/distributions) or your distro's package
for Node 20+.

Verify:
```bash
node -v   # should print v20.x or higher
npm -v
```

---

## 2. Docker Desktop

Megamind's local database runs in Docker.

**macOS:** download **Docker Desktop** from <https://www.docker.com/products/docker-desktop/>.

> ⚠️ **Apple Silicon (M1–M5): get the _Apple Chip_ build, not Intel.** The Intel build runs under
> Rosetta and the Supabase containers fail to start. If unsure: `uname -m` → `arm64` means you want
> the Apple Silicon download.

Launch Docker Desktop once and let it finish starting (the whale icon in the menu bar goes steady).

Verify:
```bash
docker --version
docker ps        # should succeed (empty list is fine)
```

**Linux:** install Docker Engine + the compose plugin from
<https://docs.docker.com/engine/install/> and ensure your user is in the `docker` group.

---

## 3. Supabase CLI

This starts the local Postgres + pgvector + Storage + Studio stack.

**macOS:**
```bash
brew install supabase/tap/supabase
```
**Linux / other:** see <https://supabase.com/docs/guides/cli> (download the release binary or use
the install script).

Verify:
```bash
supabase --version
```

---

## 4. Ollama + models

Ollama serves the embedding and chat models locally.

**macOS:** download from <https://ollama.com/download> (or `brew install ollama`), then launch it.
**Linux:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Pull the **required embedding model** (768-dim — this dimension is load-bearing in the schema) and a
**chat model**:
```bash
ollama pull nomic-embed-text          # required — embeddings
ollama pull llama3.1:8b               # a starter chat model (the in-app advisor can suggest better)
```

> You don't have to guess the chat model: after setup, the **Model advisor** on `/setup` detects your
> RAM/GPU and one-click-pulls a model that fits your machine. `nomic-embed-text` is the one constant.

Verify Ollama is reachable:
```bash
ollama list                           # shows the models you pulled
curl http://localhost:11434/api/tags  # should return JSON
```

---

## 5. Get the code

```bash
git clone https://github.com/<your-account>/megamind_phd_assistant.git
cd megamind_phd_assistant
npm install
```

`npm install` wires up the whole monorepo (`@lob/core`, the MCP server, and the web app) in one go.

---

## 6. Start the database + apply the schema

With Docker Desktop running:
```bash
supabase start        # first run pulls images — can take a few minutes
supabase db reset     # applies supabase/migrations/0001_init.sql (documents/chunks/notes + pgvector)
```

`supabase start` prints your local **API URL** (`http://127.0.0.1:54321`), **anon key**, and
**service-role key**. Keep that output handy — you'll paste the URL + service-role key into the
onboarding wizard in the next step. (You can reprint it anytime with `supabase status`.)

---

## 7. First launch

```bash
npm run start:app
```

This brings up Docker → Supabase → the web app and opens **https://research-assistant** (a local
hostname with a trusted certificate via Caddy). The very first run asks for your password once to:

- add `research-assistant → 127.0.0.1` to `/etc/hosts`, and
- trust the local Caddy certificate.

**No Caddy?** It falls back to `http://research-assistant:8788`. For plain localhost development with
hot-reload, use:
```bash
npm run web           # → http://localhost:3000
```

*(Optional clean-HTTPS dependency)* `brew install caddy` — only needed for the
`https://research-assistant` padlock; everything works without it.

---

## 8. Finish setup in the browser (`/onboarding`)

A brand-new launch routes you through a wizard. Each step verifies live before continuing:

1. **Supabase** — paste the **API URL** + **service-role key** from step 6 (pre-filled with the local
   defaults). It tests the connection and confirms the schema is migrated.
2. **Models** — confirm the Ollama endpoint, then use the **Model advisor** to pull a chat model that
   fits your hardware.
3. **Vault** — enter the absolute path to your Obsidian vault. Saving scaffolds the `Research/…`
   folders. (No vault yet? Make an empty folder and point at it — Obsidian can open it later.)
4. **GitHub** *(optional)* — connect a remote to version + sync your vault.

Settings are written to `~/.localopenbrain/settings.json` (secrets, `0600`). **Nothing is committed
to the repo** — env vars override the file if you prefer those.

---

## 9. Verify it all works

```bash
npm run setup         # health check — prints what's configured vs. missing
```

Or just look at the **dashboard**: every row under *System status* should be green. Then try the
end-to-end loop: drop a PDF in **`/documents`**, hit **AI review**, and read the traceable note in
**`/notes`**.

In-app, open **`/help`** for the everyday workflow and route reference.

---

## Day-to-day commands

| Command | What it does |
|---|---|
| `npm run start:app` | full stack → app at `https://research-assistant` |
| `npm run web` | web app only, hot-reload → `http://localhost:3000` |
| `npm run up` / `npm run down` | start/stop the plain `localhost:3000` variant + proxy |
| `npm run setup` | health check |
| `npm run ingest -- "/path/to/pdfs" --mendeley` | batch-import a folder |
| `npm run sync` | one-shot Mendeley sync |
| `npm run mcp:dev` | run the MCP server (also controllable in `/server`) |

---

## Troubleshooting installs

- **`docker ps` fails / Supabase won't start** — Docker Desktop isn't running, or (Apple Silicon) you
  installed the Intel build. Quit Docker, install the **Apple Chip** build, relaunch.
- **`supabase start` is slow the first time** — it's pulling container images; subsequent starts are
  fast.
- **Dashboard says Supabase "not migrated"** — run `supabase db reset`.
- **Models unreachable** — make sure Ollama is running (`ollama list`) and you pulled
  `nomic-embed-text` plus a chat model.
- **Mendeley not detected** (`/sync`) — set the DB + userfiles paths manually; requires the `sqlite3`
  CLI (`brew install sqlite3`).
- **Old macOS git** — `brew install git` then restart your shell (the bundled system git can be too
  old for some operations).
- **Changed the embedding model** — the vector dimension is fixed at **768**; a different
  model/dimension means updating the schema and re-embedding.

Once you're set up, see **[docs/USAGE.md](docs/USAGE.md)** for the full feature walkthrough.
