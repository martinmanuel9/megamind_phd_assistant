import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReview } from "./run.js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import type { Persona, Workflow } from "../settings.js";

function stubModel(): ModelClient {
  return {
    async chat(messages: { role: string; content: string }[]) {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      const who = sys.match(/acting as: ([^(]+)/)?.[1]?.trim() ?? "Agent";
      return `## Strengths\nGood from ${who}.\n## Weaknesses\nNone.\n## Actionable revisions\n- Revise.\n## Verdict\nPass (${who}).`;
    },
  } as unknown as ModelClient;
}

function fakeDb() {
  return {
    from() {
      return {
        upsert() {
          return {
            select() {
              return {
                single: async () => ({ data: { id: "n1" }, error: null }),
              };
            },
          };
        },
        insert: async () => ({ error: null }),
      };
    },
  } as any;
}

function cfg(root: string): Config {
  return { models: { chatModel: "test-model" }, vault: { root, dirs: { literature: "L", sources: "S", syntheses: "Y", annotations: "A", drafts: "D" } } } as unknown as Config;
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
    assert.equal(res.notes.length, 3);
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

test("sequential workflow feeds prior outputs to later agents", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-seq-"));
  mkdirSync(join(root, "Reviews"), { recursive: true });
  writeFileSync(join(root, "Reviews", "D.md"), "# D\n\nThesis.");
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

test("single persona run (no workflow) writes one note", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-single-"));
  mkdirSync(join(root, "R"), { recursive: true });
  writeFileSync(join(root, "R", "D.md"), "# D\n\nThesis.");
  try {
    const res = await runReview(fakeDb(), stubModel(), cfg(root), {
      artifact: { kind: "note", relPath: "R/D.md" },
      singlePersonaId: "a", personas: [persona("a", "Solo")], targetDir: "R",
      addArtifactToRepo: false, addReviewToRepo: false,
    });
    assert.equal(res.notes.length, 1);
    assert.equal(res.notes[0]!.persona, "Solo");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a failing persona becomes an error note without aborting the run", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-err-"));
  mkdirSync(join(root, "R"), { recursive: true });
  writeFileSync(join(root, "R", "D.md"), "# D\n\nThesis.");
  // Model throws for Bob, succeeds for Alice.
  const model = {
    async chat(messages: { role: string; content: string }[]) {
      const sys = messages.find((m) => m.role === "system")?.content ?? "";
      if (/acting as: Bob/.test(sys)) throw new Error("model boom");
      return "## Strengths\nok\n## Weaknesses\nok\n## Actionable revisions\n- ok\n## Verdict\nok";
    },
  } as any;
  const wf: Workflow = { id: "w", name: "Two", mode: "parallel", steps: [{ personaId: "a" }, { personaId: "b" }], synthesis: { enabled: false } };
  try {
    const res = await runReview(fakeDb(), model, cfg(root), {
      artifact: { kind: "note", relPath: "R/D.md" }, workflow: wf,
      personas: [persona("a", "Alice"), persona("b", "Bob")], targetDir: "R",
      addArtifactToRepo: false, addReviewToRepo: false,
    });
    assert.equal(res.notes.length, 2);
    const bob = res.notes.find((n) => n.persona === "Bob")!;
    assert.equal(bob.error, true);
    const alice = res.notes.find((n) => n.persona === "Alice")!;
    assert.ok(!alice.error);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("filename collisions are disambiguated with a numeric suffix", async () => {
  const root = mkdtempSync(join(tmpdir(), "lob-collide-"));
  mkdirSync(join(root, "R"), { recursive: true });
  writeFileSync(join(root, "R", "D.md"), "# D\n\nThesis.");
  // fakeDb here returns success for upsert; the on-disk collision is what we exercise.
  // Pre-create the file the first note would use so the writer must disambiguate.
  // First run writes "D — Solo review.md"; second run must write "...review 2.md".
  try {
    const opts = {
      artifact: { kind: "note", relPath: "R/D.md" } as const,
      singlePersonaId: "a", personas: [persona("a", "Solo")], targetDir: "R",
      addArtifactToRepo: false, addReviewToRepo: false,
    };
    const first = await runReview(fakeDb(), stubModel(), cfg(root), opts);
    const second = await runReview(fakeDb(), stubModel(), cfg(root), opts);
    assert.notEqual(first.notes[0]!.relPath, second.notes[0]!.relPath);
    assert.match(second.notes[0]!.relPath, /2\.md$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
