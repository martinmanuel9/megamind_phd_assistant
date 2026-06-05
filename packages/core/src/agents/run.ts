import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModelClient } from "../embeddings/client.js";
import type { Config } from "../config.js";
import type { Persona, Workflow } from "../settings.js";
import { ragQuery, registerDocument, ingestDocument } from "../rag/ingest.js";
import { writeMarkdownNote, NoteExistsError, readNote } from "../vault/notes.js";
import { sanitizeTitle } from "../vault/paths.js";
import { resolveArtifactText, type ArtifactInput, type ResolvedArtifact } from "./artifact.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompts.js";

export interface RunReviewInput {
  artifact: ArtifactInput;
  workflow?: Workflow;
  singlePersonaId?: string;
  personas: Persona[];
  targetDir: string;
  addArtifactToRepo: boolean;
  addReviewToRepo: boolean;
}

export interface RunReviewResult {
  notes: { persona: string; relPath: string; error?: boolean }[];
  artifactTitle: string;
}

interface StepOutput { name: string; body: string; error?: boolean }

async function groundingContext(
  db: SupabaseClient,
  model: ModelClient,
  persona: Persona,
  artifact: ResolvedArtifact,
): Promise<string | undefined> {
  if (!persona.grounding.enabled) return undefined;
  const collectionId =
    persona.grounding.scope === "all" ? undefined : persona.grounding.scope.collectionId;
  // Use the artifact's opening as the retrieval query (~first 1500 chars ≈ a few
  // hundred tokens). threshold 0.2 favors recall — a review wants broad context.
  const query = artifact.text.slice(0, 1500);
  let hits = await ragQuery(db, model, query, { limit: 6, threshold: 0.2 });
  if (collectionId) {
    const { data } = await db.from("documents").select("id").eq("collection_id", collectionId);
    const ids = new Set((data ?? []).map((d: { id: string }) => d.id));
    hits = hits.filter((h) => ids.has(h.documentId));
  }
  if (!hits.length) return undefined;
  return hits
    .map(
      (h, i) =>
        `[${i + 1}] (${h.documentTitle}${h.section ? ` § ${h.section}` : ""})\n${h.text}`,
    )
    .join("\n\n");
}

async function runPersona(
  db: SupabaseClient,
  model: ModelClient,
  persona: Persona,
  artifact: ResolvedArtifact,
  prior: StepOutput[],
  modelDefault: string,
): Promise<StepOutput> {
  try {
    const context = await groundingContext(db, model, persona, artifact);
    const body = await model.chat(
      [
        { role: "system", content: buildSystemPrompt(persona) },
        {
          role: "user",
          content: buildUserPrompt({
            artifactTitle: artifact.title,
            artifactText: artifact.text,
            context,
            priorOutputs: prior.map((p) => ({ name: p.name, body: p.body })),
          }),
        },
      ],
      { model: persona.model ?? modelDefault, temperature: 0.3 },
    );
    return { name: persona.name, body: body.trim() || "_(no output)_" };
  } catch (err) {
    return { name: persona.name, body: `> Review failed: ${(err as Error).message}`, error: true };
  }
}

async function writeStepNote(
  db: SupabaseClient,
  config: Config,
  artifactTitle: string,
  targetDir: string,
  step: StepOutput,
): Promise<{ persona: string; relPath: string; error?: boolean }> {
  const base = sanitizeTitle(`${artifactTitle} — ${step.name} review`);
  for (let n = 0; n < 50; n++) {
    const title = n === 0 ? base : `${base} ${n + 1}`;
    try {
      const body = `# ${title}\n\n${step.body}\n`;
      const { relPath } = await writeMarkdownNote(db, config, {
        title,
        targetDir,
        body,
        topics: ["agent-review"],
      });
      return { persona: step.name, relPath, ...(step.error ? { error: true } : {}) };
    } catch (e) {
      if (e instanceof NoteExistsError) continue;
      throw e;
    }
  }
  throw new Error("could not find a free filename for review note");
}

/** Register + embed a Markdown body as a repository document under a collection. */
async function ingestMarkdown(
  db: SupabaseClient, model: ModelClient, title: string, body: string, collectionId: string | null,
): Promise<void> {
  const doc = await registerDocument(db, {
    title, kind: "note", mimeType: "text/markdown",
    bytes: new TextEncoder().encode(body),
    metadata: { source: "agent-review" },
  });
  if (collectionId) await db.from("documents").update({ collection_id: collectionId }).eq("id", doc.id);
  await ingestDocument(db, model, doc.id, body);
}

function collectionScopeOf(p?: Persona): string | null {
  if (!p || p.grounding.scope === "all") return null;
  return p.grounding.scope.collectionId;
}

export async function runReview(
  db: SupabaseClient,
  model: ModelClient,
  config: Config,
  input: RunReviewInput,
): Promise<RunReviewResult> {
  const artifact = await resolveArtifactText(config, db, input.artifact);
  const byId = new Map(input.personas.map((p) => [p.id, p]));
  const modelDefault = config.models.chatModel;

  // A workflow takes precedence over singlePersonaId; callers pass one or the other.
  const stepIds = input.workflow
    ? input.workflow.steps.map((s) => s.personaId)
    : input.singlePersonaId
      ? [input.singlePersonaId]
      : [];
  const sequential = input.workflow?.mode === "sequential";

  const outputs: StepOutput[] = [];
  if (sequential) {
    for (const id of stepIds) {
      const p = byId.get(id);
      if (!p) continue;
      outputs.push(await runPersona(db, model, p, artifact, outputs, modelDefault));
    }
  } else {
    const results = await Promise.all(
      stepIds.map((id) => {
        const p = byId.get(id);
        return p
          ? runPersona(db, model, p, artifact, [], modelDefault)
          : Promise.resolve(null);
      }),
    );
    for (const r of results) if (r) outputs.push(r);
  }

  if (input.workflow?.synthesis.enabled) {
    const syn = byId.get(input.workflow.synthesis.personaId ?? "builtin-synthesizer");
    if (syn) {
      const synOut = await runPersona(db, model, syn, artifact, outputs, modelDefault);
      synOut.name = "Synthesis";
      outputs.push(synOut);
    }
  }

  const notes: { persona: string; relPath: string; error?: boolean }[] = [];
  for (const step of outputs) {
    notes.push(await writeStepNote(db, config, artifact.title, input.targetDir, step));
  }

  // Optional: add to open brain (Supabase repository).
  const firstPersona =
    input.workflow && input.workflow.steps.length
      ? byId.get(input.workflow.steps[0]!.personaId)
      : input.singlePersonaId ? byId.get(input.singlePersonaId) : undefined;
  const collectionId = collectionScopeOf(firstPersona);

  if (input.addArtifactToRepo) {
    await ingestMarkdown(db, model, artifact.title, artifact.text, collectionId);
  }
  if (input.addReviewToRepo) {
    for (const step of outputs) {
      const note = notes.find((n) => n.persona === step.name);
      if (note) await ingestMarkdown(db, model, `${artifact.title} — ${step.name}`, readNote(config, note.relPath), collectionId);
    }
  }

  return { notes, artifactTitle: artifact.title };
}
