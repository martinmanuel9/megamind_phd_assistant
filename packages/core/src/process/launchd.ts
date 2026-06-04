import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Config } from "../config.js";
import { settingsPath } from "../settings.js";
import { findRepoRoot } from "./mcp.js";

/**
 * macOS launchd integration — lets the front end install OS-level agents so
 * background sync (and optionally the MCP server) keep running independently of
 * any open terminal, surviving logout/reboot. All agent config derives from the
 * app's settings, so the UI stays the single source of truth.
 *
 * Agents shell out via `bash -lc` (a login shell, so node/npm/supabase are on
 * PATH) and `cd` into the repo, then run the existing npm scripts.
 */

export const SYNC_LABEL = "com.localopenbrain.sync";
export const MCP_LABEL = "com.localopenbrain.mcp";

const agentsDir = () => join(homedir(), "Library/LaunchAgents");
const plistPath = (label: string) => join(agentsDir(), `${label}.plist`);
const lobDir = () => dirname(settingsPath());
const uid = () => (typeof process.getuid === "function" ? process.getuid() : 501);

interface AgentSpec {
  label: string;
  /** Shell command run inside the repo root via `bash -lc`. */
  command: string;
  startInterval?: number; // seconds
  keepAlive?: boolean;
  runAtLoad?: boolean;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPlist(spec: AgentSpec): string {
  const root = findRepoRoot();
  const out = join(lobDir(), `launchd-${spec.label}.log`);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    `  <key>Label</key><string>${spec.label}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>/bin/bash</string>",
    "    <string>-lc</string>",
    `    <string>cd '${xmlEscape(root)}' &amp;&amp; exec ${xmlEscape(spec.command)}</string>`,
    "  </array>",
    `  <key>WorkingDirectory</key><string>${xmlEscape(root)}</string>`,
    `  <key>StandardOutPath</key><string>${xmlEscape(out)}</string>`,
    `  <key>StandardErrorPath</key><string>${xmlEscape(out)}</string>`,
  ];
  if (spec.startInterval) lines.push(`  <key>StartInterval</key><integer>${spec.startInterval}</integer>`);
  if (spec.runAtLoad) lines.push("  <key>RunAtLoad</key><true/>");
  if (spec.keepAlive) lines.push("  <key>KeepAlive</key><true/>");
  lines.push("</dict>", "</plist>", "");
  return lines.join("\n");
}

function installAgent(spec: AgentSpec): void {
  mkdirSync(agentsDir(), { recursive: true });
  const path = plistPath(spec.label);
  writeFileSync(path, renderPlist(spec));
  // Refresh: bootout (ignore if not loaded), then bootstrap.
  try { execFileSync("launchctl", ["bootout", `gui/${uid()}/${spec.label}`], { stdio: "ignore" }); } catch { /* not loaded */ }
  execFileSync("launchctl", ["bootstrap", `gui/${uid()}`, path], { stdio: "ignore" });
}

function uninstallAgent(label: string): void {
  try { execFileSync("launchctl", ["bootout", `gui/${uid()}/${label}`], { stdio: "ignore" }); } catch { /* not loaded */ }
  rmSync(plistPath(label), { force: true });
}

export interface AgentStatus { installed: boolean; loaded: boolean }

function agentStatus(label: string): AgentStatus {
  const installed = existsSync(plistPath(label));
  let loaded = false;
  try {
    execFileSync("launchctl", ["print", `gui/${uid()}/${label}`], { stdio: "ignore" });
    loaded = true;
  } catch { /* not loaded */ }
  return { installed, loaded };
}

// --- App-specific agents -----------------------------------------------------

/** Install/refresh the background sync agent at the configured cadence. */
export function installSyncAgent(config: Config): void {
  const mins = config.settings.mendeley.autoSyncMinutes ?? 0;
  if (mins <= 0) throw new Error("set an auto-sync cadence (> 0 minutes) first");
  const review = config.settings.mendeley.autoSyncReview ? " -- --review" : "";
  installAgent({ label: SYNC_LABEL, command: `npm run sync${review}`, startInterval: mins * 60 });
}

export function removeSyncAgent(): void {
  uninstallAgent(SYNC_LABEL);
}

/** Install the always-on MCP server agent (auto-start on login + keep alive). */
export function installMcpAgent(): void {
  installAgent({ label: MCP_LABEL, command: "npm run mcp:start", keepAlive: true, runAtLoad: true });
}

export function removeMcpAgent(): void {
  uninstallAgent(MCP_LABEL);
}

export interface SchedulerStatus {
  launchdAvailable: boolean;
  sync: AgentStatus & { intervalMinutes: number };
  mcp: AgentStatus;
}

export function schedulerStatus(config: Config): SchedulerStatus {
  let launchdAvailable = true;
  try { execFileSync("launchctl", ["help"], { stdio: "ignore" }); } catch { launchdAvailable = false; }
  return {
    launchdAvailable,
    sync: { ...agentStatus(SYNC_LABEL), intervalMinutes: config.settings.mendeley.autoSyncMinutes ?? 0 },
    mcp: agentStatus(MCP_LABEL),
  };
}
