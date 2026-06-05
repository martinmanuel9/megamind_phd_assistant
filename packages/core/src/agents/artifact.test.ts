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
