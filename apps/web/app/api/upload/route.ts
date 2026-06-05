import { createModelClient, createServiceClient, getConfig, processDocumentUpload } from "@lob/core";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/upload — multipart file upload. Extracts text, stores the file in
 * Supabase Storage, registers the document, and chunk+embeds it. Returns the
 * created document + chunk count. Runs entirely server-side.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "no file provided" }, { status: 400 });
    }

    const config = getConfig();
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      return Response.json({ error: "Supabase not configured (Setup → Supabase)" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const str = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    const authorsRaw = str("authors");

    const db = createServiceClient(config);
    const model = createModelClient(config);

    const result = await processDocumentUpload(db, model, {
      filename: file.name,
      bytes,
      mime: file.type,
      title: str("title"),
      authors: authorsRaw ? authorsRaw.split(",").map((a) => a.trim()).filter(Boolean) : undefined,
      sourceUrl: str("source_url"),
      doi: str("doi"),
      published: str("published"),
      venue: str("venue"),
      collectionId: str("collectionId"),
    });

    return Response.json({
      ok: true,
      documentId: result.document.id,
      title: result.document.title,
      chunks: result.chunkCount,
      textLength: result.textLength,
      deduped: result.deduped,
    });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
