"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MendeleyOverview } from "@/app/actions";
import { getMendeleyOverview, runMendeleySync, saveMendeleyPaths } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export function MendeleyPanel({ initial }: { initial: MendeleyOverview }) {
  const router = useRouter();
  const [ov, setOv] = useState(initial);
  const [dbPath, setDbPath] = useState(initial.dbPath ?? "");
  const [userfilesPath, setUserfilesPath] = useState(initial.userfilesPath ?? "");
  const [review, setReview] = useState(false);
  const [pending, start] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const verify = () =>
    start(async () => {
      setSyncMsg(null);
      setOv(await saveMendeleyPaths({ dbPath, userfilesPath }));
    });

  const sync = () =>
    start(async () => {
      setSyncMsg("Syncing… new papers are extracted + embedded, which can take a while.");
      const r = await runMendeleySync(review);
      if (r.ok && r.result) {
        const x = r.result;
        setSyncMsg(`Synced: ${x.imported} new, ${x.skipped} already synced, ${x.failed} failed${x.missingFile ? `, ${x.missingFile} missing file` : ""}.`);
        setOv(await getMendeleyOverview());
        router.refresh();
      } else {
        setSyncMsg(`Failed: ${r.error}`);
      }
    });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mendeley access</CardTitle>
              <CardDescription>The system reads your local Mendeley library + PDFs.</CardDescription>
            </div>
            <Badge variant={ov.connected ? "success" : "destructive"}>{ov.connected ? "connected" : "not ready"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Check ok={ov.sqliteAvailable} label="sqlite3 available" />
            <Check ok={ov.dbFound} label="Mendeley database found" />
            <Check ok={ov.dbReadable} label={`Database readable${ov.dbReadable ? ` (${ov.libraryCount} entries)` : ""}`} />
            <Check ok={ov.userfilesExists} label={`PDF folder accessible${ov.userfilesExists ? ` (${ov.pdfCount} PDFs)` : ""}`} />
          </div>
          {ov.reason && <p className="text-xs text-destructive">{ov.reason}</p>}

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              Auto-detected. Override if your Mendeley install is in a non-standard location.
            </p>
            <div className="space-y-1.5">
              <Label>Mendeley database path</Label>
              <Input value={dbPath} onChange={(e) => setDbPath(e.target.value)} placeholder="(auto-detect)" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label>userfiles folder path</Label>
              <Input value={userfilesPath} onChange={(e) => setUserfilesPath(e.target.value)} placeholder="(auto-detect)" className="font-mono text-xs" />
            </div>
            <Button variant="outline" size="sm" disabled={pending} onClick={verify}>
              {pending && <Loader2 className="size-4 animate-spin" />} Save & verify access
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync</CardTitle>
          <CardDescription>
            Uploads papers new since your last sync (matched by content hash) to Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{ov.libraryCount} in Mendeley</Badge>
            {ov.lastSyncAt && <Badge variant="outline">last sync {new Date(ov.lastSyncAt).toLocaleString()}</Badge>}
            {ov.lastResult && <Badge variant="outline">last: +{ov.lastResult.imported} new</Badge>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
            Also AI-review each new paper into a traceable note (slower)
          </label>

          <div className="flex items-center gap-3">
            <Button disabled={pending || !ov.connected} onClick={sync}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sync now
            </Button>
            {syncMsg && <span className="text-xs text-muted-foreground">{syncMsg}</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
