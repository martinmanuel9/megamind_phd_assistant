import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type Config, requireSupabase } from "../config.js";

/**
 * Server-side Supabase client using the service-role key. This bypasses RLS, so
 * it must only ever run on the server (MCP server / Next.js route handlers),
 * never shipped to the browser.
 */
export function createServiceClient(config: Config): SupabaseClient {
  const { url, serviceRoleKey } = requireSupabase(config);
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Lightweight connectivity check used by the setup flow: confirms the URL +
 * key are valid and the schema migration has been applied. Returns a typed
 * result instead of throwing so the UI can render a precise status.
 */
export async function checkSupabase(
  config: Config,
): Promise<{ ok: boolean; reason?: string; migrated?: boolean }> {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) {
    return { ok: false, reason: "missing-credentials" };
  }
  let client: SupabaseClient;
  try {
    client = createServiceClient(config);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  // Probe a known table. A "relation does not exist" error means the connection
  // works but the migration hasn't run yet — a distinct, actionable state.
  const { error } = await client.from("documents").select("id").limit(1);
  if (error) {
    const missing = /does not exist|schema cache/i.test(error.message);
    return {
      ok: !missing,
      migrated: !missing,
      reason: missing ? "not-migrated" : error.message,
    };
  }
  return { ok: true, migrated: true };
}
