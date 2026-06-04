"use client";

import { useState } from "react";
import type { McpConnectionInfo } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Eye, EyeOff } from "lucide-react";

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
    "localopenbrain": { "type": "http", "url": "${url}" }
  }
}`,
    cli: (url) => `claude mcp add --transport http localopenbrain "${url}"`,
  },
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    location: "~/Library/Application Support/Claude/claude_desktop_config.json",
    lang: "json",
    note: "Desktop is stdio-only, so it bridges through mcp-remote. Restart Claude Desktop after saving.",
    config: (url) => `{
  "mcpServers": {
    "localopenbrain": {
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
    "localopenbrain": { "url": "${url}" }
  }
}`,
  },
  {
    id: "codex",
    name: "Codex CLI",
    location: "~/.codex/config.toml",
    lang: "toml",
    note: "stdio bridge via mcp-remote.",
    config: (url) => `[mcp_servers.localopenbrain]
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

export function ConnectorConfigs({ info }: { info: McpConnectionInfo }) {
  const [reveal, setReveal] = useState(false);
  const realUrl = info.url;
  const maskedUrl = `http://${info.host}:${info.port}/?key=${reveal ? info.accessKey : "••••••••"}`;
  const mask = (s: string) => (reveal ? s : s.split(info.accessKey).join("••••••••"));

  return (
    <div className="space-y-5">
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
