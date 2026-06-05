import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  listPersonasAction,
  listWorkflowsAction,
  vaultTreeAction,
  listNotes,
  type NoteSummary,
} from "@/app/actions";
import { RunForm } from "@/components/agents/run-form";

export const dynamic = "force-dynamic";

export default async function RunPage() {
  let personas: Awaited<ReturnType<typeof listPersonasAction>> = [];
  let workflows: Awaited<ReturnType<typeof listWorkflowsAction>> = [];
  try { personas = await listPersonasAction(); } catch { personas = []; }
  try { workflows = await listWorkflowsAction(); } catch { workflows = []; }

  let tree: string[] = [];
  let notes: { relPath: string; title: string }[] = [];

  try {
    tree = await vaultTreeAction();
  } catch {
    tree = [];
  }

  try {
    const ns: NoteSummary[] = await listNotes();
    notes = ns
      .map((n) => ({ relPath: n.vault_path, title: n.title }))
      .filter((n) => n.relPath);
  } catch {
    notes = [];
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link
        href="/agents"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Agents
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Run a review</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Review an artifact and write the responses into your Obsidian Vault.
      </p>
      <RunForm
        personas={personas}
        workflows={workflows}
        tree={tree}
        notes={notes}
      />
    </main>
  );
}
