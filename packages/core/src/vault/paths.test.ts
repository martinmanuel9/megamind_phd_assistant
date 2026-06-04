import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureVaultLayout,
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

test("resolveInsideVault rejects writes outside the allowlist", () => {
  const root = makeVault();
  mkdirSync(join(root, "Other"));
  try {
    assert.throws(() => resolveInsideVault(root, "Other/x.md", { forWrite: true, writeDirs: WRITE_DIRS }), OutsideVaultError);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
