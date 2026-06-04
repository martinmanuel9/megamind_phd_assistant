"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSchedulerStatus, mcpServerLogs, mcpServerStatus, setMcpAutoStart, startMcpServer, stopMcpServer, type McpServerView, type SchedulerStatus } from "@/app/actions";
import { Copy, Loader2, Play, RefreshCw, Square } from "lucide-react";

export function McpControl({ initial, initialLogs, sched }: { initial: McpServerView; initialLogs: string; sched: SchedulerStatus }) {
  const [status, setStatus] = useState<McpServerView>(initial);
  const [logs, setLogs] = useState(initialLogs);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [schedState, setSchedState] = useState(sched);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const toggleAutoStart = () =>
    start(async () => {
      const r = await setMcpAutoStart(!schedState.mcp.installed);
      setSchedState(r.status);
      setAutoMsg(r.ok ? null : r.error ?? "failed");
    });

  // Poll status + logs every 3s.
  useEffect(() => {
    const t = setInterval(async () => {
      setStatus(await mcpServerStatus());
      setLogs(await mcpServerLogs(300));
    }, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const connectUrl =
    status.url && status.accessKey ? `${status.url}?key=${status.accessKey}` : undefined;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>MCP server</CardTitle>
              <CardDescription>The endpoint your AI clients connect to.</CardDescription>
            </div>
            {status.running && status.listening ? (
              <Badge variant="success">running</Badge>
            ) : status.running ? (
              <Badge variant="outline">starting…</Badge>
            ) : (
              <Badge variant="destructive">stopped</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">port {status.port}</Badge>
            {status.pid && <Badge variant="outline">pid {status.pid}</Badge>}
            {status.startedAt && <Badge variant="outline">since {new Date(status.startedAt).toLocaleTimeString()}</Badge>}
          </div>

          <div className="flex items-center gap-3">
            {!status.running ? (
              <Button disabled={pending} onClick={() => start(async () => setStatus(await startMcpServer()))}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Start
              </Button>
            ) : (
              <Button variant="destructive" disabled={pending} onClick={() => start(async () => setStatus(await stopMcpServer()))}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />} Stop
              </Button>
            )}
            <Button variant="outline" disabled={pending} onClick={() => start(async () => { setStatus(await mcpServerStatus()); setLogs(await mcpServerLogs(300)); })}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>

          {connectUrl && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Client connection URL</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-secondary/50 p-2.5 font-mono text-xs">{connectUrl}</code>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(connectUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              {copied && <div className="text-xs text-success">Copied</div>}
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-sm font-medium">Auto-start on login</div>
            <p className="text-xs text-muted-foreground">
              Installs a launchd agent that starts this server on login and restarts it if it
              exits — so its auto-sync heartbeat is always running.
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" disabled={pending || !schedState.launchdAvailable} onClick={toggleAutoStart}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {schedState.mcp.installed ? "Disable auto-start" : "Enable auto-start"}
              </Button>
              {schedState.mcp.installed && (
                <Badge variant={schedState.mcp.loaded ? "success" : "outline"}>
                  {schedState.mcp.loaded ? "active" : "installed"}
                </Badge>
              )}
              {autoMsg && <span className="text-xs text-destructive">{autoMsg}</span>}
            </div>
            {!schedState.launchdAvailable && <p className="text-xs text-muted-foreground">launchd is macOS-only; not available here.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Logs</CardTitle>
          <CardDescription>Live tail (refreshes every 3s).</CardDescription>
        </CardHeader>
        <CardContent>
          <pre ref={logRef} className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {logs || "No logs yet. Start the server to see output."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
