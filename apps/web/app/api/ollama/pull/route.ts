import { getConfig, ollamaHost } from "@lob/core";

export const runtime = "nodejs";
export const maxDuration = 3600;

/**
 * POST /api/ollama/pull { model } — proxies Ollama's streaming pull so the UI
 * can show live download progress. The NDJSON body is piped straight through
 * (no buffering a multi-GB download).
 */
export async function POST(req: Request) {
  let model: string;
  try {
    ({ model } = await req.json());
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!model || !/^[a-zA-Z0-9._:\/-]+$/.test(model)) {
    return Response.json({ error: "invalid model name" }, { status: 400 });
  }

  const host = ollamaHost(getConfig());
  let upstream: Response;
  try {
    upstream = await fetch(`${host}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });
  } catch (e) {
    return Response.json({ error: `Ollama unreachable: ${(e as Error).message}` }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: `Ollama pull failed: ${upstream.status}` }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
