"use client";

import { useState } from "react";
import type { DocumentDetail } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ExternalLink, Quote, Link2 } from "lucide-react";

export function DocumentViewer({ detail }: { detail: DocumentDetail }) {
  const { document: doc, chunks, links, citingNotes } = detail;
  const [active, setActive] = useState<string | null>(null);

  const citedChunkIds = new Set(links.map((l) => l.chunk_id).filter(Boolean) as string[]);

  const jumpTo = (chunkId: string | null) => {
    if (!chunkId) return;
    setActive(chunkId);
    document.getElementById(`chunk-${chunkId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {(doc.authors ?? []).join(", ") || "—"}
          {doc.venue ? ` · ${doc.venue}` : ""}
          {doc.published ? ` · ${doc.published}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{doc.kind}</Badge>
          <Badge variant={doc.status === "ingested" ? "success" : "outline"}>{doc.status}</Badge>
          <Badge variant="outline">{chunks.length} passages</Badge>
          <Badge variant="outline">{links.length} traced claims</Badge>
          {doc.source_url && (
            <a href={doc.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              source <ExternalLink className="size-3" />
            </a>
          )}
          {doc.doi && <span className="text-xs text-muted-foreground">doi:{doc.doi}</span>}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Passages */}
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">Passages</h2>
          {chunks.length === 0 && (
            <p className="text-sm text-muted-foreground">Not ingested yet — no passages.</p>
          )}
          {chunks.map((c) => {
            const cited = citedChunkIds.has(c.id);
            return (
              <Card
                key={c.id}
                id={`chunk-${c.id}`}
                className={cn(
                  "scroll-mt-24 transition-colors",
                  cited && "border-l-2 border-l-primary/60",
                  active === c.id && "ring-2 ring-ring",
                )}
              >
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>#{c.ord}</span>
                    {c.section && <span>· § {c.section}</span>}
                    {cited && (
                      <Badge variant="success" className="ml-auto gap-1">
                        <Link2 className="size-3" /> cited
                      </Badge>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{c.text}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Traceability sidebar */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">Traced claims</h2>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notes cite this document yet. Use <span className="font-medium">AI review</span> or
              create a literature note that references it.
            </p>
          ) : (
            <div className="space-y-2">
              {links.map((l, i) => (
                <button
                  key={i}
                  onClick={() => jumpTo(l.chunk_id)}
                  className={cn(
                    "w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-accent/40",
                    !l.chunk_id && "opacity-60",
                  )}
                  title={l.chunk_id ? "Jump to source passage" : "No exact passage resolved"}
                >
                  <div className="text-sm">{l.claim_text}</div>
                  {l.quote && (
                    <div className="mt-1.5 flex gap-1.5 text-xs text-muted-foreground">
                      <Quote className="mt-0.5 size-3 shrink-0" />
                      <span className="italic">{l.quote}</span>
                    </div>
                  )}
                  <div className="mt-1.5 truncate text-xs text-muted-foreground">— {l.note_title}</div>
                </button>
              ))}
            </div>
          )}

          {citingNotes.length > 0 && (
            <div className="pt-2">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">Cited by</h2>
              <div className="space-y-1.5">
                {citingNotes.map((n) => (
                  <div key={n.noteId} className="rounded-md bg-secondary/40 p-2.5 text-xs">
                    <div className="font-medium">{n.title}</div>
                    <div className="text-muted-foreground">{n.claims} claim(s) · {n.vaultPath}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
