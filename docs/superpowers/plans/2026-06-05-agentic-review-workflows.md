# Agentic Review Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user define persona-based agents and compose them into review workflows (Committee/Debate) that review an artifact and write traceable notes into the Obsidian Vault, with repository collections for scoped grounding and optional ingestion into the openbrain Supabase repository.

**Architecture:** Orchestrated multi-agent review (our code drives the model per persona — same pattern as `reviewDocument`/`answerWithRag`; no native tool-calling). Personas/workflows live in `settings.json`; collections live in a new Supabase table; the vault path-guard relaxes to "anywhere in the vault" (filesystem is the source of truth for folder structure). The engine reads an artifact, optionally retrieves RAG context scoped to a collection, prompts each persona, parses the output, and writes one note per agent plus a synthesis note.

**Tech Stack:** TypeScript ESM (NodeNext), `@lob/core` (server-only), Supabase (Postgres + pgvector + Storage), Ollama via OpenAI-compatible client (`gemma4` chat, `nomic-embed-text` embeddings), Next.js 15 / React 19 server actions. Tests: `node --import tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-05-agentic-review-workflows-design.md`

---

## Conventions for every task

- Relative imports use `.js` specifiers (NodeNext). `@lob/core` is server-only.
- Run unit tests from `packages/core`: `npm test` (or a single file: `node --import tsx --test "src/path/file.test.ts"`).
- Typecheck the monorepo from the repo root: `npm run typecheck`.
- Commit after each task with the message shown. Branch first if on `main`:
  `git checkout -b feat/agentic-review` (do this once, before Task 1).

---

## Phase 1 — Collections (repository structure)

### Task 1: Collections migration

**Files:**
- Create: `supabase/migrations/0002_collections.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0002_collections.sql — group repository documents into flat collections so
-- uploads have structure and agent grounding can be scoped to a collection.
-- One collection per document (v1). NULL collection_id = "Uncategorized".

create table if not exists collections (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists collections_set_updated_at on collections;
create trigger collections_set_updated_at before update on collections
  for each row execute function set_updated_at();

alter table documents add column if not exists collection_id uuid
  references collections(id) on delete set null;

create index if not exists documents_collection_idx on documents (collection_id);
```

- [ ] **Step 2: Apply and verify the schema**

Run: `supabase db reset`
Expected: completes without error; both `0001_init.sql` and `0002_collections.sql` apply.

Verify the column exists:
Run: `supabase db reset && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -c "\d documents" | grep collection_id`
Expected: a line showing `collection_id | uuid`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_collections.sql
git commit -m "feat(db): collections table + documents.collection_id"
```

---

### Task 2: Collection slug helper (pure, TDD)

**Files:**
- Create: `packages/core/src/collections.ts`
- Test: `packages/core/src/collections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionSlug } from "./collections.js";

test("collectionSlug lowercases, trims, and dasherizes", () => {
  assert.equal(collectionSlug("Course — Methods"), "course-methods");
  assert.equal(collectionSlug("  Dissertation  "), "dissertation");
  assert.equal(collectionSlug("HW2: Draft/Final"), "hw2-draft-final");
});

test("collectionSlug throws on empty result", () => {
  assert.throws(() => collectionSlug("   "), /empty/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test "src/collections.test.ts"` (from `packages/core`)
Expected: FAIL — `collectionSlug` is not exported / module not found.

- [ ] **Step 3: Write the minimal implementation**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

/** Slugify a collection name for Storage paths and uniqueness. */
export function collectionSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("collection name slugifies to empty");
  return slug;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test "src/collections.test.ts"`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/collections.ts packages/core/src/collections.test.ts
git commit -m "feat(core): collectionSlug helper"
```

---

### Task 3: Collection CRUD functions

**Files:**
- Modify: `packages/core/src/collections.ts`

- [ ] **Step 1: Add CRUD functions to `collections.ts`**

```ts
export async function listCollections(db: SupabaseClient): Promise<Collection[]> {
  const { data, error } = await db
    .from("collections")
    .select("id, name, slug, description, created_at")
    .order("name", { ascending: true });
  if (error) throw new Error(`listCollections failed: ${error.message}`);
  return (data ?? []) as Collection[];
}

export async function createCollection(
  db: SupabaseClient,
  input: { name: string; description?: string },
): Promise<Collection> {
  const slug = collectionSlug(input.name);
  const { data, error } = await db
    .from("collections")
    .insert({ name: input.name.trim(), slug, description: input.description ?? null })
    .select("id, name, slug, description, created_at")
    .single();
  if (error) throw new Error(`createCollection failed: ${error.message}`);
  return data as Collection;
}

export async function renameCollection(
  db: SupabaseClient,
  id: string,
  name: string,
): Promise<Collection> {
  const { data, error } = await db
    .from("collections")
    .update({ name: name.trim(), slug: collectionSlug(name) })
    .eq("id", id)
    .select("id, name, slug, description, created_at")
    .single();
  if (error) throw new Error(`renameCollection failed: ${error.message}`);
  return data as Collection;
}

export async function moveDocumentToCollection(
  db: SupabaseClient,
  documentId: string,
  collectionId: string | null,
): Promise<void> {
  const { error } = await db
    .from("documents")
    .update({ collection_id: collectionId })
    .eq("id", documentId);
  if (error) throw new Error(`moveDocumentToCollection failed: ${error.message}`);
}

/** Slug for a collection id, or "uncategorized" when null/missing. */
export async function collectionSlugFor(
  db: SupabaseClient,
  collectionId: string | null | undefined,
): Promise<string> {
  if (!collectionId) return "uncategorized";
  const { data } = await db.from("collections").select("slug").eq("id", collectionId).maybeSingle();
  return (data?.slug as string) ?? "uncategorized";
}
```

- [ ] **Step 2: Export from the package index**

Modify `packages/core/src/index.ts` — add after line 7 (`export * from "./storage/files.js";`):

```ts
export * from "./collections.js";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` (repo root)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/collections.ts packages/core/src/index.ts
git commit -m "feat(core): collection CRUD + slug resolution"
```

---

## Phase 2 — Vault: anywhere-in-vault writes, live tree, folder creation

### Task 4: Relax the write-guard to "anywhere in the vault"

**Files:**
- Modify: `packages/core/src/vault/paths.ts`
- Test: `packages/core/src/vault/paths.test.ts`

- [ ] **Step 1: Add failing tests** (append to `paths.test.ts`)

```ts
test("resolveInsideVault allows writes into any non-hidden in-vault folder", () => {
  const root = makeVault();
  mkdirSync(join(root, "Dissertation"));
  try {
    const p = resolveInsideVault(root, "Dissertation/Ch3.md", { forWrite: true, writeDirs: WRITE_DIRS });
    assert.ok(p.endsWith("/Dissertation/Ch3.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveInsideVault rejects writes into hidden dirs", () => {
  const root = makeVault();
  mkdirSync(join(root, ".obsidian"), { recursive: true });
  try {
    assert.throws(
      () => resolveInsideVault(root, ".obsidian/x.md", { forWrite: true, writeDirs: WRITE_DIRS }),
      OutsideVaultError,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Note: the existing test `"resolveInsideVault rejects writes outside the allowlist"` is now obsolete — **delete it** (lines that create `Other/` and assert it throws). The new model allows that write.

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `node --import tsx --test "src/vault/paths.test.ts"`
Expected: the "any non-hidden in-vault folder" test FAILS (currently rejected by allowlist).

- [ ] **Step 3: Replace the write-allowlist block in `resolveInsideVault`**

In `paths.ts`, replace the `if (opts.forWrite) { ... }` block (the allowlist check) with a hidden-dir check:

```ts
  if (opts.forWrite) {
    // Writes may land in ANY folder inside the vault, except hidden dirs
    // (.obsidian, .git, .trash, dotfiles). The realpath/.. /outside-root checks
    // above remain the strong boundary.
    const rel = parentReal.slice(realRoot.length).replace(/^\//, "");
    const hidden = rel.split("/").some((seg) => seg.startsWith("."));
    if (hidden) {
      throw new OutsideVaultError(`writes not allowed in hidden folders: ${rel}`);
    }
  }
```

(The `opts.writeDirs` parameter stays in the signature — still used by `ensureVaultLayout` callers — but is no longer consulted for the write decision.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test "src/vault/paths.test.ts"`
Expected: PASS — including the retained `..`/absolute/`~` rejection tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vault/paths.ts packages/core/src/vault/paths.test.ts
git commit -m "feat(vault): allow writes anywhere in the vault except hidden dirs"
```

---

### Task 5: Live folder tree + guarded folder creation

**Files:**
- Modify: `packages/core/src/vault/paths.ts`
- Test: `packages/core/src/vault/paths.test.ts`

- [ ] **Step 1: Add failing tests** (append to `paths.test.ts`)

```ts
import { listVaultTree, createVaultFolder } from "./paths.js";

test("listVaultTree returns non-hidden folders relative to root", () => {
  const root = makeVault();
  mkdirSync(join(root, "Dissertation", "Ch3"), { recursive: true });
  mkdirSync(join(root, ".obsidian"), { recursive: true });
  try {
    const tree = listVaultTree(root);
    assert.ok(tree.includes("Dissertation"));
    assert.ok(tree.includes("Dissertation/Ch3"));
    assert.ok(!tree.some((d) => d.startsWith(".obsidian")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("createVaultFolder makes a nested folder and rejects escapes", () => {
  const root = makeVault();
  try {
    const rel = createVaultFolder(root, "Course — Methods/HW2");
    assert.equal(rel, "Course — Methods/HW2");
    assert.ok(listVaultTree(root).includes("Course — Methods/HW2"));
    assert.throws(() => createVaultFolder(root, "../escape"), OutsideVaultError);
    assert.throws(() => createVaultFolder(root, ".hidden"), OutsideVaultError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test "src/vault/paths.test.ts"`
Expected: FAIL — `listVaultTree`/`createVaultFolder` not exported.

- [ ] **Step 3: Implement both in `paths.ts`** (add at the end of the file; add `readdirSync` to the `node:fs` import)

```ts
/**
 * List every non-hidden folder in the vault, as vault-relative POSIX paths,
 * sorted. The filesystem is the source of truth — call this fresh to reflect
 * changes the user made directly in Obsidian.
 */
export function listVaultTree(root: string): string[] {
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
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      out.push(childRel);
      walk(join(absDir, e.name), childRel);
    }
  };
  walk(realRoot, "");
  return out.sort();
}

/**
 * Create a folder inside the vault (recursively). Guards against escapes and
 * hidden dirs. Returns the created vault-relative path.
 */
export function createVaultFolder(root: string, relDir: string): string {
  const clean = relDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!clean) throw new OutsideVaultError("folder path is empty");
  if (clean.startsWith("~")) throw new OutsideVaultError(`path must be relative: ${relDir}`);
  const segments = clean.split("/");
  if (segments.includes("..")) throw new OutsideVaultError(`path contains '..': ${relDir}`);
  if (segments.some((s) => s.startsWith("."))) {
    throw new OutsideVaultError(`hidden folders are not allowed: ${relDir}`);
  }
  const realRoot = assertVaultRoot(root);
  mkdirSync(join(realRoot, clean), { recursive: true });
  return clean;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test "src/vault/paths.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vault/paths.ts packages/core/src/vault/paths.test.ts
git commit -m "feat(vault): listVaultTree + createVaultFolder (guarded)"
```

---

### Task 6: Let the note writer target an arbitrary in-vault folder

**Files:**
- Modify: `packages/core/src/vault/notes.ts`

- [ ] **Step 1: Add an optional `targetDir` to `persistNote` and a public `writeMarkdownNote`**

In `notes.ts`, change `persistNote`'s `args` to accept `targetDir?: string`, and compute `dir` from it when present:

Replace:
```ts
  const dir = dirFor(args.noteType, config.vault.dirs);
```
with:
```ts
  const dir = args.targetDir ?? dirFor(args.noteType, config.vault.dirs);
```

Add `targetDir?: string;` to the `args` object type of `persistNote`.

Then add a public helper at the end of the file for free-form agent output (no DB claim links, arbitrary folder):

```ts
/**
 * Write a free-form Markdown note into a chosen vault folder and register it in
 * `notes`. Used by the agent engine, which produces prose reviews rather than
 * claim-linked literature notes. `targetDir` may be any non-hidden in-vault path.
 */
export async function writeMarkdownNote(
  db: SupabaseClient,
  config: Config,
  input: {
    title: string;
    targetDir: string;
    body: string;
    topics?: string[];
    frontmatter?: FrontmatterField[];
    metadata?: Record<string, unknown>;
  },
): Promise<{ noteId: string; relPath: string; absPath: string }> {
  const fm: FrontmatterField[] =
    input.frontmatter ?? [
      ["type", "draft"],
      ["status", "review"],
      ["created", todayISO()],
      ["updated", todayISO()],
      ["tags", (input.topics ?? []).map((t) => `topic/${t}`)],
    ];
  return persistNote(db, config, {
    noteType: "draft",
    title: input.title,
    topics: input.topics ?? [],
    targetDir: input.targetDir,
    frontmatter: fm,
    body: input.body,
    metadata: input.metadata,
  });
}
```

Note: `persistNote` throws `NoteExistsError` on collision — the engine (Task 11) handles disambiguation.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/vault/notes.ts
git commit -m "feat(vault): writeMarkdownNote into an arbitrary in-vault folder"
```

---

## Phase 3 — Settings: agents section, templates, seeding

### Task 7: Add the `agents` settings types + defaults + merge

**Files:**
- Modify: `packages/core/src/settings.ts`

- [ ] **Step 1: Add the types** (after `MendeleySettings`, before `interface Settings`)

```ts
export type PersonaArchetype =
  | "professor" | "advisor" | "peer-reviewer" | "committee-stakeholder"
  | "advocate" | "challenger" | "reviewer" | "hypothesis-verifier"
  | "synthesizer" | "custom";

export interface Persona {
  id: string;
  name: string;
  archetype: PersonaArchetype;
  stance: string;
  rubric: string;
  tone: string;
  depth: "brief" | "standard" | "detailed";
  /** Override the chat model; falls back to settings.models.chatModel. */
  model?: string;
  grounding: { enabled: boolean; scope: "all" | { collectionId: string } };
  outputFormat: "structured" | "freeform";
  builtin?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  mode: "parallel" | "sequential";
  steps: { personaId: string }[];
  synthesis: { enabled: boolean; personaId?: string };
  builtin?: boolean;
}

export interface AgentsSettings {
  personas: Persona[];
  workflows: Workflow[];
  defaults: { addArtifactToRepo: boolean; addReviewToRepo: boolean };
  seeded: boolean;
}
```

- [ ] **Step 2: Add `agents` to the `Settings` interface**

Add to `interface Settings` (after `mendeley: MendeleySettings;`):
```ts
  agents: AgentsSettings;
```

- [ ] **Step 3: Add the default** (in `DEFAULT_SETTINGS`, after `mendeley: { enabled: false },`)

```ts
  agents: {
    personas: [],
    workflows: [],
    defaults: { addArtifactToRepo: false, addReviewToRepo: false },
    seeded: false,
  },
```

- [ ] **Step 4: Merge the `agents` branch** (in `mergeSettings`, add after the `mendeley:` line)

```ts
    agents: {
      ...base.agents,
      ...patch.agents,
      defaults: { ...base.agents.defaults, ...patch.agents?.defaults },
    },
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/settings.ts
git commit -m "feat(settings): agents section (personas, workflows, defaults)"
```

---

### Task 8: Built-in templates + idempotent seeding (TDD)

**Files:**
- Create: `packages/core/src/agents/templates.ts`
- Create: `packages/core/src/agents/personas.ts`
- Test: `packages/core/src/agents/personas.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seedAgents } from "./personas.js";
import { DEFAULT_SETTINGS } from "../settings.js";

test("seedAgents installs builtin personas + Committee/Debate workflows once", () => {
  const fresh = structuredClone(DEFAULT_SETTINGS).agents;
  const seeded = seedAgents(fresh);
  assert.equal(seeded.seeded, true);
  assert.ok(seeded.personas.length >= 7);
  const names = seeded.workflows.map((w) => w.name);
  assert.ok(names.includes("Committee"));
  assert.ok(names.includes("Debate"));
  // Workflow steps reference real persona ids.
  const ids = new Set(seeded.personas.map((p) => p.id));
  for (const w of seeded.workflows) for (const s of w.steps) assert.ok(ids.has(s.personaId));
});

test("seedAgents is idempotent (no duplicates on re-seed)", () => {
  const once = seedAgents(structuredClone(DEFAULT_SETTINGS).agents);
  const twice = seedAgents(once);
  assert.equal(twice.personas.length, once.personas.length);
  assert.equal(twice.workflows.length, once.workflows.length);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test "src/agents/personas.test.ts"`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `templates.ts`**

```ts
import type { Persona, Workflow } from "../settings.js";

/** Stable ids so re-seeding never duplicates and workflows can reference them. */
export const BUILTIN_PERSONAS: Persona[] = [
  {
    id: "builtin-advisor", name: "Advisor", archetype: "advisor", builtin: true,
    stance: "A supportive but rigorous doctoral advisor who helps shape direction and strengthen the argument.",
    rubric: "1) Is the central thesis/RQ clear and significant? 2) Is the argument coherent? 3) What are the biggest risks? 4) Concrete next steps.",
    tone: "supportive but exacting", depth: "detailed",
    grounding: { enabled: true, scope: "all" }, outputFormat: "structured",
  },
  {
    id: "builtin-professor", name: "Professor", archetype: "professor", builtin: true,
    stance: "A demanding professor grading against the assignment's rubric and academic standards.",
    rubric: "1) Does it meet the assignment requirements? 2) Clarity of thesis. 3) Quality of evidence/method. 4) Writing & structure. 5) Grade + justification.",
    tone: "constructive but exacting", depth: "detailed",
    grounding: { enabled: false, scope: "all" }, outputFormat: "structured",
  },
  {
    id: "builtin-peer-reviewer", name: "Peer Reviewer", archetype: "peer-reviewer", builtin: true,
    stance: "An anonymous journal peer reviewer assessing contribution, rigor, and novelty.",
    rubric: "1) Contribution & novelty. 2) Soundness of method. 3) Validity of claims vs evidence. 4) Major vs minor revisions. 5) Recommendation.",
    tone: "neutral and critical", depth: "detailed",
    grounding: { enabled: true, scope: "all" }, outputFormat: "structured",
  },
  {
    id: "builtin-advocate", name: "Advocate", archetype: "advocate", builtin: true,
    stance: "A persuasive advocate making the strongest possible case FOR the work's thesis.",
    rubric: "Make the strongest defensible case for the thesis: its importance, the best supporting evidence, and why objections fail.",
    tone: "persuasive", depth: "standard",
    grounding: { enabled: true, scope: "all" }, outputFormat: "freeform",
  },
  {
    id: "builtin-challenger", name: "Challenger", archetype: "challenger", builtin: true,
    stance: "A sharp skeptic who stress-tests the thesis and rebuts the advocate.",
    rubric: "Identify the weakest assumptions, threats to validity, missing evidence, and the strongest counterarguments. Rebut the advocate where present.",
    tone: "skeptical", depth: "standard",
    grounding: { enabled: true, scope: "all" }, outputFormat: "freeform",
  },
  {
    id: "builtin-reviewer", name: "Reviewer", archetype: "reviewer", builtin: true,
    stance: "A balanced adjudicator weighing the case for and against and recommending a path.",
    rubric: "Weigh strengths vs weaknesses, resolve the advocate/challenger tension, and give a clear recommendation with priorities.",
    tone: "balanced", depth: "standard",
    grounding: { enabled: false, scope: "all" }, outputFormat: "structured",
  },
  {
    id: "builtin-hypothesis-verifier", name: "Hypothesis Verifier", archetype: "hypothesis-verifier", builtin: true,
    stance: "A methodologist checking whether the stated hypotheses are testable and supported.",
    rubric: "1) Are hypotheses clearly stated & falsifiable? 2) Does the design test them? 3) Do the data/claims support them? 4) Threats to validity.",
    tone: "precise", depth: "detailed",
    grounding: { enabled: true, scope: "all" }, outputFormat: "structured",
  },
  {
    id: "builtin-synthesizer", name: "Chair (Synthesis)", archetype: "synthesizer", builtin: true,
    stance: "A committee chair synthesizing multiple reviews into one verdict and a prioritized action list.",
    rubric: "Summarize the agreements and disagreements across the reviews, give an overall verdict, and a prioritized, actionable revision list.",
    tone: "decisive", depth: "standard",
    grounding: { enabled: false, scope: "all" }, outputFormat: "structured",
  },
];

export const BUILTIN_WORKFLOWS: Workflow[] = [
  {
    id: "builtin-committee", name: "Committee", mode: "parallel", builtin: true,
    steps: [
      { personaId: "builtin-advisor" },
      { personaId: "builtin-peer-reviewer" },
      { personaId: "builtin-hypothesis-verifier" },
    ],
    synthesis: { enabled: true, personaId: "builtin-synthesizer" },
  },
  {
    id: "builtin-debate", name: "Debate", mode: "sequential", builtin: true,
    steps: [
      { personaId: "builtin-advocate" },
      { personaId: "builtin-challenger" },
      { personaId: "builtin-reviewer" },
    ],
    synthesis: { enabled: true, personaId: "builtin-synthesizer" },
  },
];
```

- [ ] **Step 4: Write `personas.ts`**

```ts
import type { AgentsSettings, Persona, Workflow } from "../settings.js";
import { loadSettings, updateSettings } from "../settings.js";
import { BUILTIN_PERSONAS, BUILTIN_WORKFLOWS } from "./templates.js";

/** Install built-in personas/workflows once. Pure: returns the next AgentsSettings. */
export function seedAgents(agents: AgentsSettings): AgentsSettings {
  if (agents.seeded) return agents;
  const haveP = new Set(agents.personas.map((p) => p.id));
  const haveW = new Set(agents.workflows.map((w) => w.id));
  return {
    ...agents,
    personas: [...agents.personas, ...BUILTIN_PERSONAS.filter((p) => !haveP.has(p.id))],
    workflows: [...agents.workflows, ...BUILTIN_WORKFLOWS.filter((w) => !haveW.has(w.id))],
    seeded: true,
  };
}

/** Load agents from settings, seeding templates on first access (persists). */
export function loadAgents(): AgentsSettings {
  const s = loadSettings();
  if (!s.agents.seeded) {
    const seeded = seedAgents(s.agents);
    updateSettings({ agents: seeded });
    return seeded;
  }
  return s.agents;
}

export function listPersonas(): Persona[] { return loadAgents().personas; }
export function listWorkflows(): Workflow[] { return loadAgents().workflows; }

export function getPersona(id: string): Persona | undefined {
  return loadAgents().personas.find((p) => p.id === id);
}
export function getWorkflow(id: string): Workflow | undefined {
  return loadAgents().workflows.find((w) => w.id === id);
}

export function savePersona(p: Persona): Persona {
  const agents = loadAgents();
  const idx = agents.personas.findIndex((x) => x.id === p.id);
  const personas = [...agents.personas];
  if (idx >= 0) personas[idx] = p; else personas.push(p);
  updateSettings({ agents: { ...agents, personas } });
  return p;
}

export function deletePersona(id: string): void {
  const agents = loadAgents();
  updateSettings({ agents: { ...agents, personas: agents.personas.filter((p) => p.id !== id) } });
}

export function saveWorkflow(w: Workflow): Workflow {
  const agents = loadAgents();
  const idx = agents.workflows.findIndex((x) => x.id === w.id);
  const workflows = [...agents.workflows];
  if (idx >= 0) workflows[idx] = w; else workflows.push(w);
  updateSettings({ agents: { ...agents, workflows } });
  return w;
}

export function deleteWorkflow(id: string): void {
  const agents = loadAgents();
  updateSettings({ agents: { ...agents, workflows: agents.workflows.filter((w) => w.id !== id) } });
}

/** Generate a unique non-builtin id from a name. */
export function newAgentId(prefix: string, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  return `${prefix}-${base}-${Math.abs(hashStr(name + prefix)).toString(36).slice(0, 6)}`;
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
```

(`newAgentId` avoids `Math.random` for determinism in tests; reuse it from the web layer when creating personas/workflows.)

- [ ] **Step 5: Run to verify pass**

Run: `node --import tsx --test "src/agents/personas.test.ts"`
Expected: PASS (both tests).

- [ ] **Step 6: Export + typecheck**

Add to `packages/core/src/index.ts`:
```ts
export * from "./agents/personas.js";
export * from "./agents/templates.js";
```
Run: `npm run typecheck` → no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/agents/templates.ts packages/core/src/agents/personas.ts packages/core/src/agents/personas.test.ts packages/core/src/index.ts
git commit -m "feat(agents): builtin templates + idempotent seeding + CRUD"
```

---

## Phase 4 — Orchestration engine

### Task 9: Prompt construction (pure, TDD)

**Files:**
- Create: `packages/core/src/agents/prompts.ts`
- Test: `packages/core/src/agents/prompts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, STRUCTURED_SECTIONS } from "./prompts.js";
import type { Persona } from "../settings.js";

const persona: Persona = {
  id: "p1", name: "Prof", archetype: "professor", stance: "Demanding professor.",
  rubric: "Check clarity and method.", tone: "exacting", depth: "detailed",
  grounding: { enabled: false, scope: "all" }, outputFormat: "structured",
};

test("structured prompt names the persona, rubric, and required sections", () => {
  const p = buildSystemPrompt(persona);
  assert.match(p, /Prof/);
  assert.match(p, /Check clarity and method/);
  for (const s of STRUCTURED_SECTIONS) assert.ok(p.includes(s));
});

test("freeform prompt omits the fixed-section instruction", () => {
  const p = buildSystemPrompt({ ...persona, outputFormat: "freeform" });
  assert.ok(!p.includes(STRUCTURED_SECTIONS[0]!));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test "src/agents/prompts.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement `prompts.ts`**

```ts
import type { Persona } from "../settings.js";

export const STRUCTURED_SECTIONS = ["## Strengths", "## Weaknesses", "## Actionable revisions", "## Verdict"] as const;

const DEPTH_HINT: Record<Persona["depth"], string> = {
  brief: "Be concise — a few bullet points per section.",
  standard: "Give a normal-length review.",
  detailed: "Be thorough and specific, citing parts of the artifact.",
};

/** Build the system prompt that gives the model its persona and output contract. */
export function buildSystemPrompt(persona: Persona): string {
  const lines = [
    `You are acting as: ${persona.name} (${persona.archetype}).`,
    `Persona / stance: ${persona.stance}`,
    `Your review focus & rubric: ${persona.rubric}`,
    `Tone: ${persona.tone}. ${DEPTH_HINT[persona.depth]}`,
    `You are reviewing the user's artifact (a draft, assignment, or chapter). Address the author directly.`,
    `Do not invent facts. If you reference outside sources, only use the provided context passages.`,
  ];
  if (persona.outputFormat === "structured") {
    lines.push(
      `Respond in Markdown with EXACTLY these section headings, in order:`,
      STRUCTURED_SECTIONS.join("\n"),
      `Under "## Verdict", give a one-line overall judgment (and a grade if a rubric grade is requested).`,
    );
  } else {
    lines.push(`Respond in clear Markdown prose. Use headings/bullets where helpful.`);
  }
  return lines.join("\n");
}

/** Build the user message: artifact + optional grounding context + prior outputs. */
export function buildUserPrompt(input: {
  artifactTitle: string;
  artifactText: string;
  context?: string;
  priorOutputs?: { name: string; body: string }[];
}): string {
  const parts = [`ARTIFACT TITLE: ${input.artifactTitle}`, ``, `ARTIFACT:`, input.artifactText];
  if (input.context) parts.push(``, `REFERENCE PASSAGES (for grounding; cite as needed):`, input.context);
  if (input.priorOutputs?.length) {
    parts.push(``, `EARLIER REVIEWS IN THIS WORKFLOW (respond to them where relevant):`);
    for (const p of input.priorOutputs) parts.push(`--- ${p.name} ---`, p.body);
  }
  return parts.join("\n");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test "src/agents/prompts.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/prompts.ts packages/core/src/agents/prompts.test.ts
git commit -m "feat(agents): persona prompt construction"
```

---

### Task 10: Artifact resolution (TDD with a temp vault)

**Files:**
- Create: `packages/core/src/agents/artifact.ts`
- Test: `packages/core/src/agents/artifact.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveArtifactText } from "./artifact.js";
import type { Config } from "../config.js";

function fakeConfig(root: string): Config {
  return {
    vault: { root, dirs: { literature: "L", sources: "S", syntheses: "Y", annotations: "A", drafts: "D" } },
  } as unknown as Config;
}

test("resolveArtifactText reads a vault note", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-art-"));
  mkdirSync(join(root, "Drafts"), { recursive: true });
  writeFileSync(join(root, "Drafts", "HW2.md"), "# HW2\n\nMy thesis is X.");
  try {
    const out = await resolveArtifactText(fakeConfig(root), null as any, { kind: "note", relPath: "Drafts/HW2.md" });
    assert.match(out.text, /My thesis is X/);
    assert.equal(out.title, "HW2");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveArtifactText accepts pasted text", async () => {
  const out = await resolveArtifactText(fakeConfig("/tmp"), null as any, { kind: "text", text: "hello", title: "Pasted" });
  assert.equal(out.text, "hello");
  assert.equal(out.title, "Pasted");
});

test("resolveArtifactText rejects empty artifacts", async () => {
  await assert.rejects(
    () => resolveArtifactText(fakeConfig("/tmp"), null as any, { kind: "text", text: "   ", title: "x" }),
    /no text/i,
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test "src/agents/artifact.test.ts"`
Expected: FAIL.

- [ ] **Step 3: Implement `artifact.ts`**

```ts
import { basename } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";
import { readNote } from "../vault/notes.js";

export type ArtifactInput =
  | { kind: "note"; relPath: string }
  | { kind: "text"; text: string; title: string }
  | { kind: "document"; documentId: string };

export interface ResolvedArtifact { title: string; text: string }

/** Resolve an artifact reference to plain text + a title for the review run. */
export async function resolveArtifactText(
  config: Config,
  db: SupabaseClient,
  input: ArtifactInput,
): Promise<ResolvedArtifact> {
  let title = "Artifact";
  let text = "";
  if (input.kind === "note") {
    text = readNote(config, input.relPath);
    title = basename(input.relPath).replace(/\.md$/i, "");
  } else if (input.kind === "text") {
    text = input.text;
    title = input.title;
  } else {
    const { data: doc } = await db.from("documents").select("title").eq("id", input.documentId).single();
    const { data: chunks } = await db
      .from("chunks").select("text").eq("document_id", input.documentId).order("ord", { ascending: true });
    title = (doc?.title as string) ?? "Document";
    text = (chunks ?? []).map((c: { text: string }) => c.text).join("\n\n");
  }
  if (!text || !text.trim()) throw new Error("artifact has no text to review");
  return { title, text };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test "src/agents/artifact.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agents/artifact.ts packages/core/src/agents/artifact.test.ts
git commit -m "feat(agents): artifact resolution (note/text/document)"
```

---

### Task 11: The review engine (TDD with a stub model)

**Files:**
- Create: `packages/core/src/agents/run.ts`
- Test: `packages/core/src/agents/run.test.ts`

- [ ] **Step 1: Write the failing test** (stub model + temp vault; grounding off so no DB needed)

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReview } from "./run.js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import type { Persona, Workflow } from "../settings.js";

// A stub that echoes which persona spoke, so we can assert one note per agent.
function stubModel(): ModelClient {
  return {
    async chat(messages: { role: string; content: string }[]) {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      const who = sys.match(/acting as: ([^(]+)/)?.[1]?.trim() ?? "Agent";
      return `## Strengths\nGood from ${who}.\n## Weaknesses\nNone.\n## Actionable revisions\n- Revise.\n## Verdict\nPass (${who}).`;
    },
  } as unknown as ModelClient;
}

// A fake DB whose only used call is notes upsert (returns an id). Grounding off.
function fakeDb() {
  return {
    from() {
      return {
        upsert() { return { select() { return { single: async () => ({ data: { id: "n1" }, error: null }) } }; } },
        insert: async () => ({ error: null }),
      };
    },
  } as any;
}

function cfg(root: string): Config {
  return { vault: { root, dirs: { literature: "L", sources: "S", syntheses: "Y", annotations: "A", drafts: "D" } } } as unknown as Config;
}

const persona = (id: string, name: string): Persona => ({
  id, name, archetype: "reviewer", stance: "s", rubric: "r", tone: "t", depth: "standard",
  grounding: { enabled: false, scope: "all" }, outputFormat: "structured",
});

test("parallel workflow writes one note per agent plus synthesis", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-run-"));
  mkdirSync(join(root, "Reviews"), { recursive: true });
  writeFileSync(join(root, "Reviews", "Draft.md"), "# Draft\n\nThesis: X improves Y.");
  const wf: Workflow = {
    id: "w", name: "Two", mode: "parallel",
    steps: [{ personaId: "a" }, { personaId: "b" }],
    synthesis: { enabled: true, personaId: "syn" },
  };
  const personas = [persona("a", "Alice"), persona("b", "Bob"), persona("syn", "Chair")];
  try {
    const res = await runReview(fakeDb(), stubModel(), cfg(root), {
      artifact: { kind: "note", relPath: "Reviews/Draft.md" },
      workflow: wf, personas, targetDir: "Reviews",
      addArtifactToRepo: false, addReviewToRepo: false,
    });
    assert.equal(res.notes.length, 3); // 2 agents + synthesis
    const files = readdirSync(join(root, "Reviews"));
    assert.ok(files.some((f) => /Alice/.test(f)));
    assert.ok(files.some((f) => /Bob/.test(f)));
    assert.ok(files.some((f) => /Synthesis|Chair/.test(f)));
    const alice = readFileSync(join(root, "Reviews", files.find((f) => /Alice/.test(f))!), "utf8");
    assert.match(alice, /Good from Alice/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test "src/agents/run.test.ts"`
Expected: FAIL — `run.js` not found.

- [ ] **Step 3: Implement `run.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import type { Persona, Workflow } from "../settings.js";
import { ragQuery } from "../rag/ingest.js";
import { writeMarkdownNote, NoteExistsError } from "../vault/notes.js";
import { sanitizeTitle } from "../vault/paths.js";
import { resolveArtifactText, type ArtifactInput, type ResolvedArtifact } from "./artifact.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";

export interface RunReviewInput {
  artifact: ArtifactInput;
  /** Either a workflow (multi-step) or a single persona run. */
  workflow?: Workflow;
  singlePersonaId?: string;
  /** All personas referenced by the workflow/single id. */
  personas: Persona[];
  /** Vault folder the notes are written into (any non-hidden in-vault path). */
  targetDir: string;
  addArtifactToRepo: boolean;
  addReviewToRepo: boolean;
}

export interface RunReviewResult {
  notes: { persona: string; relPath: string }[];
  artifactTitle: string;
}

interface StepOutput { name: string; body: string; error?: boolean }

/** Retrieve grounding context for a persona (scoped to a collection or all). */
async function groundingContext(
  db: SupabaseClient, model: ModelClient, persona: Persona, artifact: ResolvedArtifact,
): Promise<string | undefined> {
  if (!persona.grounding.enabled) return undefined;
  const collectionId =
    persona.grounding.scope === "all" ? undefined : persona.grounding.scope.collectionId;
  // Query top passages relevant to the artifact's thesis.
  const query = artifact.text.slice(0, 1500);
  let hits = await ragQuery(db, model, query, { limit: 6, threshold: 0.2 });
  if (collectionId) {
    const { data } = await db.from("documents").select("id").eq("collection_id", collectionId);
    const ids = new Set((data ?? []).map((d: { id: string }) => d.id));
    hits = hits.filter((h) => ids.has(h.documentId));
  }
  if (!hits.length) return undefined;
  return hits.map((h, i) => `[${i + 1}] (${h.documentTitle}${h.section ? ` § ${h.section}` : ""})\n${h.text}`).join("\n\n");
}

/** Run one persona over the artifact, returning its Markdown body. */
async function runPersona(
  db: SupabaseClient, model: ModelClient, persona: Persona, artifact: ResolvedArtifact,
  prior: StepOutput[], modelDefault: string,
): Promise<StepOutput> {
  try {
    const context = await groundingContext(db, model, persona, artifact);
    const body = await model.chat(
      [
        { role: "system", content: buildSystemPrompt(persona) },
        { role: "user", content: buildUserPrompt({
            artifactTitle: artifact.title, artifactText: artifact.text, context,
            priorOutputs: prior.map((p) => ({ name: p.name, body: p.body })),
          }) },
      ],
      { model: persona.model ?? modelDefault, temperature: 0.3 },
    );
    return { name: persona.name, body: body.trim() || "_(no output)_" };
  } catch (err) {
    return { name: persona.name, body: `> Review failed: ${(err as Error).message}`, error: true };
  }
}

/** Write a step output as a note, disambiguating name collisions. */
async function writeStepNote(
  db: SupabaseClient, config: Config, artifactTitle: string, targetDir: string, step: StepOutput,
): Promise<{ persona: string; relPath: string }> {
  const base = sanitizeTitle(`${artifactTitle} — ${step.name} review`);
  for (let n = 0; n < 50; n++) {
    const title = n === 0 ? base : `${base} ${n + 1}`;
    try {
      const body = `# ${title}\n\n${step.body}\n`;
      const { relPath } = await writeMarkdownNote(db, config, {
        title, targetDir, body, topics: ["agent-review"],
      });
      return { persona: step.name, relPath };
    } catch (e) {
      if (e instanceof NoteExistsError) continue;
      throw e;
    }
  }
  throw new Error("could not find a free filename for review note");
}

export async function runReview(
  db: SupabaseClient, model: ModelClient, config: Config, input: RunReviewInput,
): Promise<RunReviewResult> {
  const artifact = await resolveArtifactText(config, db, input.artifact);
  const byId = new Map(input.personas.map((p) => [p.id, p]));
  const modelDefault = config.models.chatModel;

  // Determine the ordered persona steps.
  const stepIds = input.workflow
    ? input.workflow.steps.map((s) => s.personaId)
    : input.singlePersonaId ? [input.singlePersonaId] : [];
  const sequential = input.workflow?.mode === "sequential";

  const outputs: StepOutput[] = [];
  if (sequential) {
    for (const id of stepIds) {
      const p = byId.get(id);
      if (!p) continue;
      outputs.push(await runPersona(db, model, p, artifact, outputs, modelDefault));
    }
  } else {
    const results = await Promise.all(
      stepIds.map((id) => {
        const p = byId.get(id);
        return p ? runPersona(db, model, p, artifact, [], modelDefault) : Promise.resolve(null);
      }),
    );
    for (const r of results) if (r) outputs.push(r);
  }

  // Synthesis (workflow only).
  if (input.workflow?.synthesis.enabled) {
    const syn = byId.get(input.workflow.synthesis.personaId ?? "builtin-synthesizer");
    if (syn) {
      const synOut = await runPersona(db, model, syn, artifact, outputs, modelDefault);
      synOut.name = "Synthesis";
      outputs.push(synOut);
    }
  }

  // Write notes.
  const notes: { persona: string; relPath: string }[] = [];
  for (const step of outputs) {
    notes.push(await writeStepNote(db, config, artifact.title, input.targetDir, step));
  }

  return { notes, artifactTitle: artifact.title };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --import tsx --test "src/agents/run.test.ts"`
Expected: PASS.

- [ ] **Step 5: Add a sequential-mode test** (append to `run.test.ts`)

```ts
test("sequential workflow feeds prior outputs to later agents", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-seq-"));
  mkdirSync(join(root, "Reviews"), { recursive: true });
  writeFileSync(join(root, "Reviews", "D.md"), "# D\n\nThesis.");
  // Model that records whether prior outputs appear in the user message.
  let sawPrior = false;
  const model = {
    async chat(messages: { role: string; content: string }[]) {
      const user = messages.find((m) => m.role === "user")?.content ?? "";
      if (/EARLIER REVIEWS/.test(user)) sawPrior = true;
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      const who = sys.match(/acting as: ([^(]+)/)?.[1]?.trim() ?? "A";
      return `## Strengths\nx\n## Weaknesses\nx\n## Actionable revisions\n- x\n## Verdict\nok (${who})`;
    },
  } as any;
  const wf: Workflow = { id: "w", name: "Seq", mode: "sequential", steps: [{ personaId: "a" }, { personaId: "b" }], synthesis: { enabled: false } };
  try {
    await runReview(fakeDb(), model, cfg(root), {
      artifact: { kind: "note", relPath: "Reviews/D.md" }, workflow: wf,
      personas: [persona("a", "Alice"), persona("b", "Bob")], targetDir: "Reviews",
      addArtifactToRepo: false, addReviewToRepo: false,
    });
    assert.equal(sawPrior, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

Run: `node --import tsx --test "src/agents/run.test.ts"` → Expected: PASS (all tests).

- [ ] **Step 6: Export + typecheck**

Add to `packages/core/src/index.ts`:
```ts
export * from "./agents/run.js";
export * from "./agents/artifact.js";
export * from "./agents/prompts.js";
```
Run: `npm run typecheck` → no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/agents/run.ts packages/core/src/agents/run.test.ts packages/core/src/index.ts
git commit -m "feat(agents): review engine (parallel/sequential + synthesis)"
```

---

### Task 12: Optional ingestion of artifact + review notes into the repository

**Files:**
- Modify: `packages/core/src/agents/run.ts`

- [ ] **Step 1: Add an ingestion helper and wire the toggles**

Add imports at the top of `run.ts`:
```ts
import { registerDocument, ingestDocument } from "../rag/ingest.js";
import { readNote } from "../vault/notes.js";
```

Add this helper near the bottom (before `runReview`):
```ts
/** Register + embed a Markdown body as a repository document under a collection. */
async function ingestMarkdown(
  db: SupabaseClient, model: ModelClient, title: string, body: string, collectionId: string | null,
): Promise<void> {
  const doc = await registerDocument(db, {
    title, kind: "note", mimeType: "text/markdown",
    bytes: new TextEncoder().encode(body),
    metadata: { source: "agent-review" },
  });
  if (collectionId) await db.from("documents").update({ collection_id: collectionId }).eq("id", doc.id);
  await ingestDocument(db, model, doc.id, body);
}
```

At the end of `runReview`, before `return`, add (after notes are written):
```ts
  // Optional: add to open brain (Supabase repository).
  const collectionId =
    input.workflow && input.workflow.steps.length
      ? collectionScopeOf(byId.get(input.workflow.steps[0]!.personaId))
      : input.singlePersonaId ? collectionScopeOf(byId.get(input.singlePersonaId)) : null;

  if (input.addArtifactToRepo) {
    await ingestMarkdown(db, model, artifact.title, artifact.text, collectionId);
  }
  if (input.addReviewToRepo) {
    for (const step of outputs) {
      const note = notes.find((n) => n.persona === step.name);
      if (note) await ingestMarkdown(db, model, `${artifact.title} — ${step.name}`, readNote(config, note.relPath), collectionId);
    }
  }
```

Add this small helper next to `ingestMarkdown`:
```ts
function collectionScopeOf(p?: Persona): string | null {
  if (!p || p.grounding.scope === "all") return null;
  return p.grounding.scope.collectionId;
}
```

- [ ] **Step 2: Confirm existing tests still pass** (they pass `addArtifactToRepo:false` so ingestion is skipped)

Run: `node --import tsx --test "src/agents/run.test.ts"`
Expected: PASS (unchanged).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/agents/run.ts
git commit -m "feat(agents): optional ingest of artifact/review notes into repository"
```

---

## Phase 5 — Upload + collection wiring

### Task 13: Accept a collection on upload (Storage path + column)

**Files:**
- Modify: `packages/core/src/documents/process.ts`
- Modify: `packages/core/src/storage/files.ts` (only if the path is hardcoded; see step)

- [ ] **Step 1: Read `process.ts` to find `processDocumentUpload`'s signature and the Storage path build**

Run: `sed -n '1,80p' packages/core/src/documents/process.ts`
Expected: shows `processDocumentUpload(..., metadata?)` and where `uploadDocumentFile` is called with a path.

- [ ] **Step 2: Thread `collectionId` through `processDocumentUpload`**

Add `collectionId?: string` to the upload options object. Compute the Storage prefix from the collection slug:
```ts
import { collectionSlugFor, moveDocumentToCollection } from "../collections.js";
// ...
const slug = await collectionSlugFor(db, opts.collectionId ?? null);
const storagePath = `${slug}/${doc.id}-${safeFilename}`; // replaces the prior `${doc.id}-...` path
```
After `registerDocument`, set the column:
```ts
if (opts.collectionId) await moveDocumentToCollection(db, doc.id, opts.collectionId);
```
(Keep behavior identical when `collectionId` is undefined — slug resolves to `"uncategorized"`.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/documents/process.ts
git commit -m "feat(documents): place uploads under a collection slug"
```

---

## Phase 6 — Server actions (browser → core bridge)

### Task 14: Agent + collection + vault server actions

**Files:**
- Modify: `apps/web/app/actions.ts`

- [ ] **Step 1: Add the actions** (append to `actions.ts`; mirror the existing `"use server"` style at the top of the file)

```ts
import {
  listPersonas as coreListPersonas, savePersona as coreSavePersona, deletePersona as coreDeletePersona,
  listWorkflows as coreListWorkflows, saveWorkflow as coreSaveWorkflow, deleteWorkflow as coreDeleteWorkflow,
  newAgentId, loadAgents,
  listCollections as coreListCollections, createCollection as coreCreateCollection,
  renameCollection as coreRenameCollection, moveDocumentToCollection as coreMoveDoc,
  runReview, getWorkflow, getPersona,
  type Persona, type Workflow, type Collection,
} from "@lob/core";
import {
  listVaultTree, createVaultFolder,
  requireVaultRoot, getConfig, requireSupabase,
  createModelClient, createServiceClient,
} from "@lob/core";

export type { Persona, Workflow, Collection };

export async function listPersonasAction(): Promise<Persona[]> { return coreListPersonas(); }
export async function savePersonaAction(p: Persona): Promise<Persona> {
  if (!p.id) p = { ...p, id: newAgentId("persona", p.name) };
  return coreSavePersona(p);
}
export async function deletePersonaAction(id: string): Promise<void> { coreDeletePersona(id); }

export async function listWorkflowsAction(): Promise<Workflow[]> { return coreListWorkflows(); }
export async function saveWorkflowAction(w: Workflow): Promise<Workflow> {
  if (!w.id) w = { ...w, id: newAgentId("workflow", w.name) };
  return coreSaveWorkflow(w);
}
export async function deleteWorkflowAction(id: string): Promise<void> { coreDeleteWorkflow(id); }

export async function listCollectionsAction(): Promise<Collection[]> {
  return coreListCollections(createServiceClient(getConfig()));
}
export async function createCollectionAction(name: string, description?: string): Promise<Collection> {
  return coreCreateCollection(createServiceClient(getConfig()), { name, description });
}
export async function renameCollectionAction(id: string, name: string): Promise<Collection> {
  return coreRenameCollection(createServiceClient(getConfig()), id, name);
}
export async function moveDocumentAction(documentId: string, collectionId: string | null): Promise<void> {
  await coreMoveDoc(createServiceClient(getConfig()), documentId, collectionId);
}

export async function vaultTreeAction(): Promise<string[]> {
  return listVaultTree(requireVaultRoot(getConfig()));
}
export async function createVaultFolderAction(relDir: string): Promise<string[]> {
  createVaultFolder(requireVaultRoot(getConfig()), relDir);
  return listVaultTree(requireVaultRoot(getConfig()));
}

export interface RunReviewRequest {
  artifact:
    | { kind: "note"; relPath: string }
    | { kind: "text"; text: string; title: string }
    | { kind: "document"; documentId: string };
  workflowId?: string;
  personaId?: string;
  targetDir: string;
  addArtifactToRepo: boolean;
  addReviewToRepo: boolean;
}

export async function runReviewAction(req: RunReviewRequest) {
  const config = getConfig();
  requireSupabase(config);
  const db = createServiceClient(config);
  const model = createModelClient(config);
  const workflow = req.workflowId ? getWorkflow(req.workflowId) : undefined;
  const personas = loadAgents().personas; // all personas; engine selects by id
  return runReview(db, model, config, {
    artifact: req.artifact,
    workflow,
    singlePersonaId: req.personaId,
    personas,
    targetDir: req.targetDir,
    addArtifactToRepo: req.addArtifactToRepo,
    addReviewToRepo: req.addReviewToRepo,
  });
}
```

Note: `createServiceClient(config)` is the existing helper (already imported in `actions.ts`, used by `ragAsk`/`semanticSearch`/`documentDetail`). `getConfig()` and `requireSupabase` are also already imported there — don't double-import; merge into the existing import block.

- [ ] **Step 2: Typecheck + web build**

Run: `npm run typecheck`
Run: `npm run build --workspace @lob/web`
Expected: both succeed.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/actions.ts
git commit -m "feat(web): server actions for agents, collections, vault tree"
```

---

## Phase 7 — Frontend pages + rename

### Task 15: `/agents` — personas & workflows management

**Files:**
- Create: `apps/web/app/agents/page.tsx`
- Create: `apps/web/components/agents/persona-editor.tsx` (client)
- Create: `apps/web/components/agents/workflow-builder.tsx` (client)

- [ ] **Step 1: Server page** (`apps/web/app/agents/page.tsx`) — mirror `apps/web/app/sync/page.tsx` structure

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listPersonasAction, listWorkflowsAction, listCollectionsAction } from "@/app/actions";
import { PersonaEditor } from "@/components/agents/persona-editor";
import { WorkflowBuilder } from "@/components/agents/workflow-builder";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [personas, workflows, collections] = await Promise.all([
    listPersonasAction(), listWorkflowsAction(), listCollectionsAction(),
  ]);
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Agents</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Define reviewer personas and compose them into review workflows. Run them from{" "}
        <Link href="/agents/run" className="underline">Run a review</Link>.
      </p>
      <PersonaEditor personas={personas} collections={collections} />
      <div className="h-8" />
      <WorkflowBuilder workflows={workflows} personas={personas} />
    </main>
  );
}
```

- [ ] **Step 2: `PersonaEditor` client component** — a list with add/edit/delete. Implements the fields from the spec (name, archetype select, stance, rubric, tone, depth select, model input, grounding toggle + collection scope select, outputFormat select). On save calls `savePersonaAction`; on delete `deletePersonaAction`; `router.refresh()` after. Use existing `@/components/ui/{card,button,input,label}`. Built-in personas (`builtin: true`) are clonable but show a "built-in" badge and a "Duplicate" action instead of delete.

Key handler shape (full component follows existing client patterns in `apps/web/components/setup/*`):
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { savePersonaAction, deletePersonaAction } from "@/app/actions";
import type { Persona, Collection } from "@/app/actions";
// ...render a form; archetype/depth/outputFormat are <select>; grounding is a checkbox + a
// collection <select> shown when scope !== "all"; "Save" calls:
async function save(p: Persona) { await savePersonaAction(p); router.refresh(); }
```

- [ ] **Step 3: `WorkflowBuilder` client component** — list workflows; editor with name, mode select (parallel/sequential), an ordered multi-select of personas (add/remove/reorder via up/down buttons), synthesis checkbox + synthesizer persona select. Save → `saveWorkflowAction`; delete → `deleteWorkflowAction`; `router.refresh()`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build --workspace @lob/web`
Expected: succeed; `/agents` appears in the route list.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/agents/page.tsx apps/web/components/agents/persona-editor.tsx apps/web/components/agents/workflow-builder.tsx
git commit -m "feat(web): /agents personas + workflows management"
```

---

### Task 16: Obsidian Vault folder picker (live tree + create)

**Files:**
- Create: `apps/web/components/agents/folder-picker.tsx` (client)

- [ ] **Step 1: Implement the picker**

```tsx
"use client";
import { useState } from "react";
import { createVaultFolderAction } from "@/app/actions";

export function FolderPicker({
  tree, value, onChange,
}: { tree: string[]; value: string; onChange: (v: string) => void }) {
  const [folders, setFolders] = useState(tree);
  const [newName, setNewName] = useState("");
  return (
    <div className="space-y-2">
      <select className="w-full rounded-md border bg-background p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Vault root</option>
        {folders.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <div className="flex gap-2">
        <input className="flex-1 rounded-md border bg-background p-2 text-sm" placeholder="New folder, e.g. Course — Methods/HW2"
          value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="rounded-md border px-3 text-sm" onClick={async () => {
          if (!newName.trim()) return;
          const next = await createVaultFolderAction(newName.trim());
          setFolders(next); onChange(newName.trim()); setNewName("");
        }}>+ Create</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/agents/folder-picker.tsx
git commit -m "feat(web): Obsidian Vault folder picker (live tree + create)"
```

---

### Task 17: `/agents/run` — the run flow

**Files:**
- Create: `apps/web/app/agents/run/page.tsx`
- Create: `apps/web/components/agents/run-form.tsx` (client)

- [ ] **Step 1: Server page** loads personas, workflows, collections, vault tree, and the note list (reuse `listNotes()` for the vault-note picker):

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listPersonasAction, listWorkflowsAction, listCollectionsAction, vaultTreeAction, listNotes } from "@/app/actions";
import { RunForm } from "@/components/agents/run-form";

export const dynamic = "force-dynamic";

export default async function RunPage() {
  const [personas, workflows, collections, tree, notes] = await Promise.all([
    listPersonasAction(), listWorkflowsAction(), listCollectionsAction(), vaultTreeAction(), listNotes(),
  ]);
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/agents" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Agents
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Run a review</h1>
      <p className="mb-8 text-sm text-muted-foreground">Review an artifact and write the responses into your Obsidian Vault.</p>
      <RunForm personas={personas} workflows={workflows} collections={collections} tree={tree}
        notes={notes.map((n) => ({ relPath: (n as any).vaultPath ?? (n as any).relPath, title: n.title }))} />
    </main>
  );
}
```

(If `listNotes()` returns a different field for the path, map it to `relPath` here — check `NoteSummary`.)

- [ ] **Step 2: `RunForm` client component** implementing the 5-step run UI:
  - Step 1 artifact: tabs `note | upload | text`. `note` → `<select>` of `notes`. `upload` → file input that POSTs to the existing `/api/upload` route (reuse), then uses the returned `documentId` as `{ kind: "document", documentId }`. `text` → textarea + title.
  - Step 2 reviewer: choose workflow or single persona (radio + select).
  - Step 3 grounding scope is per-persona (read-only note: "grounding is configured per persona").
  - Step 4 destination: `<FolderPicker tree value onChange>`.
  - Step 5: two checkboxes `addArtifactToRepo`, `addReviewToRepo` (default false).
  - Submit → `runReviewAction(req)`, then render the resulting note links (`res.notes`) with `relPath`.

Handler shape:
```tsx
"use client";
import { useState } from "react";
import { runReviewAction, type RunReviewRequest } from "@/app/actions";
import { FolderPicker } from "./folder-picker";
// build `req: RunReviewRequest` from form state; const res = await runReviewAction(req);
// show res.notes.map(n => n.relPath)
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build --workspace @lob/web`
Expected: succeed; `/agents/run` in route list.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/agents/run/page.tsx apps/web/components/agents/run-form.tsx
git commit -m "feat(web): /agents/run review flow"
```

---

### Task 18: Collections rail on `/documents`

**Files:**
- Modify: `apps/web/app/documents/page.tsx`
- Create: `apps/web/components/documents/collections-rail.tsx` (client)

- [ ] **Step 1: Load collections in the documents page and pass to a rail component**

In `documents/page.tsx`, call `listCollectionsAction()` alongside the existing document list and render `<CollectionsRail collections={...} />` in a left column. The rail lists collections + "All" + "Uncategorized", a "+ New collection" input (calls `createCollectionAction`, then `router.refresh()`), and a rename affordance.

- [ ] **Step 2: Add a "Move to" control per document** (in the existing document row/list) that calls `moveDocumentAction(documentId, collectionId)` and `router.refresh()`. Add a collection `<select>` to the upload form that passes `collectionId` to the upload route (extend `/api/upload` to forward `collectionId` to `processDocumentUpload`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build --workspace @lob/web`
Expected: succeed.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/documents/page.tsx apps/web/components/documents/collections-rail.tsx apps/web/app/api/upload/route.ts
git commit -m "feat(web): collections rail + assign documents to collections"
```

---

### Task 19: Dashboard + docs: Agents card and "Obsidian Vault" rename

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/vault/page.tsx`, `apps/web/app/help/page.tsx`, `apps/web/app/faq/page.tsx`, `apps/web/app/setup/page.tsx` (label text only)

- [ ] **Step 1: Add an Agents nav card to the dashboard**

In `apps/web/app/page.tsx`, import `Bot` from `lucide-react` and add after the Ask card or in the workspace grid:
```tsx
<NavCard href="/agents" icon={<Bot className="size-5" />} title="Agents" desc="Persona reviewers & review workflows" />
```

- [ ] **Step 2: Rename "Vault" → "Obsidian Vault" in user-facing labels**

Run to find them:
```bash
grep -rn "Vault\b" apps/web/app apps/web/components | grep -vi "obsidian vault"
```
Update display strings (titles, nav labels, card titles, descriptions) from "Vault" to "Obsidian Vault". Do **not** rename code identifiers, routes, or settings keys — labels only.

- [ ] **Step 3: Add a one-line Agents mention to `/help` (Common tasks) and `/faq`**

Add a use-case to `/help` `USE_CASES`:
```tsx
{
  title: "Get feedback from an agent (advisor, professor, committee)",
  icon: <Sparkles className="size-4" />,
  steps: [
    { text: "Define or pick a persona/workflow.", href: "/agents" },
    { text: "Run it on a draft (vault note, upload, or paste).", href: "/agents/run" },
    { text: "Read the per-agent notes + synthesis in your Obsidian Vault.", href: "/notes" },
  ],
},
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build --workspace @lob/web`
Expected: succeed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx apps/web/app/vault/page.tsx apps/web/app/help/page.tsx apps/web/app/faq/page.tsx apps/web/app/setup/page.tsx
git commit -m "feat(web): Agents nav card + Obsidian Vault rename + help/faq"
```

---

## Phase 8 — Stateful verification + docs

### Task 20: End-to-end verification against the local stack

**Files:**
- Create (throwaway): `scripts/verify-agents.mts` (delete after)

- [ ] **Step 1: Ensure the stack is up**

Run: `supabase status` (expect running) and `ollama list` (expect `gemma4` + `nomic-embed-text`).

- [ ] **Step 2: Write a throwaway verification script**

```ts
// scripts/verify-agents.mts — run with: npx tsx scripts/verify-agents.mts
import { getConfig, requireSupabase, createModelClient, runReview, loadAgents,
  createServiceClient } from "./packages/core/src/index.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const config = getConfig();
requireSupabase(config);
const db = createServiceClient(config);
const model = createModelClient(config);

const root = config.vault.root!;
const dir = "Reviews/_verify";
mkdirSync(join(root, dir), { recursive: true });
writeFileSync(join(root, dir, "Sample.md"), "# Sample\n\nThesis: Method A reduces error by 20%. Sample size n=8.");

const agents = loadAgents();
const committee = agents.workflows.find((w) => w.name === "Committee")!;

const res = await runReview(db, model, config, {
  artifact: { kind: "note", relPath: `${dir}/Sample.md` },
  workflow: committee, personas: agents.personas, targetDir: dir,
  addArtifactToRepo: false, addReviewToRepo: false,
});
console.log("notes written:", res.notes.map((n) => n.relPath));
if (res.notes.length !== committee.steps.length + 1) throw new Error("expected one note per agent + synthesis");

// cleanup
rmSync(join(root, "Reviews", "_verify"), { recursive: true, force: true });
await db.from("notes").delete().like("vault_path", `${dir}/%`);
console.log("OK — cleaned up");
```

- [ ] **Step 3: Run it**

Run: `npx tsx scripts/verify-agents.mts`
Expected: prints the written note paths (3+1), then "OK — cleaned up". Inspect one note for the structured sections before cleanup if desired.

- [ ] **Step 4: Verify collections + grounding path manually (optional but recommended)**

In the UI (`npm run web`): create a collection, upload a PDF into it, set a persona's grounding scope to that collection, run a review, confirm the review references the collection's content.

- [ ] **Step 5: Delete the throwaway script**

```bash
rm scripts/verify-agents.mts
```

- [ ] **Step 6: Run the full unit suite + typecheck**

Run (repo root): `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit (if anything changed) — otherwise skip**

```bash
git status   # expect clean (throwaway deleted)
```

---

### Task 21: Documentation

**Files:**
- Modify: `README.md` (routes table + a line under "What it does")
- Modify: `docs/USAGE.md` (a new "Agentic review" section)
- Modify: `docs/FAQ.md` (Agents Q&A)
- Modify: `CLAUDE.md` (architecture: `agents/` module + collections table)

- [ ] **Step 1: README** — add to the routes table:
```
| `/agents` | Persona reviewers & review workflows |
| `/agents/run` | Run a review; writes per-agent + synthesis notes to the Obsidian Vault |
```
and a "What it does" bullet:
```
- **Agentic review** — define persona agents (advisor, professor, peer reviewer, committee) and run Committee/Debate workflows over a draft; each agent's review and a synthesis are written into your Obsidian Vault, optionally grounded in a collection and optionally saved to the repository.
```

- [ ] **Step 2: `docs/USAGE.md`** — add a section after "Turn sources into traceable notes":
```
## Agentic review (agents & workflows)

Define reviewer **personas** and compose them into **workflows** on `/agents`. Two templates ship
ready to use: **Committee** (independent reviews + a synthesis) and **Debate** (Advocate → Challenger
→ Reviewer). On `/agents/run`, pick an artifact (a vault note, an uploaded Word/PDF/MD file, or pasted
text), choose a persona or workflow, pick the Obsidian Vault folder to write into (create one inline),
and optionally tick "add to open brain" to also ingest the artifact and/or reviews into the repository.
Each agent writes its own note; workflows add a synthesis note with a verdict and prioritized actions.
```

- [ ] **Step 3: `docs/FAQ.md`** — add under a new "Agents" heading:
```
**What's the difference between Committee and Debate?**
Committee runs each persona independently and then a Chair synthesizes — good for diverse, unbiased
takes. Debate runs personas in sequence so each sees the prior ones (Advocate → Challenger → Reviewer)
— good for stress-testing a thesis or hypothesis.

**Where do agent reviews go?**
Into the Obsidian Vault folder you pick on the run (you can create a new folder there). They only enter
the Supabase repository if you tick "add to open brain."
```

- [ ] **Step 4: `CLAUDE.md`** — under the architecture tree, add:
```
    agents/           personas (settings-backed) + review engine (run/prompts/artifact)
    collections.ts    repository collections (group documents; scope grounding)
```
and a one-line note under the data model:
```
Agents are persona-driven review workflows; personas/workflows live in settings.json, runs write
notes into the vault (any folder) and optionally ingest into the repository. Collections group
documents (`documents.collection_id`).
```

- [ ] **Step 5: Build the web app to confirm docs didn't break anything**

Run: `npm run build --workspace @lob/web`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/USAGE.md docs/FAQ.md CLAUDE.md
git commit -m "docs: agentic review workflows + collections"
```

---

## Final verification (after all tasks)

- [ ] `npm test` (repo root) — all core unit tests pass.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run build --workspace @lob/web` — clean; `/agents`, `/agents/run` present.
- [ ] `supabase db reset` — both migrations apply.
- [ ] Manual smoke: create a persona, create a collection, run Committee on a draft, confirm per-agent + synthesis notes appear in the chosen Obsidian Vault folder.
- [ ] Open a PR: `gh pr create` (base `main`) summarizing the feature.

---

## Notes for the implementer

- **Grounding requires embeddings.** Personas with `grounding.enabled` need Ollama + `nomic-embed-text` reachable and ingested documents; otherwise grounding silently no-ops (by design) and the review proceeds ungrounded.
- **Service client helper:** the export is `createServiceClient(config)` (from `db/client.ts`, already used throughout `actions.ts`). The verification script (Task 20) imports it from the core index.
- **Mendeley → collection (deferred):** the spec mentions Mendeley sync targeting a collection. v1 ships per-document "Move to collection" (Task 18), which covers organizing Mendeley imports after a sync. Wiring a default collection into `syncMendeley` is a small follow-up, not part of this plan.
- **No `Math.random`/`Date.now` in core seeding ids** — `newAgentId` is deterministic so tests are stable.
- **YAGNI:** no run-history table, no MCP `run_review` tool in v1 (the spec defers both).
```
