"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { semanticSearch, type SearchResults } from "@/app/actions";
import { ArrowRight, Brain, FileText, Loader2, Search } from "lucide-react";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    if (!query.trim()) return;
    start(async () => setResults(await semanticSearch(query)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Ask across your documents — e.g. 'how do hard negatives help retrieval?'"
            className="pl-9"
          />
        </div>
        <Button onClick={run} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Search
        </Button>
      </div>

      {results && (
        <>
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="size-4" /> Passages ({results.passages.length})
            </h2>
            {results.passages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matching passages.</p>
            ) : (
              results.passages.map((p) => (
                <Link key={p.chunkId} href={`/documents/${p.documentId}#chunk-${p.chunkId}`}>
                  <Card className="transition-colors hover:bg-accent/40">
                    <CardContent className="p-4">
                      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{p.documentTitle}</span>
                        {p.section && <span>· § {p.section}</span>}
                        <Badge variant="outline" className="ml-auto">{(p.similarity * 100).toFixed(0)}%</Badge>
                        <ArrowRight className="size-3.5" />
                      </div>
                      <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </section>

          {results.thoughts.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Brain className="size-4" /> Memory ({results.thoughts.length})
              </h2>
              {results.thoughts.map((t, i) => (
                <Card key={i}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <Badge variant="outline">{(t.similarity * 100).toFixed(0)}%</Badge>
                    <p className="text-sm text-muted-foreground">{t.content}</p>
                  </CardContent>
                </Card>
              ))}
            </section>
          )}
        </>
      )}

      {!results && (
        <p className="text-sm text-muted-foreground">
          Semantic search ranks passages by meaning, not keywords. Results link to the source
          document and scroll to the exact passage.
        </p>
      )}
    </div>
  );
}
