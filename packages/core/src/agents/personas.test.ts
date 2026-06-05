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
  const ids = new Set(seeded.personas.map((p) => p.id));
  for (const w of seeded.workflows) for (const s of w.steps) assert.ok(ids.has(s.personaId));
});

test("seedAgents is idempotent (no duplicates on re-seed)", () => {
  const once = seedAgents(structuredClone(DEFAULT_SETTINGS).agents);
  const twice = seedAgents(once);
  assert.equal(twice.personas.length, once.personas.length);
  assert.equal(twice.workflows.length, once.workflows.length);
});
