"use client";

import { useState, useTransition } from "react";
import type { Settings } from "@lob/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { saveSupabase, saveModels, saveVault, connectGitHub } from "@/app/actions";
import { Loader2 } from "lucide-react";

type Msg = { ok: boolean; text: string } | null;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Result({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <Badge variant={msg.ok ? "success" : "destructive"} className="mt-1">
      {msg.text}
    </Badge>
  );
}

export function SetupForms({ initial }: { initial: Settings }) {
  return (
    <div className="space-y-6">
      <SupabaseSection initial={initial} />
      <VaultSection initial={initial} />
      <GitHubSection initial={initial} />
      <ModelsSection initial={initial} />
    </div>
  );
}

function SupabaseSection({ initial }: { initial: Settings }) {
  const [url, setUrl] = useState(initial.supabase.url ?? "");
  const [anonKey, setAnonKey] = useState(initial.supabase.anonKey ?? "");
  const [serviceRoleKey, setServiceRoleKey] = useState(initial.supabase.serviceRoleKey ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supabase</CardTitle>
        <CardDescription>
          Documents, RAG vectors, and memory. Default is your local stack
          (http://127.0.0.1:54321). Paste a hosted project&apos;s values to upgrade later — no other changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Project URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:54321" />
        </Field>
        <Field label="Anon / publishable key">
          <Input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
        </Field>
        <Field label="Service-role / secret key" hint="Stored locally with 0600 perms; never sent to the browser after saving.">
          <Input type="password" value={serviceRoleKey} onChange={(e) => setServiceRoleKey(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveSupabase({ url, anonKey, serviceRoleKey });
                setServiceRoleKey("••••••••");
                setMsg(
                  r.ok
                    ? { ok: true, text: r.migrated ? "Connected & migrated" : "Connected" }
                    : { ok: false, text: r.reason === "not-migrated" ? "Connected — run the migration" : `Failed: ${r.reason}` },
                );
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save & test
          </Button>
          <Result msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}

function VaultSection({ initial }: { initial: Settings }) {
  const [root, setRoot] = useState(initial.vault.root ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Obsidian vault</CardTitle>
        <CardDescription>
          Absolute path to your vault. Saving scaffolds the research folders
          (Literature Notes, Sources, Syntheses, Annotations, Drafts) if missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Vault root path">
          <Input value={root} onChange={(e) => setRoot(e.target.value)} placeholder="/Users/you/Documents/Research Vault" />
        </Field>
        <div className="flex items-center gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveVault({ root });
                setMsg(
                  r.vault.exists
                    ? { ok: true, text: r.vault.layoutReady ? "Vault ready" : "Saved (scaffolded)" }
                    : { ok: false, text: "Path does not exist" },
                );
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save & scaffold
          </Button>
          <Result msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}

function GitHubSection({ initial }: { initial: Settings }) {
  const [remote, setRemote] = useState(initial.git.remote ?? "");
  const [branch, setBranch] = useState(initial.git.branch ?? "main");
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>GitHub (vault sync)</CardTitle>
        <CardDescription>
          Connect a remote to version + sync your vault. Initializes git in the
          vault if needed. Auth uses your existing SSH key or credential helper.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Remote URL" hint="e.g. git@github.com:you/your-vault.git">
          <Input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="git@github.com:you/vault.git" />
        </Field>
        <Field label="Branch">
          <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" />
        </Field>
        <div className="flex items-center gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await connectGitHub({ remote, branch });
                setMsg(r.ok ? { ok: true, text: "Connected" } : { ok: false, text: r.error ?? "Failed" });
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Connect
          </Button>
          <Result msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}

function ModelsSection({ initial }: { initial: Settings }) {
  const [baseUrl, setBaseUrl] = useState(initial.models.baseUrl);
  const [apiKey, setApiKey] = useState(initial.models.apiKey ?? "");
  const [embedModel, setEmbedModel] = useState(initial.models.embedModel);
  const [embedDim, setEmbedDim] = useState(String(initial.models.embedDim));
  const [chatModel, setChatModel] = useState(initial.models.chatModel);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Models</CardTitle>
        <CardDescription>
          OpenAI-compatible endpoint. Defaults to local Ollama. Changing the
          embedding model/dimension requires re-embedding existing documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Base URL"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
          <Field label="API key (blank for Ollama)"><Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></Field>
          <Field label="Embedding model"><Input value={embedModel} onChange={(e) => setEmbedModel(e.target.value)} /></Field>
          <Field label="Embedding dimension"><Input value={embedDim} onChange={(e) => setEmbedDim(e.target.value)} /></Field>
          <Field label="Chat model"><Input value={chatModel} onChange={(e) => setChatModel(e.target.value)} /></Field>
        </div>
        <div className="flex items-center gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveModels({ baseUrl, apiKey, embedModel, embedDim: Number(embedDim), chatModel });
                setApiKey(apiKey ? "••••••••" : "");
                setMsg(r.models.reachable ? { ok: true, text: "Reachable" } : { ok: false, text: r.models.reason ?? "Unreachable" });
              })
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />} Save & test
          </Button>
          <Result msg={msg} />
        </div>
      </CardContent>
    </Card>
  );
}
