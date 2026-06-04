import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { listDocuments } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadDropzone } from "@/components/documents/upload-dropzone";

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
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">{docs.length} in your repository</p>
      </div>

      <div className="mb-6">
        <UploadDropzone />
      </div>

      {docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <FileText className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No documents yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Upload a PDF, Word doc, or text file above — it&apos;s parsed, embedded, and added
              to your repository automatically.
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
