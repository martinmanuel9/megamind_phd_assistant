"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import type { Collection } from "@/app/actions";

type Item = { name: string; state: "uploading" | "done" | "error"; detail?: string };

interface Props {
  collections?: Collection[];
}

export function UploadDropzone({ collections = [] }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  // Optional shared metadata applied to this upload batch.
  const [authors, setAuthors] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [published, setPublished] = useState("");
  const [collectionId, setCollectionId] = useState("");

  async function uploadOne(file: File): Promise<Item> {
    const fd = new FormData();
    fd.append("file", file);
    if (authors) fd.append("authors", authors);
    if (sourceUrl) fd.append("source_url", sourceUrl);
    if (published) fd.append("published", published);
    if (collectionId) fd.append("collectionId", collectionId);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) return { name: file.name, state: "error", detail: data.error ?? "failed" };
      return {
        name: file.name,
        state: "done",
        detail: `${data.deduped ? "already in repo · " : ""}${data.chunks} chunks`,
      };
    } catch (e) {
      return { name: file.name, state: "error", detail: (e as Error).message };
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const list = Array.from(files);
    setItems(list.map((f) => ({ name: f.name, state: "uploading" as const })));
    for (let i = 0; i < list.length; i++) {
      const result = await uploadOne(list[i]!);
      setItems((prev) => prev.map((it, idx) => (idx === i ? result : it)));
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center transition-colors",
            dragging ? "border-primary bg-accent/40" : "border-border hover:bg-accent/20",
          )}
        >
          <UploadCloud className="size-6 text-muted-foreground" />
          <div className="text-sm font-medium">Drop PDFs, Word docs, or text — or click to choose</div>
          <div className="text-xs text-muted-foreground">Extracted, embedded, and added to your repository automatically.</div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,.md,application/pdf,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Collection selector — shown when there are collections */}
        {collections.length > 0 && (
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-sm">Add to collection</Label>
            <select
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Uncategorized</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Optional metadata (applies to this batch)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label>Authors (comma-sep)</Label><Input value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="Doe, J., Smith, A." /></div>
            <div className="space-y-1.5"><Label>Source URL</Label><Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Published</Label><Input value={published} onChange={(e) => setPublished(e.target.value)} placeholder="2024-01-15" /></div>
          </div>
        </details>

        {items.length > 0 && (
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {it.state === "uploading" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {it.state === "done" && <CheckCircle2 className="size-4 text-success" />}
                {it.state === "error" && <XCircle className="size-4 text-destructive" />}
                <span className="truncate">{it.name}</span>
                {it.detail && <span className="text-xs text-muted-foreground">— {it.detail}</span>}
              </div>
            ))}
          </div>
        )}

        {busy && <p className="text-xs text-muted-foreground">Processing… large PDFs take a few seconds to embed.</p>}
      </CardContent>
    </Card>
  );
}
