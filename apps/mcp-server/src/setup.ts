import { doctor, ensureAccessKey, getConfig, settingsPath } from "@lob/core";

/**
 * `npm run setup` — a new-user health check. Prints exactly what's configured
 * and what still needs attention, with the precise next step for each gap.
 */

const ok = (b: boolean | undefined) => (b ? "✅" : "❌");

const report = await doctor();
const config = getConfig();

console.log("\nlocalopenbrainobsidian — setup check\n");
console.log(`settings file: ${settingsPath()}`);
console.log(`onboarded: ${ok(report.onboarded)}\n`);

console.log(`${ok(report.supabase.ok)} Supabase`);
if (!report.supabase.ok) {
  if (report.supabase.reason === "missing-credentials") {
    console.log("   → set project URL + service-role key in settings (Setup → Supabase) or env.");
  } else if (report.supabase.reason === "not-migrated") {
    console.log("   → connected, but schema missing. Apply supabase/migrations/0001_init.sql");
    console.log("     (supabase db push, or paste it into the SQL editor).");
  } else {
    console.log(`   → ${report.supabase.reason}`);
  }
} else if (!report.supabase.migrated) {
  console.log("   → connected but not migrated; apply supabase/migrations/0001_init.sql");
}

console.log(`${ok(report.models.reachable)} Models (${report.models.baseUrl}, ${report.models.embedModel})`);
if (!report.models.reachable) console.log(`   → ${report.models.reason ?? "endpoint unreachable"} (is Ollama running?)`);

console.log(`${ok(report.vault.configured && report.vault.exists)} Vault`);
if (!report.vault.configured) console.log("   → choose/create a vault (Setup → Vault) or set VAULT_ROOT.");
else if (!report.vault.exists) console.log(`   → configured path does not exist: ${report.vault.root}`);
else if (!report.vault.layoutReady) console.log("   → research folders not scaffolded yet (run initVault).");

console.log(`${ok(report.git.isRepo)} Vault git${report.git.remote ? ` → ${report.git.remote}` : ""}`);
if (!report.git.isRepo && report.vault.exists) console.log("   → not a git repo; connect one (Setup → GitHub) to enable sync.");

const key = ensureAccessKey();
console.log(`\nMCP access key: ${key}`);
console.log(`Connect clients to: http://${config.mcp.host}:${config.mcp.port}?key=${key}\n`);
