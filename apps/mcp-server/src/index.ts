import { serve } from "@hono/node-server";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { z } from "zod";
import {
  createLiteratureNote,
  createModelClient,
  createServiceClient,
  createSourceNote,
  ConfigError,
  dueForAutoSync,
  ensureAccessKey,
  formatCitation,
  getConfig,
  git,
  ingestDocument,
  NoteExistsError,
  notesCitingDocument,
  ragQuery,
  registerDocument,
  requireVaultRoot,
  syncMendeley,
  type Config,
} from "@lob/core";

/**
 * megamind MCP server.
 *
 * Exposes the research-assistant toolset to any MCP client (Perplexity, Claude,
 * Codex, your own frontend). Config is read fresh per request from the settings
 * layer, so credential/vault changes made in the UI take effect without a
 * restart. Missing config surfaces as a clean tool error pointing at setup.
 */

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const err = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true as const });

function clients(): { config: Config; db: ReturnType<typeof createServiceClient>; model: ReturnType<typeof createModelClient> } {
  const config = getConfig();
  return { config, db: createServiceClient(config), model: createModelClient(config) };
}

/** Wrap a handler so ConfigError and thrown errors become clean tool errors. */
function guard<T extends unknown[]>(fn: (...args: T) => Promise<ReturnType<typeof text>>) {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ConfigError) return err(e.message);
      if (e instanceof NoteExistsError) return err(e.message);
      return err(`Error: ${(e as Error).message}`);
    }
  };
}

const server = new McpServer({ name: "megamind", version: "0.1.0" });

// --- Memory (second brain) ---------------------------------------------------

server.registerTool(
  "capture_thought",
  {
    title: "Capture Thought",
    description:
      "Save a standalone thought/insight to semantic memory. Embeds it for later semantic recall. Use for notes, decisions, or ideas worth remembering.",
    inputSchema: { content: z.string().describe("A clear, standalone statement.") },
  },
  guard(async ({ content }: { content: string }) => {
    const { db, model } = clients();
    const embedding = await model.embedOne(content, "document");
    let metadata: Record<string, unknown> = { source: "mcp" };
    try {
      const raw = await model.chat(
        [
          { role: "system", content: 'Extract JSON: {"type":"observation|task|idea|reference","topics":["..."]}. Only what is explicit.' },
          { role: "user", content },
        ],
        { json: true },
      );
      metadata = { ...JSON.parse(raw), source: "mcp" };
    } catch {
      metadata = { type: "observation", topics: ["uncategorized"], source: "mcp" };
    }
    const { error } = await db.from("thoughts").insert({ content, embedding, metadata });
    if (error) return err(`Failed to capture: ${error.message}`);
    return text(`Captured (${(metadata as { type?: string }).type ?? "thought"}).`);
  }),
);

server.registerTool(
  "search_thoughts",
  {
    title: "Search Thoughts",
    description: "Semantic search across captured thoughts.",
    inputSchema: {
      query: z.string(),
      limit: z.number().optional().default(10),
      threshold: z.number().optional().default(0.3),
    },
  },
  guard(async ({ query, limit, threshold }: { query: string; limit?: number; threshold?: number }) => {
    const { db, model } = clients();
    const embedding = await model.embedOne(query, "query");
    const { data, error } = await db.rpc("match_thoughts", {
      query_embedding: embedding,
      match_threshold: threshold ?? 0.3,
      match_count: limit ?? 10,
    });
    if (error) return err(`Search error: ${error.message}`);
    const rows = (data ?? []) as { content: string; similarity: number; created_at: string }[];
    if (!rows.length) return text(`No thoughts matching "${query}".`);
    return text(
      rows
        .map((r, i) => `${i + 1}. (${(r.similarity * 100).toFixed(0)}%) ${r.content}`)
        .join("\n\n"),
    );
  }),
);

// --- Documents + RAG ---------------------------------------------------------

server.registerTool(
  "register_document",
  {
    title: "Register Document",
    description:
      "Add a source document to the repository (metadata only). Returns its document_id. Follow with ingest_document to make it RAG-searchable.",
    inputSchema: {
      title: z.string(),
      authors: z.array(z.string()).optional(),
      source_url: z.string().optional(),
      doi: z.string().optional(),
      published: z.string().optional(),
      venue: z.string().optional(),
      kind: z.string().optional().describe("article | book | preprint | web | note"),
    },
  },
  guard(async (a: { title: string; authors?: string[]; source_url?: string; doi?: string; published?: string; venue?: string; kind?: string }) => {
    const { db } = clients();
    const doc = await registerDocument(db, {
      title: a.title, authors: a.authors, sourceUrl: a.source_url, doi: a.doi,
      published: a.published, venue: a.venue, kind: a.kind,
    });
    return text(`Registered document.\ndocument_id: ${doc.id}\ntitle: ${doc.title}`);
  }),
);

server.registerTool(
  "ingest_document",
  {
    title: "Ingest Document Text",
    description:
      "Chunk + embed a document's full text into the knowledge base so its passages become RAG-searchable and citable. Pass the extracted plain text.",
    inputSchema: {
      document_id: z.string(),
      text: z.string(),
      target_tokens: z.number().optional(),
      overlap_tokens: z.number().optional(),
    },
  },
  guard(async (a: { document_id: string; text: string; target_tokens?: number; overlap_tokens?: number }) => {
    const { db, model } = clients();
    const opts = a.target_tokens
      ? { targetTokens: a.target_tokens, overlapTokens: a.overlap_tokens ?? 64 }
      : undefined;
    const res = await ingestDocument(db, model, a.document_id, a.text, opts);
    return text(`Ingested ${res.chunkCount} chunk(s) for document ${res.documentId}.`);
  }),
);

server.registerTool(
  "rag_query",
  {
    title: "RAG Query",
    description:
      "Semantic search over document passages. Returns the most relevant chunks with their source document, section, and a similarity score. Use chunk ids when writing claim-level citations.",
    inputSchema: {
      query: z.string(),
      limit: z.number().optional().default(8),
      threshold: z.number().optional().default(0.3),
      document_id: z.string().optional().describe("Restrict to one document."),
    },
  },
  guard(async (a: { query: string; limit?: number; threshold?: number; document_id?: string }) => {
    const { db, model } = clients();
    const hits = await ragQuery(db, model, a.query, {
      limit: a.limit, threshold: a.threshold, documentId: a.document_id,
    });
    if (!hits.length) return text(`No passages found for "${a.query}".`);
    return text(
      hits
        .map(
          (h, i) =>
            `--- ${i + 1} (${(h.similarity * 100).toFixed(0)}%) ---\n` +
            `source: ${h.documentTitle}${h.section ? ` § ${h.section}` : ""}\n` +
            `document_id: ${h.documentId}\nchunk_id: ${h.chunkId}\n\n${h.text}`,
        )
        .join("\n\n"),
    );
  }),
);

server.registerTool(
  "list_documents",
  {
    title: "List Documents",
    description: "List documents in the repository. Use to dedup before registering, or to find a document_id.",
    inputSchema: {
      limit: z.number().optional().default(50),
      status: z.string().optional().describe("registered | ingesting | ingested | failed"),
    },
  },
  guard(async (a: { limit?: number; status?: string }) => {
    const { db } = clients();
    let q = db.from("documents").select("id, title, authors, status, created_at").order("created_at", { ascending: false }).limit(a.limit ?? 50);
    if (a.status) q = q.eq("status", a.status);
    const { data, error } = await q;
    if (error) return err(error.message);
    const rows = (data ?? []) as { id: string; title: string; authors: string[]; status: string }[];
    if (!rows.length) return text("No documents.");
    return text(rows.map((r) => `- [${r.status}] ${r.title} (${(r.authors ?? []).join(", ") || "n/a"})\n  ${r.id}`).join("\n"));
  }),
);

// --- Traceable notes ---------------------------------------------------------

server.registerTool(
  "create_source_note",
  {
    title: "Create Source Note",
    description:
      "Create the vault note representing a repository document (literature-note pattern). Lets [[Title]] wikilinks from other notes resolve in Obsidian.",
    inputSchema: { document_id: z.string(), topics: z.array(z.string()).optional() },
  },
  guard(async (a: { document_id: string; topics?: string[] }) => {
    const { db, config } = clients();
    const { data, error } = await db
      .from("documents")
      .select("id, title, authors, source_url, doi, published, venue")
      .eq("id", a.document_id)
      .single();
    if (error) return err(`Document not found: ${error.message}`);
    const res = await createSourceNote(db, config, data, a.topics ?? []);
    return text(`Created source note: ${res.relPath}`);
  }),
);

const ClaimSchema = z.object({
  text: z.string().describe("The claim as it appears in the note."),
  document_id: z.string().optional().describe("Repository document this claim is drawn from."),
  chunk_id: z.string().optional().describe("Exact backing passage; auto-resolved from the claim if omitted."),
  quote: z.string().optional().describe("Short fair-use quote (<=500 chars)."),
});

server.registerTool(
  "create_literature_note",
  {
    title: "Create Literature / Synthesis Note",
    description:
      "Write a literature note or literature-review synthesis into the Obsidian vault with CLAIM-LEVEL traceability. Each claim names the document it came from; the server resolves the exact backing passage and records the link, so every assertion traces to a source passage. Referenced documents get source notes auto-created so wikilinks resolve.",
    inputSchema: {
      title: z.string(),
      topics: z.array(z.string()).min(1),
      claims: z.array(ClaimSchema).min(1),
      summary: z.string().optional(),
      note_type: z.enum(["literature", "synthesis"]).optional(),
      open_questions: z.array(z.string()).optional(),
      status: z.string().optional(),
    },
  },
  guard(async (a: {
    title: string; topics: string[]; summary?: string; note_type?: "literature" | "synthesis";
    claims: { text: string; document_id?: string; chunk_id?: string; quote?: string }[];
    open_questions?: string[]; status?: string;
  }) => {
    const { db, model, config } = clients();

    // Auto-create source notes for referenced documents so [[wikilinks]] resolve.
    const docIds = [...new Set(a.claims.map((c) => c.document_id).filter(Boolean) as string[])];
    if (docIds.length) {
      const { data: docs } = await db
        .from("documents").select("id, title, authors, source_url, doi, published, venue").in("id", docIds);
      for (const d of docs ?? []) {
        try { await createSourceNote(db, config, d, a.topics); } catch (e) {
          if (!(e instanceof NoteExistsError)) throw e;
        }
      }
    }

    const res = await createLiteratureNote(db, model, config, {
      title: a.title, topics: a.topics, summary: a.summary, noteType: a.note_type,
      claims: a.claims.map((c) => ({ text: c.text, documentId: c.document_id, chunkId: c.chunk_id, quote: c.quote })),
      openQuestions: a.open_questions, status: a.status,
    });
    return text(
      `Created ${a.note_type ?? "literature"} note: ${res.relPath}\n` +
        `Traceability links: ${res.linkCount} (exact passages resolved: ${res.resolvedChunks}).`,
    );
  }),
);

server.registerTool(
  "trace_document",
  {
    title: "Trace Document",
    description: "Reverse traceability: list every note that cites a given document, and how many claims each one draws from it.",
    inputSchema: { document_id: z.string() },
  },
  guard(async (a: { document_id: string }) => {
    const { db } = clients();
    const rows = await notesCitingDocument(db, a.document_id);
    if (!rows.length) return text("No notes cite this document yet.");
    return text(rows.map((r) => `- ${r.title} (${r.claims} claim(s))\n  ${r.vaultPath}`).join("\n"));
  }),
);

server.registerTool(
  "generate_bibliography",
  {
    title: "Generate Bibliography",
    description: "Format a bibliography from document_ids. Styles: markdown, apa, chicago.",
    inputSchema: {
      document_ids: z.array(z.string()).min(1),
      style: z.enum(["markdown", "apa", "chicago"]).optional(),
    },
  },
  guard(async (a: { document_ids: string[]; style?: "markdown" | "apa" | "chicago" }) => {
    const { db } = clients();
    const { data, error } = await db
      .from("documents").select("title, authors, published, venue, doi, source_url").in("id", a.document_ids);
    if (error) return err(error.message);
    const lines = (data ?? []).map((d) =>
      formatCitation(
        { title: d.title, authors: d.authors, published: d.published ?? undefined, venue: d.venue ?? undefined, doi: d.doi ?? undefined, source: d.source_url ?? undefined },
        a.style ?? "markdown",
      ),
    );
    return text(lines.map((l) => `- ${l}`).join("\n"));
  }),
);

// --- Vault git ---------------------------------------------------------------

server.registerTool(
  "vault_status",
  {
    title: "Vault Git Status",
    description: "Git status of the Obsidian vault: branch, remote, ahead/behind, and dirty file count.",
    inputSchema: {},
  },
  guard(async () => {
    const config = getConfig();
    const root = requireVaultRoot(config);
    const s = await git.status(root);
    if (!s.isRepo) return text("Vault is not a git repository.");
    return text(
      `branch: ${s.branch}\nremote: ${s.remote ?? "(none)"}\nahead: ${s.ahead} behind: ${s.behind}\ndirty files: ${s.dirty}`,
    );
  }),
);

server.registerTool(
  "vault_sync",
  {
    title: "Vault Git Sync",
    description: "Commit local vault changes, pull (rebase), and push to the GitHub remote.",
    inputSchema: { message: z.string().optional() },
  },
  guard(async (a: { message?: string }) => {
    const config = getConfig();
    const root = requireVaultRoot(config);
    const r = await git.sync(root, a.message ?? `vault sync ${new Date().toISOString()}`, config.git.branch);
    return text(`committed: ${r.committed}\npull: ${r.pulled}\npush: ${r.pushed}`);
  }),
);

// --- HTTP transport with access-key gate ------------------------------------

const app = new Hono();

app.all("*", async (c) => {
  const config = getConfig();
  const accessKey = config.mcp.accessKey;
  const provided = c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  if (!accessKey || provided !== accessKey) {
    return c.json({ error: "Invalid or missing access key" }, 401);
  }
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

const config = getConfig();
const key = ensureAccessKey();
const { port, host } = config.mcp;

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`[megamind] MCP server on http://${host}:${info.port}`);
  console.log(`[megamind] access key: ${key}`);
  console.log(`[megamind] connect clients to: http://${host}:${info.port}?key=${key}`);
});

// --- Mendeley auto-sync heartbeat ---
// Every 60s, re-read settings and run a sync if one is due (cadence set in the
// UI). Self-correcting + re-entrancy-guarded; editing the interval takes effect
// within a minute without a restart.
let autoSyncRunning = false;
setInterval(async () => {
  const cfg = getConfig();
  if (autoSyncRunning || !cfg.supabase.url || !cfg.supabase.serviceRoleKey) return;
  if (!dueForAutoSync(cfg)) return;
  autoSyncRunning = true;
  try {
    console.log(`[auto-sync] ${new Date().toISOString()} starting Mendeley sync…`);
    const db = createServiceClient(cfg);
    const model = createModelClient(cfg);
    const r = await syncMendeley(db, model, cfg, { review: cfg.settings.mendeley.autoSyncReview });
    console.log(`[auto-sync] done: +${r.imported} new, ${r.skipped} skipped, ${r.failed} failed`);
  } catch (e) {
    console.log(`[auto-sync] error: ${(e as Error).message}`);
  } finally {
    autoSyncRunning = false;
  }
}, 60_000);
