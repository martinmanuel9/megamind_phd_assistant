import Link from "next/link";
import { doctor } from "@lob/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  Upload,
  Sparkles,
  Search,
  Plug,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const report = await doctor();

  // Live "are you set up?" checklist — each item links to where it's fixed.
  const checklist = [
    {
      ok: report.supabase.ok,
      label: "Supabase connected & migrated",
      href: "/setup",
      hint: "Database for the document repository + traceability.",
    },
    {
      ok: report.models.reachable,
      label: "Models reachable (Ollama)",
      href: "/setup",
      hint: "Local embeddings + chat model.",
    },
    {
      ok: report.vault.exists,
      label: "Obsidian vault configured",
      href: "/setup",
      hint: "Where your traceable notes are written.",
    },
  ];
  const allReady = checklist.every((c) => c.ok);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <header className="mb-8 flex items-center gap-3">
        <BookOpen className="size-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">How to use Megamind</h1>
          <p className="text-sm text-muted-foreground">
            Add sources, turn them into traceable notes, then search and cite.
          </p>
        </div>
      </header>

      {/* Live setup checklist */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Get set up</CardTitle>
            <Badge variant={allReady ? "success" : "destructive"}>
              {allReady ? "Ready" : "Action needed"}
            </Badge>
          </div>
          <CardDescription>
            Live status of the three things Megamind needs. Click any item to fix it.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {checklist.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-start gap-3 py-3 transition-colors hover:text-foreground"
            >
              {item.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.hint}</div>
              </div>
              <ArrowRight className="ml-auto mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* The everyday workflow */}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">The everyday workflow</h2>
      <div className="mb-8 space-y-4">
        <Step
          n={1}
          icon={<Upload className="size-5" />}
          title="Add documents"
          href="/documents"
          hrefLabel="Open documents"
        >
          Drag PDFs, Word, or Markdown into <Code>/documents</Code>, or pull your reference library in{" "}
          <Code>/sync</Code> (Mendeley). Each file is parsed, chunked, and embedded automatically so
          it becomes searchable.
        </Step>

        <Step
          n={2}
          icon={<Sparkles className="size-5" />}
          title="Turn sources into traceable notes"
          href="/documents"
          hrefLabel="Review a document"
        >
          On a document, hit <strong>AI review</strong> to generate a literature note where{" "}
          <em>every claim links to its exact source passage</em>. Or use <Code>/ask</Code> to question
          your whole library and <strong>Save as note</strong>.
        </Step>

        <Step
          n={3}
          icon={<Search className="size-5" />}
          title="Find, verify & reuse"
          href="/search"
          hrefLabel="Search the library"
        >
          <Code>/search</Code> ranks passages by meaning — click a result to jump to the exact
          passage. <Code>/notes</Code> reads your generated notes; <Code>/vault</Code> commits and
          syncs them to GitHub.
        </Step>

        <Step
          n={4}
          icon={<Plug className="size-5" />}
          title="Use it from your AI tools"
          href="/connect"
          hrefLabel="Get a connector config"
        >
          Start the server in <Code>/server</Code>, copy a config from <Code>/connect</Code>, and
          Perplexity / Claude / Codex / Cursor can call the same tools — writing the same traceable
          notes into your vault.
        </Step>
      </div>

      {/* Route reference */}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Where everything lives</h2>
      <Card className="mb-8">
        <CardContent className="divide-y divide-border p-0">
          {ROUTES.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              className="flex items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-accent/40"
            >
              <Code>{r.href}</Code>
              <span className="text-muted-foreground">{r.what}</span>
              <ArrowRight className="ml-auto size-3.5 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      {/* Troubleshooting */}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Troubleshooting</h2>
      <Card className="mb-8">
        <CardContent className="space-y-3 pt-6 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">A status row is red?</strong> Open{" "}
            <Link href="/setup" className="underline">
              /setup
            </Link>{" "}
            — or run <Code>npm run setup</Code> in a terminal for a precise checklist.
          </p>
          <p>
            <strong className="text-foreground">Supabase “not migrated”?</strong> Run{" "}
            <Code>supabase db reset</Code> to apply the schema.
          </p>
          <p>
            <strong className="text-foreground">Models unreachable?</strong> Make sure Ollama is
            running and you’ve pulled <Code>nomic-embed-text</Code> plus a chat model.
          </p>
          <p>
            <strong className="text-foreground">Mendeley not detected?</strong> Set the DB + userfiles
            paths in <Code>/sync</Code> (requires the <Code>sqlite3</Code> CLI).
          </p>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        First time installing? See <Code>INSTALL.md</Code> in the repo. Want the long-form feature
        walkthrough? See <Code>docs/USAGE.md</Code>.
      </p>
    </main>
  );
}

const ROUTES = [
  { href: "/ask", what: "RAG chat grounded in your library; save answers as notes" },
  { href: "/search", what: "Semantic search across documents + memory" },
  { href: "/documents", what: "Upload, manage; click-through claim → passage traceability" },
  { href: "/notes", what: "Read your literature notes" },
  { href: "/sync", what: "Mendeley access, sync & scheduling" },
  { href: "/connect", what: "Copy-paste MCP configs for your AI clients" },
  { href: "/server", what: "Start/stop the MCP server + live logs" },
  { href: "/vault", what: "Vault git status + commit & sync" },
  { href: "/setup", what: "Supabase, vault, GitHub, models + hardware advisor" },
];

function Step({
  n,
  icon,
  title,
  href,
  hrefLabel,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex gap-4 p-5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Step {n}</span>
          </div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{children}</p>
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {hrefLabel} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-xs">{children}</code>
  );
}
