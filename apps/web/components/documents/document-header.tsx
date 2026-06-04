"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocumentDetail } from "@/app/actions";
import { deleteDocument, updateDocumentMeta } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2, Pencil, Trash2 } from "lucide-react";

type Doc = DocumentDetail["document"];

export function DocumentHeader({ document: doc, chunkCount, linkCount }: { document: Doc; chunkCount: number; linkCount: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: doc.title,
    authors: (doc.authors ?? []).join(", "),
    venue: doc.venue ?? "",
    published: doc.published ?? "",
    doi: doc.doi ?? "",
    source_url: doc.source_url ?? "",
    kind: doc.kind ?? "article",
  });

  const save = () =>
    start(async () => {
      setErr(null);
      const r = await updateDocumentMeta(doc.id, {
        title: form.title,
        authors: form.authors.split(",").map((a) => a.trim()).filter(Boolean),
        venue: form.venue,
        published: form.published,
        doi: form.doi,
        source_url: form.source_url,
        kind: form.kind,
      });
      if (r.ok) { setEditing(false); router.refresh(); } else setErr(r.error ?? "failed");
    });

  const remove = () => {
    if (!window.confirm(`Delete "${doc.title}"? This removes its passages and traceability links (your vault notes stay).`)) return;
    start(async () => {
      const r = await deleteDocument(doc.id);
      if (r.ok) router.push("/documents");
      else setErr(r.error ?? "failed");
    });
  };

  if (editing) {
    return (
      <header className="mb-6 space-y-3 rounded-lg border border-border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Authors (comma-sep)</Label><Input value={form.authors} onChange={(e) => setForm({ ...form, authors: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Venue</Label><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Published</Label><Input value={form.published} onChange={(e) => setForm({ ...form, published: e.target.value })} placeholder="2024-01-15" /></div>
          <div className="space-y-1.5"><Label>DOI</Label><Input value={form.doi} onChange={(e) => setForm({ ...form, doi: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Source URL</Label><Input value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Kind</Label><Input value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} /></div>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={pending} onClick={save}>{pending && <Loader2 className="size-3.5 animate-spin" />} Save</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </header>
    );
  }

  return (
    <header className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {(doc.authors ?? []).join(", ") || "—"}
            {doc.venue ? ` · ${doc.venue}` : ""}
            {doc.published ? ` · ${doc.published}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={remove}><Trash2 className="size-3.5" /></Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{doc.kind}</Badge>
        <Badge variant={doc.status === "ingested" ? "success" : "outline"}>{doc.status}</Badge>
        <Badge variant="outline">{chunkCount} passages</Badge>
        <Badge variant="outline">{linkCount} traced claims</Badge>
        {doc.source_url && (
          <a href={doc.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            source <ExternalLink className="size-3" />
          </a>
        )}
        {doc.doi && <span className="text-xs text-muted-foreground">doi:{doc.doi}</span>}
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </header>
  );
}
