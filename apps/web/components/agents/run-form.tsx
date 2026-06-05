"use client";

import { useState, useTransition } from "react";
import { FolderPicker } from "@/components/agents/folder-picker";
import { Badge } from "@/components/ui/badge";
import { runReviewAction, type Persona, type Workflow, type RunReviewRequest } from "@/app/actions";

// ── Shared styling ──────────────────────────────────────────────────────────

const FIELD_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const TEXTAREA_CLASS =
  "flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const LABEL_CLASS = "text-sm font-medium leading-none";

const SECTION_CLASS = "space-y-3 rounded-lg border border-border p-4";

const TAB_BASE =
  "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const TAB_ACTIVE = "bg-primary text-primary-foreground shadow-sm";
const TAB_INACTIVE = "text-muted-foreground hover:text-foreground";

// ── Types ───────────────────────────────────────────────────────────────────

type ArtifactTab = "note" | "upload" | "paste";
type ReviewerMode = "workflow" | "persona";

interface NoteOption {
  relPath: string;
  title: string;
}

interface Props {
  personas: Persona[];
  workflows: Workflow[];
  tree: string[];
  notes: NoteOption[];
}

// ── Component ────────────────────────────────────────────────────────────────

export function RunForm({ personas, workflows, tree, notes }: Props) {
  // ── Step 1: Artifact ──────────────────────────────────────────────────────
  const [tab, setTab] = useState<ArtifactTab>("note");
  const [selectedNote, setSelectedNote] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");

  // ── Step 2: Reviewer ──────────────────────────────────────────────────────
  const [reviewerMode, setReviewerMode] = useState<ReviewerMode>("workflow");
  const [selectedWorkflow, setSelectedWorkflow] = useState(
    workflows[0]?.id ?? "",
  );
  const [selectedPersona, setSelectedPersona] = useState(
    personas[0]?.id ?? "",
  );

  // ── Step 4: Destination ───────────────────────────────────────────────────
  const [targetDir, setTargetDir] = useState("");

  // ── Step 5: Repo ingestion ────────────────────────────────────────────────
  const [addArtifactToRepo, setAddArtifactToRepo] = useState(false);
  const [addReviewToRepo, setAddReviewToRepo] = useState(false);

  // ── Run state ─────────────────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    artifactTitle: string;
    notes: { persona: string; relPath: string; error?: boolean }[];
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // ── Validation ────────────────────────────────────────────────────────────
  function validate(): string | null {
    if (tab === "note" && !selectedNote)
      return "Select a vault note to review.";
    if (tab === "upload" && !uploadFile)
      return "Choose a file to upload and review.";
    if (tab === "paste" && !pasteText.trim())
      return "Paste some text to review.";
    if (tab === "paste" && !pasteTitle.trim())
      return "Enter a title for the pasted text.";
    if (reviewerMode === "workflow" && !selectedWorkflow)
      return "Select a workflow.";
    if (reviewerMode === "persona" && !selectedPersona)
      return "Select a persona.";
    return null;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    setRunResult(null);
    setRunError(null);

    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }

    startTransition(async () => {
      try {
        // Build artifact
        let artifact: RunReviewRequest["artifact"];

        if (tab === "note") {
          artifact = { kind: "note", relPath: selectedNote };
        } else if (tab === "paste") {
          artifact = { kind: "text", text: pasteText, title: pasteTitle.trim() };
        } else {
          // Upload the file first
          const form = new FormData();
          form.append("file", uploadFile!);
          const resp = await fetch("/api/upload", { method: "POST", body: form });
          if (!resp.ok) throw new Error(`upload failed: ${resp.status}`);
          const json = (await resp.json()) as {
            ok?: boolean;
            documentId?: string;
            error?: string;
          };
          if (!json.ok || !json.documentId) {
            setRunError(json.error ?? "Upload failed — no document ID returned.");
            return;
          }
          artifact = { kind: "document", documentId: json.documentId };
        }

        const req: RunReviewRequest = {
          artifact,
          workflowId: reviewerMode === "workflow" ? selectedWorkflow : undefined,
          personaId: reviewerMode === "persona" ? selectedPersona : undefined,
          targetDir,
          addArtifactToRepo,
          addReviewToRepo,
        };

        const result = await runReviewAction(req);
        setRunResult(result);
      } catch (e) {
        setRunError((e as Error).message);
      }
    });
  }

  const busy = isPending;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      {/* ── Step 1: Artifact ──────────────────────────────────────────────── */}
      <section className={SECTION_CLASS}>
        <p className={LABEL_CLASS}>Step 1 — Artifact</p>

        {/* Tab bar */}
        <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {(["note", "upload", "paste"] as ArtifactTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`${TAB_BASE} ${tab === t ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              {t === "note" ? "Vault note" : t === "upload" ? "Upload" : "Paste"}
            </button>
          ))}
        </div>

        {tab === "note" && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Choose a note from your vault
            </label>
            <select
              className={FIELD_CLASS}
              value={selectedNote}
              onChange={(e) => setSelectedNote(e.target.value)}
            >
              <option value="">— select a note —</option>
              {notes.map((n) => (
                <option key={n.relPath} value={n.relPath}>
                  {n.title || n.relPath}
                </option>
              ))}
            </select>
            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No notes found. Create some notes first, or use Upload / Paste.
              </p>
            )}
          </div>
        )}

        {tab === "upload" && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              PDF, DOCX, Markdown, or plain text
            </label>
            <input
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt"
              className="block w-full cursor-pointer rounded-md border border-input bg-transparent text-sm text-muted-foreground file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground hover:file:bg-accent"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            {uploadFile && (
              <p className="text-xs text-muted-foreground">
                Selected: {uploadFile.name} ({Math.round(uploadFile.size / 1024)} KB)
              </p>
            )}
          </div>
        )}

        {tab === "paste" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Title</label>
              <input
                type="text"
                className={FIELD_CLASS}
                placeholder="e.g. Draft thesis chapter 3"
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Text</label>
              <textarea
                className={TEXTAREA_CLASS}
                rows={6}
                placeholder="Paste the text you want reviewed…"
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Step 2: Reviewer ──────────────────────────────────────────────── */}
      <section className={SECTION_CLASS}>
        <p className={LABEL_CLASS}>Step 2 — Reviewer</p>

        <div className="flex gap-4">
          {(["workflow", "persona"] as ReviewerMode[]).map((mode) => (
            <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="reviewer-mode"
                value={mode}
                checked={reviewerMode === mode}
                onChange={() => setReviewerMode(mode)}
                className="accent-primary"
              />
              {mode === "workflow" ? "Workflow" : "Single persona"}
            </label>
          ))}
        </div>

        {reviewerMode === "workflow" && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Workflow</label>
            {workflows.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No workflows configured. Go to{" "}
                <a href="/agents" className="underline">
                  Agents
                </a>{" "}
                to create one.
              </p>
            ) : (
              <select
                className={FIELD_CLASS}
                value={selectedWorkflow}
                onChange={(e) => setSelectedWorkflow(e.target.value)}
              >
                <option value="">— select a workflow —</option>
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {reviewerMode === "persona" && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Persona</label>
            {personas.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No personas configured. Go to{" "}
                <a href="/agents" className="underline">
                  Agents
                </a>{" "}
                to create one.
              </p>
            ) : (
              <select
                className={FIELD_CLASS}
                value={selectedPersona}
                onChange={(e) => setSelectedPersona(e.target.value)}
              >
                <option value="">— select a persona —</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </section>

      {/* ── Step 3: Grounding ─────────────────────────────────────────────── */}
      <section className={SECTION_CLASS}>
        <p className={LABEL_CLASS}>Step 3 — Grounding</p>
        <p className="text-sm text-muted-foreground">
          Grounding is configured per persona (see{" "}
          <a href="/agents" className="underline">
            /agents
          </a>
          ). Each persona can search your document repository for relevant context
          before writing its review.
        </p>
      </section>

      {/* ── Step 4: Destination ───────────────────────────────────────────── */}
      <section className={SECTION_CLASS}>
        <p className={LABEL_CLASS}>Step 4 — Destination folder</p>
        <p className="text-xs text-muted-foreground">
          Review notes will be written here inside your vault.
        </p>
        <FolderPicker tree={tree} value={targetDir} onChange={setTargetDir} />
      </section>

      {/* ── Step 5: Repo ingestion ────────────────────────────────────────── */}
      <section className={SECTION_CLASS}>
        <p className={LABEL_CLASS}>Step 5 — Add to Open Brain</p>
        <div className="space-y-2">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={addArtifactToRepo}
              onChange={(e) => setAddArtifactToRepo(e.target.checked)}
            />
            <span>
              Ingest the artifact into the repository
              <span className="ml-1 text-xs text-muted-foreground">
                (chunk + embed for future semantic search)
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-primary"
              checked={addReviewToRepo}
              onChange={(e) => setAddReviewToRepo(e.target.checked)}
            />
            <span>
              Ingest the review notes into the repository
              <span className="ml-1 text-xs text-muted-foreground">
                (chunk + embed each note)
              </span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground">
            When both are off, notes are written as plain Obsidian Markdown files only — no
            database or vector index entries are created.
          </p>
        </div>
      </section>

      {/* ── Validation error ──────────────────────────────────────────────── */}
      {validationError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError}
        </p>
      )}

      {/* ── Run button ────────────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? "Running…" : "Run review"}
      </button>

      {/* ── Run error ─────────────────────────────────────────────────────── */}
      {runError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="font-medium">Review failed</p>
          <p className="mt-0.5 text-xs">{runError}</p>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────────── */}
      {runResult && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium">
            Review complete —{" "}
            <span className="text-muted-foreground">{runResult.artifactTitle}</span>
          </p>
          <ul className="space-y-2">
            {runResult.notes.map((note, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{note.persona}</p>
                  <p className="truncate text-xs text-muted-foreground">{note.relPath}</p>
                </div>
                {note.error ? (
                  <Badge variant="destructive">error</Badge>
                ) : (
                  <Badge variant="success">saved</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
