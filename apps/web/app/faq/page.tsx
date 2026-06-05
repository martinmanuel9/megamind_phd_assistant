import Link from "next/link";
import { ArrowLeft, ChevronRight, HelpCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Plain content model so the page stays easy to edit. Answers are React nodes
// so we can embed links and inline <code> without a markdown renderer.
type QA = { q: string; a: React.ReactNode };
type Section = { title: string; items: QA[] };

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-xs">{children}</code>;
}
function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-2 hover:text-foreground">
      {children}
    </Link>
  );
}

const SECTIONS: Section[] = [
  {
    title: "Getting started & configuration",
    items: [
      {
        q: "What do I have to configure before I can use it?",
        a: (
          <>
            Three things, all on <A href="/setup">/setup</A> (or the first-run{" "}
            <A href="/onboarding">/onboarding</A> wizard): <strong>Supabase</strong> (the database —
            local defaults are pre-filled), <strong>Models</strong> (a local Ollama endpoint + a chat
            model), and your <strong>Obsidian vault</strong> path. GitHub is optional. The{" "}
            <A href="/help">How to use</A> page shows a live checklist of these.
          </>
        ),
      },
      {
        q: "What is optional?",
        a: (
          <>
            <strong>GitHub</strong> (only needed to version/sync your vault), <strong>Mendeley</strong>{" "}
            (only if you want to import an existing library — you can upload files instead), and the{" "}
            <strong>MCP server</strong> (only if you want to drive the system from external tools like
            Perplexity or Claude). Everything else works without them.
          </>
        ),
      },
      {
        q: "Where are my settings stored?",
        a: (
          <>
            In <C>~/.localopenbrain/settings.json</C> (permissions <C>0600</C>) on your machine. The UI
            writes it; environment variables override it. Secrets never get committed to the repo.
          </>
        ),
      },
      {
        q: "How do I know everything is configured correctly?",
        a: (
          <>
            The <A href="/">dashboard</A> shows a green/red <em>System status</em> panel, and{" "}
            <A href="/help">/help</A> shows a live setup checklist. From a terminal, <C>npm run setup</C>{" "}
            prints a precise report of what is configured vs. missing.
          </>
        ),
      },
    ],
  },
  {
    title: "Privacy & data",
    items: [
      {
        q: "Does any of my data leave my machine?",
        a: (
          <>
            No, not by default. Documents, the database (Supabase), embeddings, the chat model
            (Ollama), and your vault all run locally. Data only leaves your machine if <em>you</em>{" "}
            connect an external service — a hosted Supabase project, a remote model endpoint, or a
            GitHub remote for your vault.
          </>
        ),
      },
      {
        q: "Where do my generated notes live?",
        a: (
          <>
            As Markdown files inside your Obsidian vault folder — you own them. Open them in Obsidian,
            or read them in-app at <A href="/notes">/notes</A>.
          </>
        ),
      },
      {
        q: "Is the AI allowed to follow instructions hidden in my documents?",
        a: (
          <>
            No. Captured and AI-extracted content is treated strictly as data, never as instructions,
            and all vault writes go through a path guard that rejects writes outside your configured
            folders.
          </>
        ),
      },
    ],
  },
  {
    title: "Models",
    items: [
      {
        q: "Which chat model should I use?",
        a: (
          <>
            The <strong>Model advisor</strong> on <A href="/setup">/setup</A> detects your RAM/GPU and
            recommends an agent-capable model that fits, with one-click <strong>Pull</strong> and{" "}
            <strong>Use</strong>. The current recommended default is <C>gemma4</C> (tool-use + 128k
            context). The embedding model is fixed at <C>nomic-embed-text</C>.
          </>
        ),
      },
      {
        q: "Can I change the chat model later?",
        a: (
          <>
            Yes — pick another on <A href="/setup">/setup</A> and click <strong>Use</strong>. It takes
            effect on your next Ask/Review/Search; no restart needed.
          </>
        ),
      },
      {
        q: "Can I change the embedding model?",
        a: (
          <>
            Not casually. The vector dimension is fixed at <strong>768</strong> in the database schema.
            A different embedding model/dimension requires a migration and re-embedding everything.
          </>
        ),
      },
      {
        q: "The dashboard says models are unreachable.",
        a: (
          <>
            Make sure Ollama is running and you have pulled <C>nomic-embed-text</C> plus a chat model
            (<C>ollama list</C> to check). Confirm the endpoint on <A href="/setup">/setup</A>.
          </>
        ),
      },
    ],
  },
  {
    title: "Documents, Mendeley & search",
    items: [
      {
        q: "What file types can I upload?",
        a: <>PDF, Word (<C>.docx</C>), and Markdown. Each is parsed, chunked, and embedded automatically.</>,
      },
      {
        q: "Do I need Mendeley?",
        a: (
          <>
            No. Mendeley is just a convenient bulk-import path. You can drag files into{" "}
            <A href="/documents">/documents</A> instead, or batch-import a folder with{" "}
            <C>npm run ingest -- &quot;/path/to/pdfs&quot;</C>.
          </>
        ),
      },
      {
        q: "Mendeley isn't detected.",
        a: (
          <>
            Set the database + userfiles paths manually on <A href="/sync">/sync</A> (auto-detect
            assumes a default macOS install). It requires the <C>sqlite3</C> CLI.
          </>
        ),
      },
      {
        q: "What's the difference between Ask and Search?",
        a: (
          <>
            <A href="/search">/search</A> returns the most relevant <em>passages</em> for you to read
            and click through. <A href="/ask">/ask</A> sends those passages to the chat model and
            returns a <em>written, cited answer</em> you can save as a note.
          </>
        ),
      },
    ],
  },
  {
    title: "Notes & traceability",
    items: [
      {
        q: "What does “claim-level traceability” actually mean?",
        a: (
          <>
            Every claim in a generated note is linked to the exact source <em>passage</em> (chunk) that
            backs it. You can navigate note → passage, passage → document, and document → every note
            that cites it. The links are structural (RAG-resolved), not invented by the model.
          </>
        ),
      },
      {
        q: "How do I verify a claim back to its source?",
        a: (
          <>
            On a document page (<A href="/documents">/documents</A> → a document), the{" "}
            <em>Traced claims</em> sidebar lets you click a claim to jump to its passage; passages with
            a <em>cited</em> badge show which notes reference them.
          </>
        ),
      },
    ],
  },
  {
    title: "Connecting AI tools (MCP)",
    items: [
      {
        q: "How do I use this from Perplexity / Claude / Cursor / Codex?",
        a: (
          <>
            Start the server on <A href="/server">/server</A>, then copy a ready-made config from{" "}
            <A href="/connect">/connect</A> for your client and restart it. It can then call the same
            tools (<C>rag_query</C>, <C>create_literature_note</C>, etc.).
          </>
        ),
      },
      {
        q: "Do I need the MCP server running for the web app to work?",
        a: <>No. The web app works on its own. The MCP server is only for external clients.</>,
      },
    ],
  },
  {
    title: "Agents (review workflows)",
    items: [
      {
        q: "What's the difference between Committee and Debate?",
        a: (<>Committee runs each persona independently, then a Chair synthesizes — good for diverse, unbiased takes. Debate runs personas in sequence so each sees the prior ones (Advocate → Challenger → Reviewer) — good for stress-testing a thesis or hypothesis.</>),
      },
      {
        q: "Where do agent reviews go?",
        a: (<>Into the <A href="/agents/run">Obsidian Vault folder you pick</A> on the run (you can create a new folder there). They only enter the repository if you tick "add to open brain".</>),
      },
    ],
  },
  {
    title: "Hosting & scaling",
    items: [
      {
        q: "Can I move to a hosted database later?",
        a: (
          <>
            Yes. Paste a managed Supabase project URL + keys on <A href="/setup">/setup</A> and run the
            same migration — no code changes. Document files live in Supabase Storage, so they move with
            it.
          </>
        ),
      },
      {
        q: "Can my whole lab use one instance?",
        a: (
          <>
            The data layer (hosted Supabase) is shareable. The app and models are designed to run
            per-researcher locally; point several installs at the same hosted Supabase to share a
            repository.
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <header className="mb-8 flex items-center gap-3">
        <HelpCircle className="size-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">FAQ</h1>
          <p className="text-sm text-muted-foreground">
            Answers to common questions. New here? Start with{" "}
            <A href="/help">How to use</A>.
          </p>
        </div>
      </header>

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">{section.title}</h2>
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {section.items.map((item) => (
                  <details key={item.q} className="group px-5 py-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                      {item.q}
                    </summary>
                    <div className="mt-2 pl-6 text-sm leading-relaxed text-muted-foreground">
                      {item.a}
                    </div>
                  </details>
                ))}
              </CardContent>
            </Card>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-muted-foreground">
        Still stuck? See the <A href="/help">How to use</A> guide, the repo&apos;s{" "}
        <C>docs/USAGE.md</C>, or run <C>npm run setup</C> for a diagnostic.
      </p>
    </main>
  );
}
