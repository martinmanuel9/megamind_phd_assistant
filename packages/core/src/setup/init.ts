import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { type Config, getConfig } from "../config.js";
import { checkSupabase } from "../db/client.js";
import { ensureVaultLayout } from "../vault/paths.js";
import * as git from "../vault/git.js";
import { loadSettings, saveSettings } from "../settings.js";

/**
 * Setup + health utilities used by the onboarding flow (frontend) and the
 * `npm run setup` CLI. Designed for a brand-new user: every check returns a
 * precise, actionable status instead of throwing.
 */

export function generateAccessKey(): string {
  return randomBytes(24).toString("base64url");
}

export interface DoctorReport {
  onboarded: boolean;
  supabase: { ok: boolean; migrated?: boolean; reason?: string };
  vault: { configured: boolean; exists: boolean; root?: string; layoutReady: boolean };
  models: { reachable: boolean; baseUrl: string; embedModel: string; reason?: string };
  git: { isRepo: boolean; remote?: string; branch?: string; dirty?: number };
  mcp: { hasAccessKey: boolean };
}

/** Probe the model endpoint cheaply (one tiny embedding). */
async function probeModels(config: Config): Promise<DoctorReport["models"]> {
  const base = { reachable: false, baseUrl: config.models.baseUrl, embedModel: config.models.embedModel };
  try {
    const r = await fetch(`${config.models.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.models.apiKey ? { Authorization: `Bearer ${config.models.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.models.embedModel, input: "search_query: ping" }),
    });
    if (!r.ok) return { ...base, reason: `HTTP ${r.status}` };
    return { ...base, reachable: true };
  } catch (err) {
    return { ...base, reason: (err as Error).message };
  }
}

export async function doctor(config: Config = getConfig()): Promise<DoctorReport> {
  const supabase = await checkSupabase(config);
  const models = await probeModels(config);

  const root = config.vault.root;
  const exists = !!root && existsSync(root);
  let layoutReady = false;
  if (root && exists) {
    layoutReady = Object.values(config.vault.dirs).every((d) => existsSync(`${root}/${d}`));
  }

  let gitReport: DoctorReport["git"] = { isRepo: false };
  if (root && exists) {
    const s = await git.status(root).catch(() => null);
    if (s) gitReport = { isRepo: s.isRepo, remote: s.remote, branch: s.branch, dirty: s.dirty };
  }

  return {
    onboarded: config.settings.onboarded,
    supabase: { ok: supabase.ok, migrated: supabase.migrated, reason: supabase.reason },
    vault: { configured: !!root, exists, root, layoutReady },
    models,
    git: gitReport,
    mcp: { hasAccessKey: !!config.mcp.accessKey },
  };
}

export interface InitVaultOptions {
  /** Create the research folder structure. */
  scaffold?: boolean;
  /** `git init` if not already a repo. */
  initGit?: boolean;
  /** Connect (or re-point) origin to this URL. */
  remote?: string;
  branch?: string;
}

/** Prepare a vault for use: scaffold folders, optionally init git + remote. */
export async function initVault(config: Config, opts: InitVaultOptions): Promise<void> {
  const root = config.vault.root;
  if (!root) throw new Error("vault root not configured");
  if (opts.scaffold !== false) ensureVaultLayout(root, Object.values(config.vault.dirs));
  if (opts.initGit) await git.init(root, opts.branch ?? config.git.branch);
  if (opts.remote) await git.setRemote(root, opts.remote);
}

/**
 * Ensure an MCP access key exists, generating + persisting one on first run.
 * Returns the key so the frontend can show it for client configuration.
 */
export function ensureAccessKey(): string {
  const s = loadSettings();
  if (s.mcpAccessKey) return s.mcpAccessKey;
  const key = generateAccessKey();
  saveSettings({ ...s, mcpAccessKey: key });
  return key;
}

export function markOnboarded(): void {
  const s = loadSettings();
  if (!s.onboarded) saveSettings({ ...s, onboarded: true });
}
