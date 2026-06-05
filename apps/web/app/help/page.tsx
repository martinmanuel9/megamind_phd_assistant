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
  HelpCircle,
  RefreshCw,
  Crosshair,
  GitBranch,
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
        <Link
          href="/faq"
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="size-4" /> FAQ
        </Link>
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

      {/* What you must vs. may configure */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">What needs configuring</CardTitle>
          <CardDescription>The essentials vs. what you can add later.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-500">
              Required
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><strong className="text-foreground">Supabase</strong> — the database (local defaults pre-filled)</li>
              <li><strong className="text-foreground">Models</strong> — Ollama endpoint + a chat model</li>
              <li><strong className="text-foreground">Vault</strong> — your Obsidian folder path</li>
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Optional
            </div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li><strong className="text-foreground">GitHub</strong> — version &amp; sync your vault</li>
              <li><strong className="text-foreground">Mendeley</strong> — bulk-import an existing library</li>
              <li><strong className="text-foreground">MCP server</strong> — drive it from Perplexity/Claude/etc.</li>
            </ul>
          </div>
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

      {/* Use cases / playbooks */}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Common tasks</h2>
      <div className="mb-8 space-y-3">
        {USE_CASES.map((uc) => (
          <UseCase key={uc.title} {...uc} />
        ))}
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
        Have a question? See the <Link href="/faq" className="underline">FAQ</Link>. First time
        installing? See <Code>INSTALL.md</Code> in the repo. Want the long-form feature walkthrough?
        See <Code>docs/USAGE.md</Code>.
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
  { href: "/faq", what: "Frequently asked questions" },
];

// Concrete, role-relevant playbooks. Each is a collapsible step list.
const USE_CASES: {
  title: string;
  icon: React.ReactNode;
  steps: { text: React.ReactNode; href?: string }[];
}[] = [
  {
    title: "Review one paper into a traceable note",
    icon: <Sparkles className="size-4" />,
    steps: [
      { text: "Upload the PDF in Documents.", href: "/documents" },
      { text: "Open the document and click AI review." },
      { text: "Read the generated note — each claim links to its source passage.", href: "/notes" },
    ],
  },
  {
    title: "Import your existing Mendeley library",
    icon: <RefreshCw className="size-4" />,
    steps: [
      { text: "Open Mendeley sync; it auto-detects your local library.", href: "/sync" },
      { text: "Click Sync now — only papers new since the last sync are imported." },
      { text: "Optionally set a cadence or enable always-on background sync." },
    ],
  },
  {
    title: "Ask a question across your whole library",
    icon: <Search className="size-4" />,
    steps: [
      { text: "Go to Ask and type your question.", href: "/ask" },
      { text: "Read the answer — it's grounded in retrieved passages with [n] citations." },
      { text: "Click Save as note to keep it as a traceable synthesis note." },
    ],
  },
  {
    title: "Verify a claim back to its exact source",
    icon: <Crosshair className="size-4" />,
    steps: [
      { text: "Open a document; the Traced claims sidebar lists its claims.", href: "/documents" },
      { text: "Click a claim to jump to the exact passage it came from." },
      { text: "Cited by shows every note that draws on the document." },
    ],
  },
  {
    title: "Use it from Perplexity / Claude / Cursor",
    icon: <Plug className="size-4" />,
    steps: [
      { text: "Start the MCP server.", href: "/server" },
      { text: "Copy the config for your client.", href: "/connect" },
      { text: "Restart the client — it can now call the same tools." },
    ],
  },
  {
    title: "Back up & version your notes",
    icon: <GitBranch className="size-4" />,
    steps: [
      { text: "Connect a GitHub remote in Setup (one time).", href: "/setup" },
      { text: "Open Vault & git and click Commit & sync.", href: "/vault" },
    ],
  },
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

function UseCase({
  title,
  icon,
  steps,
}: {
  title: string;
  icon: React.ReactNode;
  steps: { text: React.ReactNode; href?: string }[];
}) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span className="text-primary">{icon}</span>
        {title}
        <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <ol className="space-y-2 border-t border-border px-5 py-3 text-sm text-muted-foreground">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-foreground">
              {i + 1}
            </span>
            <span>
              {s.text}
              {s.href ? (
                <Link href={s.href} className="ml-1.5 text-primary hover:underline">
                  {s.href}
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-xs">{children}</code>
  );
}
