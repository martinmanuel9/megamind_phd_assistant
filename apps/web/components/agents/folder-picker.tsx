"use client";
import { useState } from "react";
import { createVaultFolderAction } from "@/app/actions";

const FIELD_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function FolderPicker({
  tree,
  value,
  onChange,
}: {
  tree: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [folders, setFolders] = useState(tree);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const next = await createVaultFolderAction(name);
      setFolders(next);
      onChange(name);
      setNewName("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <select
        className={FIELD_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Obsidian Vault root</option>
        {folders.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          className={FIELD_CLASS}
          placeholder="New folder, e.g. Course — Methods/HW2"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy || !newName.trim()}
          className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-md border border-input bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {busy ? "Creating…" : "+ Create"}
        </button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
