import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "./chunk.js";

const opts = { targetTokens: 100, overlapTokens: 0 };

test("short text yields a single chunk", () => {
  const cs = chunkText("Hello world.\n\nSecond paragraph here.", { targetTokens: 512, overlapTokens: 0 });
  assert.equal(cs.length, 1);
  assert.equal(cs[0]!.ord, 0);
});

test("long text splits into multiple ordered chunks", () => {
  const para = "word ".repeat(120).trim(); // ~150 tokens, above target
  const text = Array.from({ length: 5 }, (_, i) => `Para${i} ${para}`).join("\n\n");
  const cs = chunkText(text, opts);
  assert.ok(cs.length > 1);
  cs.forEach((c, i) => assert.equal(c.ord, i));
});

test("recursive split bounds an over-long single paragraph", () => {
  const huge = "sentence here. ".repeat(400); // one giant paragraph
  const cs = chunkText(huge, opts);
  assert.ok(cs.length > 1);
  // No chunk should greatly exceed the target (estimate slack).
  for (const c of cs) assert.ok(c.tokenCount <= opts.targetTokens * 1.3, `chunk ${c.ord} too big: ${c.tokenCount}`);
});

test("captures the nearest heading as section", () => {
  const cs = chunkText("# Methods\n\nWe ran the experiment carefully.", { targetTokens: 512, overlapTokens: 0 });
  assert.equal(cs[0]!.section, "Methods");
});

test("overlap carries context across boundaries", () => {
  const para = "alpha beta gamma delta. ".repeat(20).trim();
  const text = Array.from({ length: 4 }, (_, i) => `P${i} ${para}`).join("\n\n");
  const withOverlap = chunkText(text, { targetTokens: 80, overlapTokens: 30 });
  const without = chunkText(text, { targetTokens: 80, overlapTokens: 0 });
  // Overlap should not reduce chunk count and total text should be >= no-overlap.
  const lenWith = withOverlap.reduce((n, c) => n + c.text.length, 0);
  const lenWithout = without.reduce((n, c) => n + c.text.length, 0);
  assert.ok(lenWith >= lenWithout);
});
