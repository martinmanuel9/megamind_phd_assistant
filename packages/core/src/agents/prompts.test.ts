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
