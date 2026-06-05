import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureVaultLayout,
  listVaultMarkdown,
  listVaultTree,
  createVaultFolder,
  OutsideVaultError,
  resolveInsideVault,
  sanitizeTitle,
  TitleSanitizationError,
} from "./paths.js";

const WRITE_DIRS = ["Research/Articles", "Research/Notes"];

function makeVault(): string {
  const root = mkdtempSync(join(tmpdir(), "lob-vault-"));
  ensureVaultLayout(root, WRITE_DIRS);
  return root;
}

test("sanitizeTitle replaces illegal characters", () => {
  assert.equal(sanitizeTitle("Hello: World?/Test"), "Hello- World--Test");
  assert.equal(sanitizeTitle("  spaced   out  "), "spaced out");
});

test("sanitizeTitle throws when result is empty", () => {
  assert.throws(() => sanitizeTitle("   "), TitleSanitizationError);
});

test("sanitizeTitle truncates long titles on a word boundary", () => {
  const long = "word ".repeat(40); // 200 chars
  const out = sanitizeTitle(long);
  assert.ok(out.length <= 100);
  assert.ok(!out.endsWith(" "));
});

test("resolveInsideVault allows a valid write path", () => {
  const root = makeVault();
  try {
    const p = resolveInsideVault(root, "Research/Articles/Note.md", { forWrite: true, writeDirs: WRITE_DIRS });
    assert.ok(p.endsWith("/Research/Articles/Note.md"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveInsideVault rejects .. traversal", () => {
  const root = makeVault();
  try {
    assert.throws(() => resolveInsideVault(root, "../escape.md", { forWrite: true, writeDirs: WRITE_DIRS }), OutsideVaultError);
    assert.throws(() => resolveInsideVault(root, "Research/Articles/../../../escape.md", { forWrite: true, writeDirs: WRITE_DIRS }), OutsideVaultError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveInsideVault rejects absolute and ~ paths", () => {
  const root = makeVault();
  try {
    assert.throws(() => resolveInsideVault(root, "/etc/passwd", { forWrite: true, writeDirs: WRITE_DIRS }), OutsideVaultError);
    assert.throws(() => resolveInsideVault(root, "~/secret.md", { forWrite: true, writeDirs: WRITE_DIRS }), OutsideVaultError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

test("listVaultMarkdown returns non-hidden .md files relative to root, sorted", () => {
  const root = makeVault();
  mkdirSync(join(root, "Sub"), { recursive: true });
  mkdirSync(join(root, ".obsidian"), { recursive: true });
  writeFileSync(join(root, "a.md"), "# a");
  writeFileSync(join(root, "Sub", "b.md"), "# b");
  writeFileSync(join(root, "Sub", "c.txt"), "not md");
  writeFileSync(join(root, ".obsidian", "hidden.md"), "# hidden");
  try {
    const files = listVaultMarkdown(root);
    assert.deepEqual(files, ["Sub/b.md", "a.md"].sort());
    assert.ok(!files.some((f) => f.includes(".obsidian")));
    assert.ok(!files.some((f) => f.endsWith(".txt")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
