# Agentic Review Workflows — Design

**Status:** Approved for planning
**Date:** 2026-06-05
**Author:** Martin Lopez (with Claude)

## Summary

Add an agentic review capability to Megamind: the user defines reusable **agents
(personas)** — e.g. an advisor, a professor, a peer reviewer, a committee
stakeholder — and composes them into **workflows** (a saved review process).
A **run** applies a persona or workflow to an artifact (a draft written in
Obsidian, an uploaded Word/PDF/Markdown file, or pasted text), and writes the
reviews back into the Obsidian Vault as Markdown — optionally grounded in the
document repository and optionally saved into the openbrain Supabase repository.

This serves PhD work: stress-testing a thesis/hypothesis, developing a
prospectus or dissertation, and reviewing artifacts such as case studies and
homework assignments.

Built on the existing, proven orchestration pattern (`reviewDocument`,
`answerWithRag`): our code drives the model per persona. No native tool-calling.

## Goals

- Create and configure agents (personas) entirely in the front end.
- Compose personas into reusable workflows with two execution modes:
  **parallel** (Committee) and **sequential** (Debate).
- Run a review against a vault note, an upload, or pasted text.
- Write each agent's review as its own note plus a combined synthesis note into
  a user-chosen Obsidian Vault folder (which the user can create from the UI).
- Optionally ground each agent in the repository via RAG, scoped to a collection.
- Organize the repository into **collections** so uploads (Mendeley or manual)
  have structure and grounding can be scoped.
- Let the user see and orchestrate the live Obsidian Vault folder structure from
  the front end, with the filesystem as the source of truth.
- Optionally ingest the artifact and/or the review notes into the openbrain
  Supabase repository (embedded, searchable, traceable).

## Non-goals (v1)

- Native LLM tool-calling / autonomous agent loops (orchestrated only).
- Nested collection hierarchies (collections are flat, one level).
- Multiple collections per document (one collection per document in v1).
- A persisted run-history table (the output notes are the record).
- MCP tool exposure of runs (deferred to a later phase).
- Streaming responses in the UI (non-streaming `chat()` as today).

## Decisions (from brainstorming)

- **Mental model:** Personas + Workflows + Runs (with a Committee template).
- **Persona fields:** name, archetype, stance, review focus/rubric, tone, depth,
  per-persona model override (default `gemma4`), grounding `{enabled, scope}`,
  output format (`structured` default | `freeform`).
- **Output format default:** structured (Strengths / Weaknesses / Actionable
  revisions / Verdict), with freeform as a per-persona option.
- **Collections:** flat, first-class Supabase table; one collection per document
  (v1); Storage mirrors the collection slug.
- **Vault writes:** relaxed to **anywhere in the vault** (excluding hidden dirs),
  filesystem is the source of truth, folders creatable from the UI.
- **Workflow modes:** parallel (Committee = independent + Chair synthesis) and
  sequential (Debate = each step sees prior outputs).
- **Run output:** one note per agent **plus** a synthesis note.
- **Add to open brain:** two toggles (artifact / review notes), default **off**.
- **Templates:** ship **Committee** and **Debate** preloaded, with a starter
  persona set.
- **Naming:** all UI "Vault" labels become "Obsidian Vault."
- **Models:** agents use the configured chat model (recommended `gemma4`);
  grounding uses `nomic-embed-text` (768-dim). No new model pulls.

## Data model

### Personas & workflows (settings.json)

Stored under a new `agents` section in `~/.localopenbrain/settings.json`
(frontend-managed, consistent with all other config). These are configuration,
not bulk data, so JSON is appropriate.

```ts
interface Persona {
  id: string;                 // stable slug/uuid
  name: string;
  archetype: "professor" | "advisor" | "peer-reviewer" | "committee-stakeholder"
           | "advocate" | "challenger" | "reviewer" | "hypothesis-verifier"
           | "synthesizer" | "custom";
  stance: string;             // who they are / their lens
  rubric: string;             // what to evaluate
  tone: string;               // e.g. "constructive but exacting"
  depth: "brief" | "standard" | "detailed";
  model?: string;             // override; defaults to settings.models.chatModel
  grounding: { enabled: boolean; scope: "all" | { collectionId: string } };
  outputFormat: "structured" | "freeform";
  builtin?: boolean;          // seeded template persona
}

interface Workflow {
  id: string;
  name: string;
  mode: "parallel" | "sequential";
  steps: { personaId: string }[];           // ordered
  synthesis: { enabled: boolean; personaId?: string };  // default synthesizer
  builtin?: boolean;
}

interface AgentsSettings {
  personas: Persona[];
  workflows: Workflow[];
  defaults: { addArtifactToRepo: boolean; addReviewToRepo: boolean }; // both false
  seeded: boolean;            // templates preloaded once
}
```

`DEFAULT_SETTINGS.agents` starts empty with `seeded: false`; first access seeds
the built-in personas + Committee/Debate workflows and sets `seeded: true`.
`mergeSettings` gains an `agents` branch so existing settings files upgrade.

### Collections (Supabase — new migration)

```sql
create table if not exists collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);
alter table documents add column if not exists collection_id uuid
  references collections(id) on delete set null;
create index if not exists documents_collection_idx on documents (collection_id);
```

New migration file `supabase/migrations/0002_collections.sql`. `collection_id`
null = "Uncategorized" (a virtual default, not a row, to avoid a magic row).
Storage object path becomes `documents/<collection-slug>/<sha>-<filename>`
(uncategorized uploads use `documents/uncategorized/...`).

## Components

### `@lob/core` (server-only)

- **`agents/personas.ts`** — load/save/seed personas & workflows from settings;
  built-in template definitions. Pure-ish (settings IO); unit-testable seeding.
- **`agents/run.ts`** — the orchestration engine. `runReview(db, model, config,
  input)`:
  - resolve artifact text from `{ kind: "note", relPath } | { kind: "upload",
    documentId } | { kind: "text", text }`,
  - for each persona step: assemble prompt (stance + rubric + tone/depth +
    output-format instruction), attach RAG context if grounded (scoped to
    collection), and in `sequential` mode append prior step outputs,
  - call `model.chat`, parse (structured → sections; freeform → body),
  - write a note via the note writer to the chosen folder,
  - run synthesis over all step outputs → synthesis note,
  - if requested, ingest artifact and/or review notes into the repository.
  Returns the written note paths + any created document ids.
- **`agents/prompts.ts`** — system-prompt construction per archetype + output
  format. Keeps prompt text out of the engine for clarity/testing.
- **`vault/paths.ts`** — relax `resolveInsideVault` write rule (see below); add
  `listVaultTree(root)` and `createVaultFolder(root, relDir)` (guarded).
- **`vault/notes.ts`** — allow `persistNote` to target an arbitrary in-vault
  folder (a `targetDir` option) instead of only `dirFor(noteType)`.
- **`documents/process.ts`** — accept an optional `collectionId` on upload;
  place the Storage object under the collection slug; set `documents.collection_id`.
- **`collections.ts`** — CRUD + slug generation; assign/move a document.

### Vault path-guard change

`resolveInsideVault(..., { forWrite })` currently requires the parent to be one
of the configured `writeDirs`. New rule for writes:

- parent must resolve (realpath) to inside the vault root (unchanged),
- reject `..`, leading `/`/`~`, symlink escape (unchanged),
- **reject any path segment that is a hidden dir** (starts with `.`, e.g.
  `.obsidian`, `.git`, `.trash`),
- otherwise allow — no fixed-folder allowlist for writes.

`writeDirs` remains used only for `ensureVaultLayout` scaffolding of the default
research folders. Unit tests updated: hidden-dir writes rejected; arbitrary
in-vault folder writes allowed; `..`/symlink/outside-root still rejected.

### Frontend (`apps/web`)

- **`/agents`** — Personas list + editor; Workflows list + builder (mode toggle,
  ordered steps, synthesis toggle). Templates visible and clonable.
- **`/agents/run`** — the run flow: artifact picker (vault note / upload / paste),
  reviewer picker (persona or workflow), grounding + collection scope, output
  folder picker (with "+ New folder"), two "add to open brain" toggles, Run.
  Shows results with links to the written notes.
- **`/documents`** — add a Collections left-rail (create/rename/select; move a
  document; choose a collection on upload). Mendeley sync can target a collection.
- **Obsidian Vault folder browser** — a live tree component (reads
  `listVaultTree`) used by the output folder picker and the `/vault` page;
  "+ New folder" calls `createVaultFolder`.
- **Rename** all "Vault" UI labels → "Obsidian Vault" (dashboard, nav, `/vault`,
  setup, help/FAQ copy).
- **Server actions** in `app/actions.ts`: `listPersonas/savePersona/deletePersona`,
  `listWorkflows/saveWorkflow/deleteWorkflow`, `listCollections/saveCollection/
  moveDocumentToCollection`, `listVaultTree/createVaultFolder`, `runReview`.
- Dashboard gets an **Agents** nav card; `/help` + `/faq` gain agent guidance.

## Data flow (example: homework review)

1. User writes `HW2 draft.md` in Obsidian (or uploads a Word doc).
2. `/agents/run`: artifact = that note; reviewer = "Professor review" workflow;
   grounding scope = "Course — Methods" collection; output folder =
   `Course — Methods/HW2`; add-to-open-brain = off.
3. `runReview` reads the artifact, retrieves scoped RAG context, prompts the
   Professor persona, parses the structured review, and writes
   `HW2 draft — Professor review.md` into the chosen folder.
4. For a multi-step workflow, each persona writes its own note; the synthesis
   step writes a combined verdict + prioritized actions note.
5. If "add to open brain" were on, the artifact and/or review notes would be
   registered + embedded into Supabase (assigned to the collection) and become
   searchable/traceable.

## Error handling

- **Model returns unparseable output:** reuse the tolerant JSON extraction from
  `review.ts` for structured mode; on failure fall back to writing the raw model
  text as a freeform review (never lose the work) and flag it in the note.
- **Artifact has no extractable text** (empty note / failed parse): abort the run
  with a clear message before any model call.
- **Note name collision:** the writer throws `NoteExistsError`; the engine
  disambiguates with a numeric suffix (`… review 2.md`) rather than failing.
- **Grounding finds nothing:** proceed ungrounded and note "no relevant
  repository passages found" rather than blocking the review.
- **Folder creation outside vault / hidden dir:** guard throws
  `OutsideVaultError`; surfaced to the UI.
- **Partial multi-agent failure:** a failing step is recorded as an error note;
  remaining steps and synthesis still run (synthesis told which steps failed).
- **Ingestion failure** (add-to-open-brain): the vault notes are already written;
  ingestion errors are reported without rolling back the notes.

## Testing

Per the project's verification discipline:

- **Unit (`npm test`):** relaxed guard (hidden-dir reject, arbitrary in-vault
  allow, `..`/symlink/outside-root reject), collection slug generation, persona
  seeding idempotence, prompt construction, output parsing (structured +
  freeform + malformed→fallback), name-collision disambiguation. The
  orchestration engine is tested with a **stub ModelClient** (no network).
- **Stateful (throwaway `tsx` against the local stack):** end-to-end run that
  ingests a fixture artifact, runs a 2-persona parallel workflow with grounding,
  asserts the notes exist with the expected sections and that opt-in ingestion
  created `documents`/`chunks` rows under the collection — then deletes the DB
  rows and vault files.
- **CI:** unchanged pipeline (install → typecheck → test → web build) must pass;
  new migration applies cleanly via `supabase db reset`.

## Build sequence (high level — detailed plan follows)

1. Migration `0002_collections.sql` + `collections.ts` core CRUD.
2. Vault guard relaxation + `listVaultTree`/`createVaultFolder` + `persistNote`
   `targetDir` + tests.
3. Settings `agents` section + seeding (`personas.ts`) + templates.
4. Orchestration engine (`run.ts`, `prompts.ts`) + unit tests with stub model.
5. Upload/collection wiring (`process.ts`) + Mendeley collection targeting.
6. Server actions.
7. Frontend: `/agents`, `/agents/run`, collections rail, vault folder browser,
   "Obsidian Vault" rename, dashboard/help/FAQ updates.
8. Stateful end-to-end verification + docs.

## Open questions

None outstanding — all resolved during brainstorming.
