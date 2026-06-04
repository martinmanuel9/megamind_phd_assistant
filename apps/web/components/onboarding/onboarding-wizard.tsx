"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Settings } from "@lob/core";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { saveSupabase, saveModels, saveVault, connectGitHub, completeOnboarding } from "@/app/actions";
import { Check, Loader2 } from "lucide-react";

const STEPS = ["Supabase", "Models", "Vault", "GitHub", "Done"] as const;

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

export function OnboardingWizard({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  // Per-step state
  const [supa, setSupa] = useState({
    url: initial.supabase.url ?? "",
    anonKey: initial.supabase.anonKey ?? "",
    serviceRoleKey: initial.supabase.serviceRoleKey ?? "",
  });
  const [supaOk, setSupaOk] = useState(false);
  const [supaMsg, setSupaMsg] = useState<Msg>(null);

  const [models, setModels] = useState(initial.models);
  const [modelsOk, setModelsOk] = useState(false);
  const [modelsMsg, setModelsMsg] = useState<Msg>(null);

  const [vaultRoot, setVaultRoot] = useState(initial.vault.root ?? "");
  const [vaultOk, setVaultOk] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<Msg>(null);

  const [git, setGit] = useState({ remote: initial.git.remote ?? "", branch: initial.git.branch ?? "main" });
  const [gitMsg, setGitMsg] = useState<Msg>(null);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div>
      {/* Stepper */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs",
                i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs", i === step ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 && <div className="h-px w-4 bg-border" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Supabase</CardTitle>
            <CardDescription>
              Your document repository, vector index, and memory. Defaults to a local
              <code className="mx-1 font-mono text-xs">supabase start</code> stack.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Project URL">
              <Input value={supa.url} onChange={(e) => setSupa({ ...supa, url: e.target.value })} />
            </Field>
            <Field label="Anon / publishable key">
              <Input value={supa.anonKey} onChange={(e) => setSupa({ ...supa, anonKey: e.target.value })} />
            </Field>
            <Field label="Service-role / secret key" hint="Stored locally (0600). From `supabase status`.">
              <Input type="password" value={supa.serviceRoleKey} onChange={(e) => setSupa({ ...supa, serviceRoleKey: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveSupabase(supa);
                    setSupa((s) => ({ ...s, serviceRoleKey: "••••••••" }));
                    const connected = r.ok || r.reason === "not-migrated";
                    setSupaOk(connected);
                    setSupaMsg(
                      r.ok
                        ? { ok: true, text: "Connected & migrated" }
                        : r.reason === "not-migrated"
                          ? { ok: false, text: "Connected — run: supabase db reset (then re-test)" }
                          : { ok: false, text: `Failed: ${r.reason}` },
                    );
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" />} Save & test
              </Button>
              {supaMsg && <Badge variant={supaMsg.ok ? "success" : "destructive"}>{supaMsg.text}</Badge>}
            </div>
            <StepNav onNext={next} nextDisabled={!supaOk} />
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Models</CardTitle>
            <CardDescription>OpenAI-compatible endpoint. Defaults to local Ollama.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Base URL"><Input value={models.baseUrl} onChange={(e) => setModels({ ...models, baseUrl: e.target.value })} /></Field>
              <Field label="Embedding model"><Input value={models.embedModel} onChange={(e) => setModels({ ...models, embedModel: e.target.value })} /></Field>
              <Field label="Embedding dimension"><Input value={String(models.embedDim)} onChange={(e) => setModels({ ...models, embedDim: Number(e.target.value) })} /></Field>
              <Field label="Chat model"><Input value={models.chatModel} onChange={(e) => setModels({ ...models, chatModel: e.target.value })} /></Field>
            </div>
            <div className="flex items-center gap-3">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveModels({ ...models, apiKey: models.apiKey ?? "" });
                    setModelsOk(r.models.reachable);
                    setModelsMsg(r.models.reachable ? { ok: true, text: "Reachable" } : { ok: false, text: r.models.reason ?? "Unreachable (is Ollama running?)" });
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" />} Save & test
              </Button>
              {modelsMsg && <Badge variant={modelsMsg.ok ? "success" : "destructive"}>{modelsMsg.text}</Badge>}
            </div>
            <StepNav onBack={back} onNext={next} nextLabel={modelsOk ? "Next" : "Skip for now"} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Obsidian vault</CardTitle>
            <CardDescription>Absolute path. Saving scaffolds the research folders if missing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Vault root path">
              <Input value={vaultRoot} onChange={(e) => setVaultRoot(e.target.value)} placeholder="/Users/you/Documents/Research Vault" />
            </Field>
            <div className="flex items-center gap-3">
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await saveVault({ root: vaultRoot });
                    setVaultOk(r.vault.exists);
                    setVaultMsg(r.vault.exists ? { ok: true, text: "Vault ready" } : { ok: false, text: "Path does not exist" });
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" />} Save & scaffold
              </Button>
              {vaultMsg && <Badge variant={vaultMsg.ok ? "success" : "destructive"}>{vaultMsg.text}</Badge>}
            </div>
            <StepNav onBack={back} onNext={next} nextDisabled={!vaultOk} />
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>GitHub (optional)</CardTitle>
            <CardDescription>Version + sync your vault. You can skip and add this later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Remote URL" hint="git@github.com:you/your-vault.git">
              <Input value={git.remote} onChange={(e) => setGit({ ...git, remote: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={pending || !git.remote}
                onClick={() =>
                  start(async () => {
                    const r = await connectGitHub(git);
                    setGitMsg(r.ok ? { ok: true, text: "Connected" } : { ok: false, text: r.error ?? "Failed" });
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" />} Connect
              </Button>
              {gitMsg && <Badge variant={gitMsg.ok ? "success" : "destructive"}>{gitMsg.text}</Badge>}
            </div>
            <StepNav onBack={back} onNext={next} nextLabel="Continue" />
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>You&apos;re set up</CardTitle>
            <CardDescription>Everything below is configured and stored locally.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2"><Badge variant={supaOk ? "success" : "destructive"}>Supabase</Badge></div>
              <div className="flex items-center gap-2"><Badge variant={modelsOk ? "success" : "outline"}>Models</Badge></div>
              <div className="flex items-center gap-2"><Badge variant={vaultOk ? "success" : "destructive"}>Vault</Badge></div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={back}>Back</Button>
              <Button
                disabled={pending}
                onClick={() => start(async () => { await completeOnboarding(); router.push("/"); router.refresh(); })}
              >
                {pending && <Loader2 className="size-4 animate-spin" />} Finish & open dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepNav({ onBack, onNext, nextDisabled, nextLabel = "Next" }: { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? <Button variant="ghost" onClick={onBack}>Back</Button> : <span />}
      <Button variant={nextDisabled ? "outline" : "default"} onClick={onNext} disabled={nextDisabled}>
        {nextLabel}
      </Button>
    </div>
  );
}
