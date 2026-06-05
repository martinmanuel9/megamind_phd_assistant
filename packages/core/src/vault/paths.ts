import { mkdirSync, readdirSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Vault path safety. Ported from open-brain's guard, generalized so the set of
 * writable folders comes from settings instead of being hardcoded to one user's
 * project. Layered defenses, weakest → strongest:
 *   1. string check    — reject "..", leading "/" or "~"
 *   2. realpath check  — resolve symlinks; result must be under the vault root
 *   3. hidden-dir check — writes may land in any non-hidden folder in the vault
 * (A 4th OS-level boundary is added by the process sandbox / least-privilege
 *  user running the server.)
 */

const ILLEGAL_CHARS = /[/\\:?*<>|"]/g;
const MAX_TITLE_LEN = 100;

export class TitleSanitizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TitleSanitizationError";
  }
}

export class OutsideVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutsideVaultError";
  }
}

export class VaultRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultRootError";
  }
}

/** Confirm the vault root exists and is a directory. Does NOT require subfolders. */
export function assertVaultRoot(root: string): string {
  let stat;
  try {
    stat = statSync(root);
  } catch {
    throw new VaultRootError(`vault root does not exist: ${root}`);
  }
  if (!stat.isDirectory()) {
    throw new VaultRootError(`vault root is not a directory: ${root}`);
  }
  return realpathSync(root);
}

/**
 * Create the configured write folders if missing. This is what lets a brand-new
 * user point at an empty (or freshly created) vault and have the research
 * structure scaffolded for them. Safe: only ever creates dirs inside the root.
 */
export function ensureVaultLayout(root: string, writeDirs: string[]): void {
  const realRoot = assertVaultRoot(root);
  for (const dir of writeDirs) {
    if (dir.includes("..")) {
      throw new OutsideVaultError(`write dir escapes vault: ${dir}`);
    }
    mkdirSync(join(realRoot, dir), { recursive: true });
  }
}

/**
 * Resolve a vault-relative path to an absolute path, refusing anything that
 * escapes the vault. When forWrite, the parent may be any non-hidden folder
 * inside the vault (the writeDirs param is retained for API compatibility but
 * is no longer consulted for the write decision).
 */
export function resolveInsideVault(
  vaultRoot: string,
  relPath: string,
  opts: { forWrite: boolean; writeDirs: string[] },
): string {
  if (relPath.startsWith("/") || relPath.startsWith("~")) {
    throw new OutsideVaultError(`path must be relative, got: ${relPath}`);
  }
  const segments = relPath.split(/[/\\]/);
  if (segments.includes("..")) {
    throw new OutsideVaultError(`path contains '..': ${relPath}`);
  }
  if (segments[segments.length - 1] === "") {
    throw new OutsideVaultError(`path must name a file, got: ${relPath}`);
  }

  const realRoot = realpathSync(vaultRoot);
  const candidate = join(realRoot, relPath);
  const lastSep = candidate.lastIndexOf("/");
  const parent = candidate.slice(0, lastSep);
  const filename = candidate.slice(lastSep + 1);

  let parentReal: string;
  try {
    parentReal = realpathSync(parent);
  } catch {
    throw new OutsideVaultError(`parent directory does not exist: ${parent}`);
  }

  if (parentReal !== realRoot && !parentReal.startsWith(realRoot + "/")) {
    throw new OutsideVaultError(`resolved path escapes vault: ${parentReal}`);
  }

  if (opts.forWrite) {
    // Writes may land in ANY folder inside the vault, except hidden dirs
    // (.obsidian, .git, .trash, dotfiles). The realpath/.. /outside-root checks
    // above remain the strong boundary.
    const rel = parentReal.slice(realRoot.length).replace(/^\//, "");
    const hidden = rel.split("/").some((seg) => seg.startsWith("."));
    if (hidden) {
      throw new OutsideVaultError(`writes not allowed in hidden folders: ${rel}`);
    }
  }

  return join(parentReal, filename);
}

export function sanitizeTitle(raw: string): string {
  const cleaned = raw.replace(ILLEGAL_CHARS, "-").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) {
    throw new TitleSanitizationError("title-sanitization-failed: result is empty");
  }
  if (cleaned.length <= MAX_TITLE_LEN) return cleaned;
  const window = cleaned.slice(0, MAX_TITLE_LEN + 1);
  const lastSpace = window.lastIndexOf(" ");
  const cut = lastSpace > 0 ? lastSpace : MAX_TITLE_LEN;
  return cleaned.slice(0, cut).trimEnd();
}

/**
 * List every non-hidden folder in the vault, as vault-relative POSIX paths,
 * sorted. The filesystem is the source of truth — call this fresh to reflect
 * changes the user made directly in Obsidian.
 */
export function listVaultTree(root: string): string[] {
  const realRoot = assertVaultRoot(root);
  const out: string[] = [];
  const walk = (absDir: string, rel: string) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      out.push(childRel);
      walk(join(absDir, e.name), childRel);
    }
  };
  walk(realRoot, "");
  return out.sort();
}

/**
 * List every non-hidden Markdown file in the vault, as vault-relative POSIX
 * paths, sorted. Companion to listVaultTree (which lists folders).
 */
export function listVaultMarkdown(root: string): string[] {
  const realRoot = assertVaultRoot(root);
  const out: string[] = [];
  const walk = (absDir: string, rel: string) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(absDir, e.name), childRel);
      else if (e.isFile() && /\.md$/i.test(e.name)) out.push(childRel);
    }
  };
  walk(realRoot, "");
  return out.sort();
}

/**
 * Create a folder inside the vault (recursively). Guards against escapes and
 * hidden dirs. Returns the created vault-relative path.
 */
export function createVaultFolder(root: string, relDir: string): string {
  const clean = relDir.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!clean) throw new OutsideVaultError("folder path is empty");
  if (clean.startsWith("~")) throw new OutsideVaultError(`path must be relative: ${relDir}`);
  const segments = clean.split("/");
  if (segments.includes("..")) throw new OutsideVaultError(`path contains '..': ${relDir}`);
  if (segments.some((s) => s.startsWith("."))) {
    throw new OutsideVaultError(`hidden folders are not allowed: ${relDir}`);
  }
  const realRoot = assertVaultRoot(root);
  mkdirSync(join(realRoot, clean), { recursive: true });
  return clean;
}
