import Link from "next/link";
import { ArrowLeft, FileText, UploadCloud } from "lucide-react";
import { listDocuments } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  ingested: "success",
  registered: "secondary",
  ingesting: "outline",
  failed: "destructive",
};

export default async function DocumentsPage() {
  const docs = await listDocuments();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">{docs.length} in your repository</p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <UploadCloud className="size-3.5" /> Upload — next
        </Badge>
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No documents yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Register documents via the MCP tools today (register_document → ingest_document).
              Drag-and-drop upload with PDF/docx extraction lands in the next step.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {(d.authors ?? []).join(", ") || "—"} · {d.kind}
                  </div>
                </div>
                <Badge variant={statusVariant[d.status] ?? "outline"}>{d.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
