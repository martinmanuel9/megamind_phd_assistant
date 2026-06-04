import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getConfig } from "../config.js";
import { settingsPath } from "../settings.js";

/**
 * Local process manager for the MCP server. The web app starts/stops the
 * @lob/mcp-server process from the UI. The child is spawned DETACHED as its own
 * process group so it survives the request that started it; stopping signals the
 * whole group so no tsx/node grandchild is orphaned.
 */

function lobDir(): string {
  return dirname(settingsPath());
}
function pidFile(): string {
  return join(lobDir(), "mcp.pid.json");
}
export function mcpLogFile(): string {
  return join(lobDir(), "mcp.log");
}

interface PidState {
  pid: number;
  startedAt: string;
  port: number;
}

function readState(): PidState | null {
  try {
    return JSON.parse(readFileSync(pidFile(), "utf8")) as PidState;
  } catch {
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Find the monorepo root (nearest ancestor package.json with "workspaces"). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, "utf8")).workspaces) return dir;
      } catch {
        // ignore malformed package.json on the way up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export interface McpStatus {
  running: boolean;
  pid?: number;
  startedAt?: string;
  port: number;
}

export function mcpStatus(): McpStatus {
  const port = getConfig().mcp.port;
  const state = readState();
  if (state && isAlive(state.pid)) {
    return { running: true, pid: state.pid, startedAt: state.startedAt, port: state.port };
  }
  // Stale pidfile — clean it up.
  if (state) {
    try {
      rmSync(pidFile());
    } catch {
      // best effort
    }
  }
  return { running: false, port };
}

/** Confirm the port actually accepts connections (server fully up). */
export async function mcpListening(): Promise<boolean> {
  const { host, port } = getConfig().mcp;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    // Any HTTP response (even 401) means it's listening.
    await fetch(`http://${host}:${port}/`, { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

export function startMcp(): McpStatus {
  const current = mcpStatus();
  if (current.running) return current;

  const root = findRepoRoot();
  mkdirSync(lobDir(), { recursive: true });
  const out = openSync(mcpLogFile(), "a");

  const child = spawn("npm", ["run", "start", "--workspace", "@lob/mcp-server"], {
    cwd: root,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env },
  });
  child.unref();

  const state: PidState = {
    pid: child.pid!,
    startedAt: new Date().toISOString(),
    port: getConfig().mcp.port,
  };
  writeFileSync(pidFile(), JSON.stringify(state));
  return { running: true, pid: state.pid, startedAt: state.startedAt, port: state.port };
}

export function stopMcp(): McpStatus {
  const state = readState();
  if (state?.pid) {
    // Signal the whole process group (negative pid) to catch tsx/node children.
    try {
      process.kill(-state.pid, "SIGTERM");
    } catch {
      try {
        process.kill(state.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  try {
    rmSync(pidFile());
  } catch {
    // best effort
  }
  return { running: false, port: getConfig().mcp.port };
}

/** Last `lines` of the MCP server log. */
export function mcpLogs(lines = 200): string {
  try {
    const content = readFileSync(mcpLogFile(), "utf8");
    return content.split("\n").slice(-lines).join("\n");
  } catch {
    return "";
  }
}
