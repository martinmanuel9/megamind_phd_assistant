import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Agents</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Define reviewer personas and compose them into review workflows. Run them from{" "}
        <Link href="/agents/run" className="underline">Run a review</Link>.
      </p>
      <PersonaEditor personas={personas} collections={collections} />
      <div className="h-8" />
      <WorkflowBuilder workflows={workflows} personas={personas} />
    </main>
  );
}
