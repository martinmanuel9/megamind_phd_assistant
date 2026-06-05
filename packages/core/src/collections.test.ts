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

test("collectionSlug preserves digits and already-slug names", () => {
  assert.equal(collectionSlug("methods"), "methods");
  assert.equal(collectionSlug("2024"), "2024");
});
