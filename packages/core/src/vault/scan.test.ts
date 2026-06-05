import { test } from "node:test";
import assert from "node:assert/strict";
import { frontmatterType, isEmbeddable, diffNotes } from "./scan.js";

test("frontmatterType reads the type scalar from frontmatter", () => {
  assert.equal(frontmatterType("---\ntype: literature\nstatus: x\n---\n# T"), "literature");
  assert.equal(frontmatterType('---\ntype: "source"\n---\nbody'), "source");
  assert.equal(frontmatterType("# no frontmatter"), undefined);
  assert.equal(frontmatterType("---\nstatus: x\n---\n"), undefined);
});

test("isEmbeddable skips source notes only", () => {
  assert.equal(isEmbeddable("literature"), true);
  assert.equal(isEmbeddable("draft"), true);
  assert.equal(isEmbeddable(undefined), true);
  assert.equal(isEmbeddable("source"), false);
});

test("diffNotes computes added and removed sets", () => {
  const d = diffNotes(["a.md", "b.md", "c.md"], ["b.md", "x.md"]);
  assert.deepEqual(d.added, ["a.md", "c.md"]);
  assert.deepEqual(d.removed, ["x.md"]);
});
