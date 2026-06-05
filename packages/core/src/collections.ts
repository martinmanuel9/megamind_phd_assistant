import type { SupabaseClient } from "@supabase/supabase-js";

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Slugify a collection name for Storage paths and uniqueness. */
export function collectionSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`collection name slugifies to empty (input: "${name}")`);
  return slug;
}

export async function listCollections(db: SupabaseClient): Promise<Collection[]> {
  const { data, error } = await db
    .from("collections")
    .select("id, name, slug, description, created_at, updated_at")
    .order("name", { ascending: true });
  if (error) throw new Error(`listCollections failed: ${error.message}`);
  return (data ?? []) as Collection[];
}

export async function createCollection(
  db: SupabaseClient,
  input: { name: string; description?: string },
): Promise<Collection> {
  const slug = collectionSlug(input.name);
  const { data, error } = await db
    .from("collections")
    .insert({ name: input.name.trim(), slug, description: input.description ?? null })
    .select("id, name, slug, description, created_at, updated_at")
    .single();
  if (error) throw new Error(`createCollection failed: ${error.message}`);
  return data as Collection;
}

export async function renameCollection(
  db: SupabaseClient,
  id: string,
  name: string,
): Promise<Collection> {
  const { data, error } = await db
    .from("collections")
    .update({ name: name.trim(), slug: collectionSlug(name) })
    .eq("id", id)
    .select("id, name, slug, description, created_at, updated_at")
    .single();
  if (error) throw new Error(`renameCollection failed: ${error.message}`);
  return data as Collection;
}

export async function moveDocumentToCollection(
  db: SupabaseClient,
  documentId: string,
  collectionId: string | null,
): Promise<void> {
  const { error } = await db
    .from("documents")
    .update({ collection_id: collectionId })
    .eq("id", documentId);
  if (error) throw new Error(`moveDocumentToCollection failed: ${error.message}`);
}

/** Slug for a collection id, or "uncategorized" when null/missing. */
export async function collectionSlugFor(
  db: SupabaseClient,
  collectionId: string | null | undefined,
): Promise<string> {
  if (!collectionId) return "uncategorized";
  const { data } = await db.from("collections").select("slug").eq("id", collectionId).maybeSingle();
  return (data?.slug as string) ?? "uncategorized";
}
