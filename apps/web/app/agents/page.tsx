import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { listPersonasAction, listWorkflowsAction, listCollectionsAction } from "@/app/actions";
import { PersonaEditor } from "@/components/agents/persona-editor";
import { WorkflowBuilder } from "@/components/agents/workflow-builder";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const [personas, workflows] = await Promise.all([listPersonasAction(), listWorkflowsAction()]);
  let collections: Awaited<ReturnType<typeof listCollectionsAction>> = [];
  try { collections = await listCollectionsAction(); } catch { collections = []; }
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define reviewer personas and compose them into review workflows, then run them on a draft.
          </p>
        </div>
        <Link
          href="/agents/run"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Play className="size-4" /> Run a review
        </Link>
      </div>
      <PersonaEditor personas={personas} collections={collections} />
      <div className="h-8" />
      <WorkflowBuilder workflows={workflows} personas={personas} />
    </main>
  );
}
