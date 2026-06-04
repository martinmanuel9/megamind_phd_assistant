import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AskPanel } from "@/components/ask/ask-panel";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Ask your library</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Your local model answers grounded in your documents, with cited passages. Save any answer
        as a traceable Obsidian note.
      </p>
      <AskPanel />
    </main>
  );
}
