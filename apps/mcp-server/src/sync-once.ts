import { createModelClient, createServiceClient, getConfig, syncMendeley } from "@lob/core";

/**
 * One-shot Mendeley sync — for manual runs or OS schedulers (cron/launchd).
 *   npm run sync [-- --review]
 */
const config = getConfig();
if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.error("Supabase not configured.");
  process.exit(1);
}
const db = createServiceClient(config);
const model = createModelClient(config);
const r = await syncMendeley(db, model, config, { review: process.argv.includes("--review") });
console.log(`Synced: ${r.imported} new, ${r.skipped} already synced, ${r.failed} failed${r.missingFile ? `, ${r.missingFile} missing file` : ""} (of ${r.total}).`);
