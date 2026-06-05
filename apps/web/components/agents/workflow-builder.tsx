"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Persona, Workflow } from "@/app/actions";
import { saveWorkflowAction, deleteWorkflowAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Plus, X, Check, ArrowUp, ArrowDown } from "lucide-react";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function blankWorkflow(): Workflow {
  return { id: "", name: "", mode: "parallel", steps: [], synthesis: { enabled: false } };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface WorkflowFormProps {
  initial: Workflow;
  personas: Persona[];
  onSave: (w: Workflow) => void;
  onCancel: () => void;
}

function WorkflowForm({ initial, personas, onSave, onCancel }: WorkflowFormProps) {
  const [form, setForm] = useState<Workflow>(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // default synthesizer persona id
  const defaultSynthId = personas.find((p) => p.archetype === "synthesizer")?.id ?? personas[0]?.id ?? "";

  const addStep = () =>
    setForm((f) => ({
      ...f,
      steps: [...f.steps, { personaId: personas[0]?.id ?? "" }],
    }));

  const removeStep = (i: number) =>
    setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i) }));

  const setStepPersona = (i: number, personaId: string) =>
    setForm((f) => {
      const steps = [...f.steps];
      steps[i] = { personaId };
      return { ...f, steps };
    });

  const moveStep = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const steps = [...f.steps];
      const j = i + dir;
      if (j < 0 || j >= steps.length) return f;
      const tmp = steps[i];
      steps[i] = steps[j]!;
      steps[j] = tmp!;
      return { ...f, steps };
    });

  const save = () =>
    start(async () => {
      setErr(null);
      if (!form.name.trim()) { setErr("Name is required."); return; }
      if (form.steps.length === 0) { setErr("Add at least one step."); return; }
      try {
        const saved = await saveWorkflowAction(form);
        onSave(saved);
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  const synthesizerPersonaId = form.synthesis.personaId ?? defaultSynthId;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Workflow name">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Workflow name" />
        </Field>
        <Field label="Mode">
          <select
            className={SELECT_CLASS}
            value={form.mode}
            onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as Workflow["mode"] }))}
          >
            <option value="parallel">Parallel — all reviewers run simultaneously</option>
            <option value="sequential">Sequential — each reviewer sees previous output</option>
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Reviewer steps</Label>
          <Button size="sm" variant="outline" onClick={addStep} disabled={personas.length === 0}>
            <Plus className="size-3.5" /> Add step
          </Button>
        </div>
        {form.steps.length === 0 && (
          <p className="text-xs text-muted-foreground">No steps yet — add at least one reviewer.</p>
        )}
        <div className="space-y-2">
          {form.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
              <select
                className={SELECT_CLASS}
                value={step.personaId}
                onChange={(e) => setStepPersona(i, e.target.value)}
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => moveStep(i, -1)} disabled={i === 0} title="Move up">
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => moveStep(i, 1)} disabled={i === form.steps.length - 1} title="Move down">
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeStep(i)} title="Remove step">
                  <X className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.synthesis.enabled}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                synthesis: { ...f.synthesis, enabled: e.target.checked, personaId: f.synthesis.personaId ?? defaultSynthId },
              }))
            }
          />
          Enable synthesis step
        </label>
        {form.synthesis.enabled && (
          <Field label="Synthesizer persona" hint="This persona reads all reviewer outputs and writes a unified summary.">
            <select
              className={SELECT_CLASS}
              value={synthesizerPersonaId}
              onChange={(e) => setForm((f) => ({ ...f, synthesis: { ...f.synthesis, personaId: e.target.value } }))}
            >
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex items-center gap-2">
        <Button disabled={pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save workflow
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          <X className="size-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export function WorkflowBuilder({ workflows: initial, personas }: { workflows: Workflow[]; personas: Persona[] }) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>(initial);
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [pending, start] = useTransition();

  const handleSave = (saved: Workflow) => {
    setWorkflows((prev) => {
      const idx = prev.findIndex((w) => w.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setEditing(null);
    setCreatingNew(false);
    router.refresh();
  };

  const handleDelete = (id: string) =>
    start(async () => {
      await deleteWorkflowAction(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
      router.refresh();
    });

  const personaName = (id: string) => personas.find((p) => p.id === id)?.name ?? id;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Workflows</CardTitle>
            <CardDescription>Compose multiple reviewer personas into a coordinated review pipeline.</CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={creatingNew || editing !== null}
            onClick={() => { setCreatingNew(true); setEditing(null); }}
          >
            <Plus className="size-4" /> New workflow
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {creatingNew && (
          <WorkflowForm
            initial={blankWorkflow()}
            personas={personas}
            onSave={handleSave}
            onCancel={() => setCreatingNew(false)}
          />
        )}

        {workflows.length === 0 && !creatingNew && (
          <p className="text-sm text-muted-foreground">No workflows yet. Create one above.</p>
        )}

        {workflows.map((w) => (
          <div key={w.id}>
            {editing?.id === w.id ? (
              <WorkflowForm
                initial={editing}
                personas={personas}
                onSave={handleSave}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{w.mode}</Badge>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {w.steps.length} step{w.steps.length !== 1 ? "s" : ""}
                    {w.synthesis.enabled ? " + synthesis" : ""}
                  </span>
                  {w.builtin && <Badge variant="outline" className="text-xs shrink-0">built-in</Badge>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 ml-4">
                  {!w.builtin && (
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(w); setCreatingNew(false); }}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  {!w.builtin && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => handleDelete(w.id)}>
                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-destructive" />}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {workflows.some((w) => w.steps.length > 0) && (
          <div className="mt-2 space-y-1 border-t border-border pt-3">
            {workflows.slice(0, 3).map((w) => (
              <p key={w.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{w.name}:</span>{" "}
                {w.steps.map((s) => personaName(s.personaId)).join(" → ")}
                {w.synthesis.enabled && ` → ${w.synthesis.personaId ? personaName(w.synthesis.personaId) : "synthesis"}`}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
