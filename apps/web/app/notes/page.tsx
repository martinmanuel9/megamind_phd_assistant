import Link from "next/link";
import { ArrowLeft, NotebookPen } from "lucide-react";
import { listNotes } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const typeVariant: Record<string, "success" | "secondary" | "outline"> = {
  literature: "success",
  synthesis: "success",
  source: "secondary",
  annotation: "outline",
  draft: "outline",
};

export default async function NotesPage() {
  const notes = await listNotes();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Notes</h1>
      <p className="mb-8 text-sm text-muted-foreground">{notes.length} notes in your vault (tracked by the app)</p>

      {notes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <NotebookPen className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No notes yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Use <span className="font-medium">AI review</span> on a document, or create a literature
              note via the MCP tools — it&apos;ll appear here and in your Obsidian vault.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <Link key={n.id} href={`/notes/${n.id}`}>
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <NotebookPen className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{n.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{n.vault_path}</div>
                  </div>
                  <Badge variant={typeVariant[n.note_type] ?? "outline"}>{n.note_type}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
