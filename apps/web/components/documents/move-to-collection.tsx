"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveDocumentAction } from "@/app/actions";
import type { Collection } from "@/app/actions";

interface Props {
  documentId: string;
  collectionId: string | null;
  collections: Collection[];
}

export function MoveToCollection({ documentId, collectionId, collections }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const target = value === "" ? null : value;
    startTransition(async () => {
      await moveDocumentAction(documentId, target);
      router.refresh();
    });
  }

  return (
    <select
      value={collectionId ?? ""}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value)}
      className="h-7 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground transition-colors hover:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 max-w-[130px] truncate"
      title="Move to collection"
    >
      <option value="">Uncategorized</option>
      {collections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
