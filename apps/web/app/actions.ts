"use server";

import {
  checkSupabase,
  createServiceClient,
  doctor,
  ensureAccessKey,
  getConfig,
  git,
  initVault,
  loadSettings,
  markOnboarded,
  redactSettings,
  updateSettings,
  type DoctorReport,
  type Settings,
} from "@lob/core";

/**
 * Server actions — the ONLY bridge from the browser to @lob/core. Everything
 * here runs on the Node server; secrets and the filesystem never reach the
 * client. Each export is an async function (Next.js "use server" requirement).
 */

const MASK = "••••••••";

export async function fetchStatus(): Promise<DoctorReport> {
  return doctor();
}

export async function fetchSettings(): Promise<Settings> {
  return redactSettings(loadSettings());
}

export async function saveSupabase(input: {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}): Promise<{ ok: boolean; migrated?: boolean; reason?: string }> {
  const supabase: Settings["supabase"] = {
    url: input.url || undefined,
    anonKey: input.anonKey && input.anonKey !== MASK ? input.anonKey : undefined,
  };
  // Only overwrite the secret if a real (non-masked) value was entered.
  if (input.serviceRoleKey && input.serviceRoleKey !== MASK) {
    supabase.serviceRoleKey = input.serviceRoleKey;
  }
  updateSettings({ supabase });
  return checkSupabase(getConfig());
}

export async function saveModels(input: {
  baseUrl: string;
  apiKey: string;
  embedModel: string;
  embedDim: number;
  chatModel: string;
}): Promise<DoctorReport> {
  const models: Partial<Settings["models"]> = {
    baseUrl: input.baseUrl,
    embedModel: input.embedModel,
    embedDim: Number(input.embedDim),
    chatModel: input.chatModel,
  };
  if (input.apiKey && input.apiKey !== MASK) models.apiKey = input.apiKey;
  updateSettings({ models: models as Settings["models"] });
  return doctor();
}

export async function saveVault(input: { root: string }): Promise<DoctorReport> {
  updateSettings({ vault: { root: input.root || undefined } as Settings["vault"] });
  const config = getConfig();
  if (config.vault.root) initVault(config, { scaffold: true });
  return doctor();
}

export async function connectGitHub(input: {
  remote: string;
  branch?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = getConfig();
    if (!config.vault.root) return { ok: false, error: "Set a vault first." };
    await initVault(config, { initGit: true, remote: input.remote, branch: input.branch ?? "main" });
    const cur = loadSettings();
    updateSettings({
      git: { ...cur.git, enabled: true, remote: input.remote, branch: input.branch ?? "main" },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function vaultGitStatus() {
  const config = getConfig();
  if (!config.vault.root || !git.isGitRepo(config.vault.root)) return null;
  return git.status(config.vault.root);
}

export async function vaultSync(message?: string) {
  const config = getConfig();
  if (!config.vault.root) return { committed: false, pulled: "no vault", pushed: "" };
  return git.sync(config.vault.root, message ?? `vault sync ${new Date().toISOString()}`, config.git.branch);
}

export async function regenerateAccessKey(): Promise<string> {
  // Clear the key, then re-ensure generates a fresh one.
  updateSettings({ mcpAccessKey: undefined });
  return ensureAccessKey();
}

export async function completeOnboarding(): Promise<void> {
  markOnboarded();
}

export interface DocumentSummary {
  id: string;
  title: string;
  authors: string[];
  kind: string;
  status: string;
  created_at: string;
}

export async function listDocuments(): Promise<DocumentSummary[]> {
  const config = getConfig();
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return [];
  const db = createServiceClient(config);
  const { data, error } = await db
    .from("documents")
    .select("id, title, authors, kind, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []) as DocumentSummary[];
}
