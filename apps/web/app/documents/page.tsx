import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { listDocuments, listCollectionsAction } from "@/app/actions";
import type { Collection } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadDropzone } from "@/components/documents/upload-dropzone";
import { ReviewButton } from "@/components/documents/review-button";
import { CollectionsRail } from "@/components/documents/collections-rail";
import { MoveToCollection } from "@/components/documents/move-to-collection";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "success" | "secondary" | "destructive" | "outline"> = {
  ingested: "success",
  registered: "secondary",
  ingesting: "outline",
  failed: "destructive",
};

interface PageProps {
  searchParams: Promise<{ collection?: string }>;
}

export default async function DocumentsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const collectionParam = sp.collection ?? "all";

  const [allDocs, collections] = await Promise.all([
    listDocuments(),
    listCollectionsAction().catch(() => [] as Collection[]),
  ]);

  // Filter documents based on ?collection= param
  const docs = (() => {
    if (collectionParam === "all" || !collectionParam) return allDocs;
    if (collectionParam === "none") return allDocs.filter((d) => d.collection_id == null);
    return allDocs.filter((d) => d.collection_id === collectionParam);
  })();

  const activeLabel =
    collectionParam === "all" || !collectionParam
      ? "All"
      : collectionParam === "none"
        ? "Uncategorized"
        : (collections.find((c) => c.id === collectionParam)?.name ?? "");

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Documents</h1>
        <p className="text-sm text-muted-foreground">{allDocs.length} in your repository</p>
      </div>

      <div className="flex gap-6">
        {/* Collections rail */}
        <aside className="w-48 shrink-0">
          <CollectionsRail
            collections={collections}
            active={collectionParam}
          />
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-6">
          <UploadDropzone collections={collections} />

          {activeLabel && collectionParam !== "all" && (
            <p className="text-sm text-muted-foreground">
              Showing: <span className="font-medium text-foreground">{activeLabel}</span>
              {" "}· {docs.length} document{docs.length !== 1 ? "s" : ""}
            </p>
          )}

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
                    <Link href={`/documents/${d.id}`} className="min-w-0 flex-1 group">
                      <div className="truncate text-sm font-medium group-hover:underline">{d.title}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {(d.authors ?? []).join(", ") || "—"} · {d.kind}
                      </div>
                    </Link>
                    <MoveToCollection
                      documentId={d.id}
                      collectionId={d.collection_id}
                      collections={collections}
                    />
                    <ReviewButton documentId={d.id} disabled={d.status !== "ingested"} />
                    <Badge variant={statusVariant[d.status] ?? "outline"}>{d.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
