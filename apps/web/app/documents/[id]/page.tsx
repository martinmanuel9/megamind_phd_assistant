import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { documentDetail } from "@/app/actions";
import { DocumentViewer } from "@/components/documents/document-viewer";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await documentDetail(id);
  if (!detail) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link href="/documents" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Documents
      </Link>
      <DocumentViewer detail={detail} />
    </main>
  );
}
