"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createCollectionAction, renameCollectionAction } from "@/app/actions";
import type { Collection } from "@/app/actions";

interface Props {
  collections: Collection[];
  active: string | null; // "all" | "none" | <id> | null (same as "all")
}

export function CollectionsRail({ collections, active }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // New collection inline form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);

  // Rename state: which collection is being renamed
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function navigate(param: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("collection", param);
    router.push(url.pathname + url.search);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await createCollectionAction(name);
        setNewName("");
        setShowNew(false);
        router.refresh();
      } catch {
        // ignore — server will surface error
      }
    });
  }

  function startRename(c: Collection) {
    setRenamingId(c.id);
    setRenameValue(c.name);
  }

  function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    startTransition(async () => {
      try {
        await renameCollectionAction(id, name);
        setRenamingId(null);
        router.refresh();
      } catch {
        // ignore
      }
    });
  }

  const isAll = !active || active === "all";
  const isNone = active === "none";

  return (
    <nav className="flex flex-col gap-1">
      <p className="mb-1 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Collections
      </p>

      {/* All */}
      <button
        onClick={() => navigate("all")}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left w-full",
          isAll
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        All documents
      </button>

      {/* Uncategorized */}
      <button
        onClick={() => navigate("none")}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left w-full",
          isNone
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        Uncategorized
      </button>

      {collections.length > 0 && (
        <div className="my-1 border-t border-border" />
      )}

      {/* Each collection */}
      {collections.map((c) => (
        <div key={c.id} className="group flex items-center gap-1">
          {renamingId === c.id ? (
            <div className="flex flex-1 items-center gap-1 px-2">
              <Input
                className="h-7 flex-1 text-sm"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(c.id);
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                disabled={isPending}
                onClick={() => handleRename(c.id)}
              >
                <Check className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                onClick={() => setRenamingId(null)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <button
                onClick={() => navigate(c.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left",
                  active === c.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <FolderOpen className="size-3.5 shrink-0" />
                <span className="truncate">{c.name}</span>
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => startRename(c)}
                title="Rename collection"
              >
                <Pencil className="size-3" />
              </Button>
            </>
          )}
        </div>
      ))}

      {/* New collection */}
      <div className="mt-1">
        {showNew ? (
          <div className="flex items-center gap-1 px-2">
            <Input
              ref={newInputRef}
              className="h-7 flex-1 text-sm"
              placeholder="Collection name"
              value={newName}
              autoFocus
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setShowNew(false); setNewName(""); }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              disabled={isPending || !newName.trim()}
              onClick={handleCreate}
            >
              <Check className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() => { setShowNew(false); setNewName(""); }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <Plus className="size-3.5" />
            New collection
          </button>
        )}
      </div>
    </nav>
  );
}
