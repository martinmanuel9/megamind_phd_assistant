import Link from "next/link";
import { doctor, getConfig } from "@lob/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusRow } from "@/components/status-row";
import { ArrowRight, Database, FileText, Server, Settings2, GitBranch, BrainCircuit } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const report = await doctor();
  const config = getConfig();

  const supaDetail = !report.supabase.ok
    ? report.supabase.reason === "missing-credentials"
      ? "No credentials set"
      : report.supabase.reason === "not-migrated"
        ? "Connected — migration not applied"
        : report.supabase.reason
    : report.supabase.migrated
      ? "Connected & migrated"
      : "Connected";

  const allReady =
    report.supabase.ok && report.models.reachable && report.vault.exists;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <BrainCircuit className="size-7 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">localopenbrainobsidian</h1>
          <p className="text-sm text-muted-foreground">
            PhD research assistant — traceable notes over a local document repository.
          </p>
        </div>
        <div className="ml-auto">
          <Badge variant={allReady ? "success" : "destructive"}>
            {allReady ? "Ready" : "Setup needed"}
          </Badge>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4" /> System status
            </CardTitle>
            <CardDescription>Live health of your local stack.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <StatusRow ok={report.supabase.ok} label="Supabase" detail={supaDetail} />
            <StatusRow
              ok={report.models.reachable}
              label="Models (Ollama)"
              detail={`${report.models.embedModel} @ ${report.models.baseUrl}`}
            />
            <StatusRow
              ok={report.vault.exists}
              label="Obsidian vault"
              detail={report.vault.root ?? "Not configured"}
            />
            <StatusRow
              ok={report.git.isRepo}
              label="Vault git"
              detail={report.git.remote ?? (report.git.isRepo ? "no remote" : "not a repo")}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" /> MCP connection
            </CardTitle>
            <CardDescription>Point Perplexity / Claude / your client here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md bg-secondary/50 p-3 font-mono text-xs break-all">
              http://{config.mcp.host}:{config.mcp.port}?key=
              {config.mcp.accessKey ? "•••• (set)" : "(generate in Setup)"}
            </div>
            <p className="text-xs text-muted-foreground">
              Start the server with <code className="font-mono">npm run mcp:dev</code>. Process
              start/stop from the UI is coming in this phase.
            </p>
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-medium text-muted-foreground">Workspace</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <NavCard href="/setup" icon={<Settings2 className="size-5" />} title="Setup" desc="Supabase, vault, GitHub, models" />
        <NavCard href="/documents" icon={<FileText className="size-5" />} title="Documents" desc="Upload & manage your repository" />
        <NavCard href="/vault" icon={<GitBranch className="size-5" />} title="Vault & git" desc="Notes and GitHub sync" />
      </div>
    </main>
  );
}

function NavCard({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent/40">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="text-primary">{icon}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              {title} <ArrowRight className="size-3.5 text-muted-foreground" />
            </div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
