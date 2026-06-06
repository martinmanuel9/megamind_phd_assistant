"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Persona, Collection } from "@/app/actions";
import { savePersonaAction, deletePersonaAction } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, Copy, Plus, X, Check } from "lucide-react";

const ARCHETYPES = [
  "professor",
  "advisor",
  "peer-reviewer",
  "committee-stakeholder",
  "advocate",
  "challenger",
  "reviewer",
  "hypothesis-verifier",
  "synthesizer",
  "custom",
] as const;

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function blankPersona(): Persona {
  return {
    id: "",
    name: "",
    archetype: "reviewer",
    stance: "",
    rubric: "",
    tone: "",
    depth: "standard",
    model: "",
    grounding: { enabled: false, scope: "all" },
    outputFormat: "structured",
  };
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

interface PersonaFormProps {
  initial: Persona;
  collections: Collection[];
  onSave: (p: Persona) => void;
  onCancel: () => void;
}

function PersonaForm({ initial, collections, onSave, onCancel }: PersonaFormProps) {
  const [form, setForm] = useState<Persona>(initial);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof Persona>(k: K, v: Persona[K]) => setForm((f) => ({ ...f, [k]: v }));

  // grounding scope: "all" or a collection id string
  const scopeValue =
    typeof form.grounding.scope === "string" ? "all" : form.grounding.scope.collectionId;
  const setScope = (val: string) => {
    const scope: Persona["grounding"]["scope"] = val === "all" ? "all" : { collectionId: val };
    setForm((f) => ({ ...f, grounding: { ...f.grounding, scope } }));
  };

  const save = () =>
    start(async () => {
      setErr(null);
      if (!form.name.trim()) { setErr("Name is required."); return; }
      try {
        const saved = await savePersonaAction({ ...form, model: form.model?.trim() || undefined });
        onSave(saved);
      } catch (e) {
        setErr((e as Error).message);
      }
    });

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Persona name" />
        </Field>
        <Field label="Archetype">
          <select
            className={SELECT_CLASS}
            value={form.archetype}
            onChange={(e) => set("archetype", e.target.value as Persona["archetype"])}
          >
            {ARCHETYPES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Stance" hint="The reviewer's perspective or position on the work.">
        <textarea
          className={TEXTAREA_CLASS}
          rows={2}
          value={form.stance}
          onChange={(e) => set("stance", e.target.value)}
          placeholder="e.g. Skeptical methodologist who demands replication evidence"
        />
      </Field>

      <Field label="Rubric" hint="Evaluation criteria the reviewer applies.">
        <textarea
          className={TEXTAREA_CLASS}
          rows={3}
          value={form.rubric}
          onChange={(e) => set("rubric", e.target.value)}
          placeholder="e.g. 1. Statistical rigour  2. Sample size adequacy  3. Confound control"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tone">
          <Input value={form.tone} onChange={(e) => set("tone", e.target.value)} placeholder="e.g. Direct, collegial" />
        </Field>
        <Field label="Depth">
          <select
            className={SELECT_CLASS}
            value={form.depth}
            onChange={(e) => set("depth", e.target.value as Persona["depth"])}
          >
            <option value="brief">Brief</option>
            <option value="standard">Standard</option>
            <option value="detailed">Detailed</option>
          </select>
        </Field>
        <Field label="Model" hint="Override the default chat model for this persona.">
          <Input
            value={form.model ?? ""}
            onChange={(e) => set("model", e.target.value)}
            placeholder="default chat model"
          />
        </Field>
        <Field label="Output format">
          <select
            className={SELECT_CLASS}
            value={form.outputFormat}
            onChange={(e) => set("outputFormat", e.target.value as Persona["outputFormat"])}
          >
            <option value="structured">Structured</option>
            <option value="freeform">Freeform</option>
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.grounding.enabled}
            onChange={(e) =>
              setForm((f) => ({ ...f, grounding: { ...f.grounding, enabled: e.target.checked } }))
            }
          />
          Enable RAG grounding
        </label>
        {form.grounding.enabled && (
          <Field label="Grounding scope">
            <select className={SELECT_CLASS} value={scopeValue} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All documents</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {err && <p className="text-xs text-destructive">{err}</p>}

      <div className="flex items-center gap-2">
        <Button disabled={pending} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save persona
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={pending}>
          <X className="size-4" /> Cancel
        </Button>
      </div>
    </div>
  );
}

export function PersonaEditor({
  personas: initial,
  collections,
}: {
  personas: Persona[];
  collections: Collection[];
}) {
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>(initial);
  // editingId === "" means we're creating a new persona (or duplicating a builtin)
  const [editing, setEditing] = useState<Persona | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [pending, start] = useTransition();

  const handleSave = (saved: Persona) => {
    setPersonas((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setEditing(null);
    setCreatingNew(false);
    router.refresh();
  };

  const handleDelete = (id: string) =>
    start(async () => {
      await deletePersonaAction(id);
      setPersonas((prev) => prev.filter((p) => p.id !== id));
      router.refresh();
    });

  const duplicate = (p: Persona) => {
    const copy: Persona = { ...p, id: "", name: `${p.name} (copy)`, builtin: undefined };
    setEditing(copy);
    setCreatingNew(false);
  };

  const startNew = () => {
    setEditing(null);
    setCreatingNew(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Personas</CardTitle>
            <CardDescription>
              Click a persona to view &amp; edit it. Use Copy to spin off a variant, then Save.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={creatingNew || editing !== null}
            onClick={startNew}
          >
            <Plus className="size-4" /> New persona
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* New-persona form (blank) */}
        {creatingNew && (
          <PersonaForm
            initial={blankPersona()}
            collections={collections}
            onSave={handleSave}
            onCancel={() => setCreatingNew(false)}
          />
        )}

        {/* Duplicate form (editing === non-null with id === "") */}
        {editing && editing.id === "" && (
          <PersonaForm
            initial={editing}
            collections={collections}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
          />
        )}

        {personas.length === 0 && !creatingNew && (
          <p className="text-sm text-muted-foreground">No personas yet. Create one above.</p>
        )}

        {personas.map((p) =>
          editing?.id === p.id ? (
            // Inline editor for an existing persona
            <PersonaForm
              key={p.id}
              initial={editing}
              collections={collections}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          ) : (
            // Read-only row — click anywhere to open the editor
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => { setEditing(p); setCreatingNew(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setEditing(p);
                  setCreatingNew(false);
                }
              }}
              className="flex cursor-pointer items-center justify-between rounded-md border border-border px-4 py-3 transition-colors hover:bg-accent/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.archetype}</span>
                {p.builtin && (
                  <Badge variant="outline" className="text-xs">
                    built-in
                  </Badge>
                )}
              </div>
              {/* Stop row-click from firing when using the action buttons */}
              <div className="ml-4 flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  title="Edit this persona"
                  onClick={() => { setEditing(p); setCreatingNew(false); }}
                >
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" title="Copy to a new persona" onClick={() => duplicate(p)}>
                  <Copy className="size-3.5" /> Copy
                </Button>
                {!p.builtin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Delete this persona"
                    disabled={pending}
                    onClick={() => handleDelete(p.id)}
                  >
                    {pending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5 text-destructive" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
