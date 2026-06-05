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
