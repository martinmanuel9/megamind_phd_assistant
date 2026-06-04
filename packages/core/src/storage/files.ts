import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Document file storage via Supabase Storage. The same API works against a
 * local `supabase start` stack and managed Supabase, so uploaded files migrate
 * with the rest of the project when stakeholders upgrade — no path rewrites.
 *
 * Files live in the private `documents` bucket; rows in the `documents` table
 * hold the bucket-relative `storage_path`. Access is brokered server-side
 * (service role) or via short-lived signed URLs for the frontend viewer.
 */

export const DOCUMENTS_BUCKET = "documents";

/** Create the documents bucket if it doesn't exist (idempotent). */
export async function ensureDocumentsBucket(db: SupabaseClient): Promise<void> {
  const { data: buckets, error } = await db.storage.listBuckets();
  if (error) throw new Error(`listBuckets failed: ${error.message}`);
  if (buckets?.some((b) => b.name === DOCUMENTS_BUCKET)) return;
  const { error: createErr } = await db.storage.createBucket(DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: "50MB",
  });
  // Tolerate a race where another process created it first.
  if (createErr && !/already exists/i.test(createErr.message)) {
    throw new Error(`createBucket failed: ${createErr.message}`);
  }
}

export async function uploadDocumentFile(
  db: SupabaseClient,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<{ path: string }> {
  await ensureDocumentsBucket(db);
  const { error } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return { path };
}

export async function downloadDocumentFile(
  db: SupabaseClient,
  path: string,
): Promise<Uint8Array> {
  const { data, error } = await db.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
  return new Uint8Array(await data.arrayBuffer());
}

/** Short-lived signed URL for the frontend document viewer. */
export async function getDocumentSignedUrl(
  db: SupabaseClient,
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await db.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data) throw new Error(`signed url failed: ${error?.message ?? "no data"}`);
  return data.signedUrl;
}
