"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RagAnswer } from "@/app/actions";
import { ragAsk, saveAnswer } from "@/app/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2, NotebookPen, Sparkles } from "lucide-react";

export function AskPanel() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<RagAnswer | null>(null);
  const [pending, start] = useTransition();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ask = () => {
    if (!question.trim()) return;
    setSaveMsg(null);
    setAsked(question);
    start(async () => setResult(await ragAsk(question)));
  };

  const save = () => {
    if (!result) return;
    setSaving(true);
    setSaveMsg(null);
    saveAnswer({ question: asked, answer: result.answer, sources: result.sources })
      .then((r) => setSaveMsg(r.ok ? { ok: true, text: `Saved → ${r.relPath} (${r.links} links)` } : { ok: false, text: r.error ?? "failed" }))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask your library — e.g. 'how do these papers approach test-case generation from requirements?'"
            className="pl-9"
          />
        </div>
        <Button onClick={ask} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Ask
        </Button>
      </div>

      {pending && <p className="text-sm text-muted-foreground">Retrieving passages and reasoning locally…</p>}

      {result && !pending && (
        <>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.answer}</ReactMarkdown>
              </div>
              {result.sources.length > 0 && (
                <div className="flex items-center gap-3 border-t border-border pt-3">
                  <Button size="sm" variant="outline" disabled={saving} onClick={save}>
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <NotebookPen className="size-3.5" />} Save as Obsidian note
                  </Button>
                  {saveMsg && <span className={`text-xs ${saveMsg.ok ? "text-success" : "text-destructive"}`}>{saveMsg.text}</span>}
                </div>
              )}
            </CardContent>
          </Card>

          {result.sources.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Sources ({result.sources.length})</h2>
              {result.sources.map((s, i) => (
                <Link key={s.chunkId} href={`/documents/${s.documentId}#chunk-${s.chunkId}`}>
                  <Card className="transition-colors hover:bg-accent/40">
                    <CardContent className="p-3">
                      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">[{i + 1}]</Badge>
                        <span className="font-medium text-foreground">{s.documentTitle}</span>
                        {s.section && <span>· § {s.section}</span>}
                        <Badge variant="outline" className="ml-auto">{(s.similarity * 100).toFixed(0)}%</Badge>
                        <ArrowRight className="size-3.5" />
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{s.text}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
