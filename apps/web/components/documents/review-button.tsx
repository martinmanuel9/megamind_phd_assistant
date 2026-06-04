"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reviewDocumentAction } from "@/app/actions";
import { Loader2, Sparkles } from "lucide-react";

export function ReviewButton({ documentId, disabled }: { documentId: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex items-center gap-2">
      {msg && (
        <span className={`text-xs ${msg.ok ? "text-success" : "text-destructive"}`}>{msg.text}</span>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending || disabled}
        title={disabled ? "Ingest the document first" : "Generate a traceable literature note"}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await reviewDocumentAction(documentId);
            if (r.ok) {
              setMsg({ ok: true, text: `Note created · ${r.resolved}/${r.claims} claims traced` });
              router.refresh();
            } else {
              setMsg({ ok: false, text: r.error ?? "failed" });
            }
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {pending ? "Reviewing…" : "AI review"}
      </Button>
    </div>
  );
}
