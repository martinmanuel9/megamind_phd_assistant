"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { vaultGitStatus, vaultSync } from "@/app/actions";
import { GitBranch, Loader2, RefreshCw, UploadCloud } from "lucide-react";

interface GitStatus {
  isRepo: boolean;
  branch?: string;
  remote?: string;
  ahead: number;
  behind: number;
  dirty: number;
  files: { status: string; path: string }[];
}

export function VaultPanel({ initial }: { initial: GitStatus | null }) {
  const [status, setStatus] = useState<GitStatus | null>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => start(async () => setStatus(await vaultGitStatus()));
  const sync = () =>
    start(async () => {
      const r = await vaultSync();
      setMsg(`committed: ${r.committed} · ${r.pushed}`);
      setStatus(await vaultGitStatus());
    });

  if (!status || !status.isRepo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Obsidian Vault git</CardTitle>
          <CardDescription>This vault isn&apos;t a git repository yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect a GitHub remote in <a className="underline" href="/setup">Setup → GitHub</a> to
            enable versioning and sync.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="size-4" /> Obsidian Vault git
        </CardTitle>
        <CardDescription>{status.remote ?? "no remote configured"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">branch: {status.branch}</Badge>
          <Badge variant={status.dirty ? "destructive" : "success"}>{status.dirty} uncommitted</Badge>
          <Badge variant="outline">↑{status.ahead} ↓{status.behind}</Badge>
        </div>

        {status.files.length > 0 && (
          <div className="max-h-40 overflow-auto rounded-md bg-secondary/40 p-3 font-mono text-xs">
            {status.files.slice(0, 50).map((f) => (
              <div key={f.path}>
                <span className="text-muted-foreground">{f.status || "·"}</span> {f.path}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={sync} disabled={pending || !status.remote}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
            Commit & sync
          </Button>
          <Button variant="outline" onClick={refresh} disabled={pending}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
