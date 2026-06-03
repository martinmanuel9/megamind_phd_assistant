import { type Config } from "../config.js";

/**
 * OpenAI-compatible model client. Defaults to local Ollama
 * (http://localhost:11434/v1) but works unchanged against OpenAI, Together,
 * Perplexity, or any compatible endpoint — swap baseUrl + apiKey in settings.
 *
 * This is the single seam that satisfies "Perplexity, Ollama, or whatever":
 * everything downstream calls embed()/chat() and never knows the provider.
 */

export type EmbedKind = "document" | "query";

/**
 * nomic-embed-text is asymmetric: passages must be prefixed with
 * "search_document:" and queries with "search_query:" for good retrieval. Other
 * models ignore prefixes, so we only apply them when the model name says nomic.
 */
function applyPrefix(model: string, kind: EmbedKind, text: string): string {
  if (!/nomic/i.test(model)) return text;
  return kind === "query" ? `search_query: ${text}` : `search_document: ${text}`;
}

export class ModelClient {
  constructor(private readonly cfg: Config["models"]) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.apiKey) h["Authorization"] = `Bearer ${this.cfg.apiKey}`;
    return h;
  }

  /** Embed one or more texts. Returns vectors aligned to the input order. */
  async embed(texts: string[], kind: EmbedKind = "document"): Promise<number[][]> {
    if (texts.length === 0) return [];
    const input = texts.map((t) => applyPrefix(this.cfg.embedModel, kind, t));
    const r = await fetch(`${this.cfg.baseUrl}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.cfg.embedModel, input }),
    });
    if (!r.ok) {
      throw new Error(`embeddings failed: ${r.status} ${await r.text().catch(() => "")}`);
    }
    const data = (await r.json()) as { data: { embedding: number[]; index: number }[] };
    // The OpenAI-compatible response may not preserve order — sort by index.
    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    const vectors = sorted.map((d) => d.embedding);
    for (const v of vectors) {
      if (v.length !== this.cfg.embedDim) {
        throw new Error(
          `embedding dimension mismatch: model returned ${v.length}, settings say ${this.cfg.embedDim}. ` +
            `Update models.embedDim and the vector(N) columns to match.`,
        );
      }
    }
    return vectors;
  }

  async embedOne(text: string, kind: EmbedKind = "document"): Promise<number[]> {
    const [v] = await this.embed([text], kind);
    if (!v) throw new Error("no embedding returned");
    return v;
  }

  /** Non-streaming chat completion. */
  async chat(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    opts: { json?: boolean; model?: string; temperature?: number } = {},
  ): Promise<string> {
    const r = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: opts.model ?? this.cfg.chatModel,
        messages,
        temperature: opts.temperature ?? 0.2,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!r.ok) {
      throw new Error(`chat failed: ${r.status} ${await r.text().catch(() => "")}`);
    }
    const data = (await r.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message?.content ?? "";
  }
}

export function createModelClient(config: Config): ModelClient {
  return new ModelClient(config.models);
}
