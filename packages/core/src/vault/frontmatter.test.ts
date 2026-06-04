import { test } from "node:test";
import assert from "node:assert/strict";
import { emitFrontmatter, extractBibliographyFields, extractFrontmatterFields } from "./frontmatter.js";

test("emit + extract round-trips created and tags", () => {
  const fm = emitFrontmatter([
    ["created", "2024-01-01"],
    ["tags", ["topic/a", "topic/b"]],
  ]);
  const got = extractFrontmatterFields(fm);
  assert.equal(got.created, "2024-01-01");
  assert.deepEqual(got.tags, ["topic/a", "topic/b"]);
});

test("emit quotes values containing colon-space", () => {
  const fm = emitFrontmatter([["title", "A: B"]]);
  assert.match(fm, /title: "A: B"/);
});

test("emit writes empty array as a bare key", () => {
  const fm = emitFrontmatter([["tags", []]]);
  assert.match(fm, /^tags:$/m);
});

test("emit renders null as a bare key", () => {
  const fm = emitFrontmatter([["doi", null]]);
  assert.match(fm, /^doi:$/m);
});

test("extractBibliographyFields reads authors block and scalars", () => {
  const fm = emitFrontmatter([
    ["authors", ["Doe, J.", "Smith, A."]],
    ["doi", "10.1234/x"],
    ["venue", "NeurIPS"],
    ["published", "2023-05-10"],
  ]);
  const b = extractBibliographyFields(fm);
  assert.deepEqual(b.authors, ["Doe, J.", "Smith, A."]);
  assert.equal(b.doi, "10.1234/x");
  assert.equal(b.venue, "NeurIPS");
  assert.equal(b.published, "2023-05-10");
});

test("extract returns empty when no frontmatter", () => {
  const got = extractFrontmatterFields("# Just a heading\n\nbody");
  assert.equal(got.created, undefined);
  assert.deepEqual(got.tags, []);
});
