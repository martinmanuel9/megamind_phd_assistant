import { loadSettings, type Settings } from "./settings.js";

/**
 * Resolved, validated configuration the rest of the app consumes.
 *
 * Precedence (highest first):
 *   1. process.env       — CI / power-user override, never persisted
 *   2. settings.json     — what the frontend manages
 *   3. DEFAULT_SETTINGS  — generic, non-personal defaults
 *
 * Nothing here is hardcoded to a particular user. A field being missing is a
 * setup state, not a crash — callers that need a field assert it explicitly
 * (e.g. requireSupabase) so error messages point the user at the setup flow.
 */

export interface Config {
  settings: Settings;
  supabase: { url?: string; anonKey?: string; serviceRoleKey?: string };
  models: {
    baseUrl: string;
    apiKey?: string;
    embedModel: string;
    embedDim: number;
    chatModel: string;
  };
  vault: {
    root?: string;
    dirs: Settings["vault"]["dirs"];
  };
  git: Settings["git"];
  mcp: { accessKey?: string; port: number; host: string };
}

const env = (k: string) => {
  const v = process.env[k];
  return v && v.length > 0 ? v : undefined;
};

export function getConfig(): Config {
  const s = loadSettings();
  return {
    settings: s,
    supabase: {
      url: env("SUPABASE_URL") ?? s.supabase.url,
      anonKey: env("SUPABASE_ANON_KEY") ?? s.supabase.anonKey,
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY") ?? s.supabase.serviceRoleKey,
    },
    models: {
      baseUrl: env("OLLAMA_BASE_URL") ?? env("MODEL_BASE_URL") ?? s.models.baseUrl,
      apiKey: env("MODEL_API_KEY") ?? s.models.apiKey,
      embedModel: env("EMBED_MODEL") ?? s.models.embedModel,
      embedDim: Number(env("EMBED_DIM") ?? s.models.embedDim),
      chatModel: env("CHAT_MODEL") ?? s.models.chatModel,
    },
    vault: {
      root: env("VAULT_ROOT") ?? s.vault.root,
      dirs: s.vault.dirs,
    },
    git: s.git,
    mcp: {
      accessKey: env("MCP_ACCESS_KEY") ?? s.mcpAccessKey,
      port: Number(env("MCP_PORT") ?? 8787),
      host: env("MCP_HOST") ?? "127.0.0.1",
    },
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function requireSupabase(c: Config): {
  url: string;
  serviceRoleKey: string;
} {
  if (!c.supabase.url || !c.supabase.serviceRoleKey) {
    throw new ConfigError(
      "Supabase is not configured. Set the project URL and service-role key " +
        "in the app settings (Setup → Supabase) or via SUPABASE_URL / " +
        "SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return { url: c.supabase.url, serviceRoleKey: c.supabase.serviceRoleKey };
}

export function requireVaultRoot(c: Config): string {
  if (!c.vault.root) {
    throw new ConfigError(
      "No Obsidian vault configured. Choose or create a vault in the app " +
        "settings (Setup → Vault) or set VAULT_ROOT.",
    );
  }
  return c.vault.root;
}
