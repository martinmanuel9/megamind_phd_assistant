import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCitation } from "./bibliography.js";

test("markdown citation for a web article", () => {
  const c = formatCitation(
    { title: "Title", authors: ["Doe, J."], published: "2024-01-02", venue: "Blog", source: "https://x" },
    "markdown",
  );
  assert.match(c, /\*\*Doe, J\.\*\*/);
  assert.match(c, /\(2024-01-02\)/);
  assert.match(c, /"Title\."/);
  assert.match(c, /\[link\]\(https:\/\/x\)/);
});

test("APA journal citation with volume/issue/pages and DOI", () => {
  const c = formatCitation(
    { title: "My Article", authors: ["Doe, J.", "Smith, A."], published: "2023-05-10", venue: "JAIR", volume: "12", issue: "3", pages: "1-20", doi: "10.1/x" },
    "apa",
  );
  assert.match(c, /Doe, J\., & Smith, A\./);
  assert.match(c, /\*JAIR\*, 12\(3\), 1-20/);
  assert.match(c, /doi\.org\/10\.1\/x/);
});

test("Chicago book citation", () => {
  const c = formatCitation(
    { title: "Some Book", authors: ["Doe, J."], published: "2020", isbn: "123", publisher: "Pub House" },
    "chicago",
  );
  assert.match(c, /\*Some Book\*\./);
  assert.match(c, /Pub House\./);
  assert.match(c, /2020\./);
});

test("falls back gracefully with no authors and no date", () => {
  const md = formatCitation({ title: "Orphan" }, "markdown");
  assert.match(md, /Unknown author/);
  const apa = formatCitation({ title: "Orphan" }, "apa");
  assert.match(apa, /\(n\.d\.\)\./);
});
