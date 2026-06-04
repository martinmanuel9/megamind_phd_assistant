"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MendeleyOverview, SchedulerStatus } from "@/app/actions";
import { getMendeleyOverview, getSchedulerStatus, runMendeleySync, saveMendeleyAutoSync, saveMendeleyPaths, setBackgroundSync } from "@/app/actions";
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

export function MendeleyPanel({ initial, sched }: { initial: MendeleyOverview; sched: SchedulerStatus }) {
  const router = useRouter();
  const [ov, setOv] = useState(initial);
  const [schedState, setSchedState] = useState(sched);
  const [bgMsg, setBgMsg] = useState<string | null>(null);

  const toggleBg = () =>
    start(async () => {
      const r = await setBackgroundSync(!schedState.sync.installed);
      setSchedState(r.status);
      setBgMsg(r.ok ? null : r.error ?? "failed");
    });
  const [dbPath, setDbPath] = useState(initial.dbPath ?? "");
  const [userfilesPath, setUserfilesPath] = useState(initial.userfilesPath ?? "");
  const [review, setReview] = useState(false);
  const [autoMin, setAutoMin] = useState(String(initial.autoSyncMinutes || 0));
  const [autoReview, setAutoReview] = useState(initial.autoSyncReview);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const saveAuto = () =>
    start(async () => {
      const o = await saveMendeleyAutoSync(Number(autoMin), autoReview);
      setOv(o);
      setSchedState(await getSchedulerStatus());
      setAutoMsg(o.autoSyncMinutes > 0 ? `Auto-sync every ${o.autoSyncMinutes} min` : "Auto-sync off");
    });

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

          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <div className="text-sm font-medium">Scheduled auto-sync</div>
              <p className="text-xs text-muted-foreground">
                Runs automatically while the MCP server is running (start it under /server).
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label>Every (minutes, 0 = off)</Label>
                <Input type="number" min={0} value={autoMin} onChange={(e) => setAutoMin(e.target.value)} className="w-32" />
              </div>
              <Button variant="outline" disabled={pending} onClick={saveAuto}>
                {pending && <Loader2 className="size-4 animate-spin" />} Save
              </Button>
              {autoMsg && <span className="pb-2 text-xs text-muted-foreground">{autoMsg}</span>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoReview} onChange={(e) => setAutoReview(e.target.checked)} />
              AI-review each new paper during auto-sync
            </label>
            {ov.autoSyncMinutes > 0 && (
              <Badge variant="success">heartbeat: every {ov.autoSyncMinutes} min while MCP server runs</Badge>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <div className="text-sm font-medium">Always-on (independent of the app)</div>
            <p className="text-xs text-muted-foreground">
              Installs a macOS launchd agent that runs the sync on your cadence even when the app
              and MCP server are closed (survives reboot). Uses the cadence above.
            </p>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={pending || !schedState.launchdAvailable || (!schedState.sync.installed && ov.autoSyncMinutes <= 0)}
                onClick={toggleBg}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {schedState.sync.installed ? "Disable background sync" : "Enable background sync"}
              </Button>
              {schedState.sync.installed && (
                <Badge variant={schedState.sync.loaded ? "success" : "outline"}>
                  {schedState.sync.loaded ? `running · every ${schedState.sync.intervalMinutes} min` : "installed"}
                </Badge>
              )}
              {bgMsg && <span className="text-xs text-destructive">{bgMsg}</span>}
            </div>
            {!schedState.launchdAvailable && <p className="text-xs text-muted-foreground">launchd is macOS-only; not available here.</p>}
            {!schedState.sync.installed && ov.autoSyncMinutes <= 0 && (
              <p className="text-xs text-muted-foreground">Set a cadence above first.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
