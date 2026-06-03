import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Runtime settings — the single source of truth for everything the frontend
 * manages (Supabase credentials, vault location, git remote, model choices).
 *
 * Why a JSON file instead of .env only: a new user configures the app through
 * the UI, not by hand-editing dotfiles. The frontend writes here; the MCP
 * server and the web backend both read here. Env vars still WIN over this file
 * (see config.ts) so CI / power users can override without touching it.
 *
 * Secrets (the Supabase service-role key) live in this file with 0600 perms.
 * The file lives OUTSIDE the repo by default (~/.localopenbrain/settings.json)
 * so it can never be committed.
 */

export interface SupabaseSettings {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

export interface VaultSettings {
  /** Absolute path to the Obsidian vault root. */
  root?: string;
  /** Vault-relative folders the tools are allowed to write into. */
  dirs: {
    literature: string;
    sources: string;
    syntheses: string;
    annotations: string;
    drafts: string;
  };
}

export interface GitSettings {
  /** Whether the vault is managed as a git repo by this app. */
  enabled: boolean;
  /** Remote URL (ssh or https). Empty until the user connects one. */
  remote?: string;
  branch: string;
  /** Auto-commit + push captured notes after each write. */
  autoSync: boolean;
}

export interface ModelSettings {
  /** OpenAI-compatible base URL. Defaults to local Ollama. */
  baseUrl: string;
  /** API key for the model endpoint. Empty for local Ollama. */
  apiKey?: string;
  embedModel: string;
  embedDim: number;
  chatModel: string;
}

export interface Settings {
  version: 1;
  supabase: SupabaseSettings;
  vault: VaultSettings;
  git: GitSettings;
  models: ModelSettings;
  /** Access key gating the MCP HTTP endpoint. Generated on first setup. */
  mcpAccessKey?: string;
  /** True once the setup flow has completed successfully at least once. */
  onboarded: boolean;
}

/** Generic, non-personal defaults — safe for a brand-new user. */
export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  // Local-first: default to the local Supabase stack. To upgrade to managed
  // Supabase, the user just replaces these with their hosted project values —
  // no code or schema changes. Keys are left empty; `supabase start` /
  // `supabase status` prints them, and the setup flow stores them here.
  supabase: { url: "http://127.0.0.1:54321" },
  vault: {
    root: undefined,
    dirs: {
      literature: "Research/Literature Notes",
      sources: "Research/Sources",
      syntheses: "Research/Syntheses",
      annotations: "Research/Annotations",
      drafts: "Research/Drafts",
    },
  },
  git: {
    enabled: false,
    remote: undefined,
    branch: "main",
    autoSync: false,
  },
  models: {
    baseUrl: "http://localhost:11434/v1",
    apiKey: undefined,
    embedModel: "nomic-embed-text",
    embedDim: 768,
    chatModel: "llama3.1:8b",
  },
  onboarded: false,
};

export function settingsPath(): string {
  return (
    process.env.LOB_SETTINGS_PATH ??
    join(homedir(), ".localopenbrain", "settings.json")
  );
}

/** Deep-merge a partial over the defaults so older files gain new keys. */
function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  return {
    ...base,
    ...patch,
    supabase: { ...base.supabase, ...patch.supabase },
    vault: {
      ...base.vault,
      ...patch.vault,
      dirs: { ...base.vault.dirs, ...patch.vault?.dirs },
    },
    git: { ...base.git, ...patch.git },
    models: { ...base.models, ...patch.models },
  };
}

export function loadSettings(): Settings {
  const path = settingsPath();
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Settings>;
    return mergeSettings(DEFAULT_SETTINGS, raw);
  } catch (err) {
    throw new Error(
      `settings file at ${path} is not valid JSON: ${(err as Error).message}`,
    );
  }
}

/** Write settings atomically-ish with restrictive perms (contains secrets). */
export function saveSettings(settings: Settings): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on platforms without POSIX perms.
  }
}

/** Apply a partial patch on top of whatever is on disk and persist it. */
export function updateSettings(patch: Partial<Settings>): Settings {
  const next = mergeSettings(loadSettings(), patch);
  saveSettings(next);
  return next;
}

/** Settings with all secret values masked — safe to send to a browser. */
export function redactSettings(settings: Settings): Settings {
  const mask = (v?: string) => (v ? "••••••••" : undefined);
  return {
    ...settings,
    supabase: {
      ...settings.supabase,
      serviceRoleKey: mask(settings.supabase.serviceRoleKey),
    },
    models: { ...settings.models, apiKey: mask(settings.models.apiKey) },
    mcpAccessKey: mask(settings.mcpAccessKey),
  };
}
