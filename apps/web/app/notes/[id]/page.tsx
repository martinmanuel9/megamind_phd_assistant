import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getNote } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { NoteBody } from "@/components/notes/note-body";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/notes" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Notes
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{note.title}</h1>
        <Badge variant="outline">{note.noteType}</Badge>
      </div>
      <p className="mb-6 font-mono text-xs text-muted-foreground">{note.vaultPath}</p>
      <Card>
        <CardContent className="p-6">
          <NoteBody content={note.content} />
        </CardContent>
      </Card>
    </main>
  );
}
