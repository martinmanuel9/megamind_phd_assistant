import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Vault git service. Wraps plain `git` so the frontend can connect a GitHub
 * remote and run status/commit/pull/push/sync from the UI — no `gh` CLI
 * required (auth flows through the user's SSH key or a credential helper).
 *
 * Every command is scoped to the vault directory via `cwd`; we never shell out
 * with interpolated user strings (args are passed as an array to execFile).
 */

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  remote?: string;
  ahead: number;
  behind: number;
  /** Count of changed/untracked files. */
  dirty: number;
  files: { status: string; path: string }[];
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 1024 * 1024 * 16 });
  return stdout.trim();
}

export function isGitRepo(vaultRoot: string): boolean {
  return existsSync(join(vaultRoot, ".git"));
}

export async function status(vaultRoot: string): Promise<GitStatus> {
  if (!isGitRepo(vaultRoot)) {
    return { isRepo: false, ahead: 0, behind: 0, dirty: 0, files: [] };
  }
  const branch = await git(vaultRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(
    () => undefined,
  );
  const remote = await git(vaultRoot, ["remote", "get-url", "origin"]).catch(
    () => undefined,
  );

  const porcelain = await git(vaultRoot, ["status", "--porcelain=v1", "--branch"]);
  const lines = porcelain.split("\n").filter(Boolean);
  let ahead = 0;
  let behind = 0;
  const files: { status: string; path: string }[] = [];
  for (const line of lines) {
    if (line.startsWith("##")) {
      ahead = Number(/ahead (\d+)/.exec(line)?.[1] ?? 0);
      behind = Number(/behind (\d+)/.exec(line)?.[1] ?? 0);
      continue;
    }
    files.push({ status: line.slice(0, 2).trim(), path: line.slice(3) });
  }

  return { isRepo: true, branch, remote, ahead, behind, dirty: files.length, files };
}

/** Initialize a git repo in a fresh vault (new-user path). */
export async function init(vaultRoot: string, branch = "main"): Promise<void> {
  if (isGitRepo(vaultRoot)) return;
  await git(vaultRoot, ["init"]);
  // Set the initial (unborn) branch without requiring `git init -b`, which only
  // exists on git >= 2.28. Works on older git (e.g. macOS system git 2.23).
  await git(vaultRoot, ["symbolic-ref", "HEAD", `refs/heads/${branch}`]);
}

/** Connect (or re-point) the origin remote. */
export async function setRemote(vaultRoot: string, url: string): Promise<void> {
  const existing = await git(vaultRoot, ["remote"]).catch(() => "");
  if (existing.split("\n").includes("origin")) {
    await git(vaultRoot, ["remote", "set-url", "origin", url]);
  } else {
    await git(vaultRoot, ["remote", "add", "origin", url]);
  }
}

export async function commit(vaultRoot: string, message: string): Promise<boolean> {
  await git(vaultRoot, ["add", "-A"]);
  // `git commit` exits non-zero when there is nothing staged; treat as no-op.
  try {
    await git(vaultRoot, ["commit", "-m", message]);
    return true;
  } catch {
    return false;
  }
}

export async function pull(vaultRoot: string): Promise<string> {
  return git(vaultRoot, ["pull", "--rebase", "--autostash"]);
}

export async function push(vaultRoot: string, branch = "main"): Promise<string> {
  return git(vaultRoot, ["push", "-u", "origin", branch]);
}

/**
 * One-shot sync used after captures when autoSync is on: commit local changes,
 * pull remote with rebase, push. Returns a summary the UI can show.
 */
export async function sync(
  vaultRoot: string,
  message: string,
  branch = "main",
): Promise<{ committed: boolean; pulled: string; pushed: string }> {
  const committed = await commit(vaultRoot, message);
  const pulled = await pull(vaultRoot).catch((e) => `pull skipped: ${e.message}`);
  const pushed = await push(vaultRoot, branch).catch((e) => `push failed: ${e.message}`);
  return { committed, pulled, pushed };
}
