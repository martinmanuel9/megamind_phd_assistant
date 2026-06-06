"use client";

import { useState } from "react";
import Link from "next/link";
import type { McpConnectionInfo } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Eye, EyeOff, CircleCheck, CircleAlert, Laptop } from "lucide-react";

interface Client {
  id: string;
  name: string;
  location: string;
  lang: string;
  note?: string;
  config: (url: string) => string;
  cli?: (url: string) => string;
}

const CLIENTS: Client[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    location: "project .mcp.json (or run the CLI command)",
    lang: "json",
    config: (url) => `{
  "mcpServers": {
    "megamind": { "type": "http", "url": "${url}" }
  }
}`,
    cli: (url) => `claude mcp add --transport http megamind "${url}"`,
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    location: "~/Library/Application Support/Claude/claude_desktop_config.json",
    lang: "json",
    note: "Desktop is stdio-only, so it bridges through mcp-remote. Restart Claude Desktop after saving.",
    config: (url) => `{
  "mcpServers": {
    "megamind": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}"]
    }
  }
}`,
  },
  {
    id: "cursor",
    name: "Cursor",
    location: "~/.cursor/mcp.json (or project .cursor/mcp.json)",
    lang: "json",
    config: (url) => `{
  "mcpServers": {
    "megamind": { "url": "${url}" }
  }
}`,
  },
  {
    id: "codex",
    name: "Codex CLI",
    location: "~/.codex/config.toml",
    lang: "toml",
    note: "stdio bridge via mcp-remote (needs Node/npx on PATH). Restart Codex after editing config.toml.",
    config: (url) => `[mcp_servers.megamind]
command = "npx"
args = ["-y", "mcp-remote", "${url}"]`,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    location: "Settings → Connectors → Add MCP server",
    lang: "json",
    note: "Add via Perplexity's connectors UI; it bridges through mcp-remote.",
    config: (url) => `{
  "command": "npx",
  "args": ["-y", "mcp-remote", "${url}"]
}`,
  },
  {
    id: "generic",
    name: "Any other client",
    location: "raw endpoint",
    lang: "text",
    note: "Streamable HTTP MCP. The key can go in the URL (?key=) or an x-brain-key header. stdio-only clients: wrap with npx -y mcp-remote \"<url>\".",
    config: (url) => `URL: ${url}`,
  },
];

function CodeBlock({ text, masked, lang }: { text: string; masked: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-auto rounded-md bg-black/40 p-3 pr-12 font-mono text-xs leading-relaxed">{masked}</pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-1.5 top-1.5 size-7"
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        title={`Copy ${lang}`}
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function ConnectorConfigs({
  info,
  running,
  lanIp,
}: {
  info: McpConnectionInfo;
  running: boolean;
  lanIp?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const realUrl = info.url;
  const maskedUrl = `http://${info.host}:${info.port}/?key=${reveal ? info.accessKey : "••••••••"}`;
  const mask = (s: string) => (reveal ? s : s.split(info.accessKey).join("••••••••"));
  const lanUrl = lanIp ? realUrl.replace(`//${info.host}:`, `//${lanIp}:`) : undefined;

  return (
    <div className="space-y-5">
      {/* Server status — the #1 reason a client can't connect */}
      {running ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          <CircleCheck className="size-4 shrink-0 text-emerald-500" />
          <span>MCP server is <strong>running</strong> on port {info.port} — clients can connect.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <CircleAlert className="size-4 shrink-0 text-destructive" />
          <span>
            MCP server is <strong>stopped</strong> — start it on{" "}
            <Link href="/server" className="underline">/server</Link> or clients can&apos;t connect.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Endpoint</CardTitle>
              <CardDescription>Your MCP server address + access key. Start the server under /server.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setReveal((r) => !r)}>
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {reveal ? "Hide key" : "Reveal key"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock text={realUrl} masked={maskedUrl} lang="url" />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">host {info.host}</Badge>
            <Badge variant="outline">port {info.port}</Badge>
            <Badge variant="outline">auth: ?key= or x-brain-key header</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            HTTP (Streamable MCP). stdio-only clients use the <code className="font-mono">mcp-remote</code> bridge
            (auto-installed by <code className="font-mono">npx</code>). Requires Node on the client machine.
          </p>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Test it from a terminal (200/406 = reachable, 401 = wrong key, 000 = server down):</p>
            <CodeBlock
              text={`curl -s -o /dev/null -w "%{http_code}\\n" "${realUrl}"`}
              masked={mask(`curl -s -o /dev/null -w "%{http_code}\\n" "${realUrl}"`)}
              lang="sh"
            />
          </div>
        </CardContent>
      </Card>

      {/* Connecting from another computer */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Laptop className="size-4" /> Connecting from another computer?
          </CardTitle>
          <CardDescription>
            The configs below use <code className="font-mono">{info.host}</code> — that only works on
            this machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>To connect a client on a different device on your network:</p>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Set <code className="font-mono">MCP_HOST=0.0.0.0</code> (e.g. in <code className="font-mono">.env</code>) and restart the server on <Link href="/server" className="underline">/server</Link>.</li>
            <li>
              Use this machine&apos;s LAN address instead of <code className="font-mono">{info.host}</code>
              {lanIp ? <> — detected: <code className="font-mono">{lanIp}</code></> : null}.
            </li>
            <li>Both devices on the same network; port {info.port} not firewalled.</li>
          </ol>
          {lanUrl ? <CodeBlock text={lanUrl} masked={mask(lanUrl)} lang="url" /> : null}
        </CardContent>
      </Card>

      {CLIENTS.map((c) => {
        const cfg = c.config(realUrl);
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="text-base">{c.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{c.location}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.cli && <CodeBlock text={c.cli(realUrl)} masked={mask(c.cli(realUrl))} lang="sh" />}
              <CodeBlock text={cfg} masked={mask(cfg)} lang={c.lang} />
              {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
