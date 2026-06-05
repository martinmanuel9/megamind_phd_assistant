"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { scanVaultAction, type ScanSummary } from "@/app/actions";

export function SyncVaultButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      try {
        const s = await scanVaultAction();
        setSummary(s);
        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex h-9 items-center rounded-md border border-border bg-secondary px-3 text-sm text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
      >
        {pending ? "Syncing…" : "Sync vault"}
      </button>
      {summary ? (
        <span className="text-xs text-muted-foreground">
          +{summary.added} new · {summary.removed} removed · {summary.embedded} embedded
          {summary.failed ? ` · ${summary.failed} failed` : ""}
        </span>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
