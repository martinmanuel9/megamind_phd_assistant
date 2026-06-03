/**
 * Document chunking for RAG.
 *
 * Chunking is THE quality lever for retrieval + traceability. A chunk is the
 * unit a note's claim links back to, so chunk boundaries decide how precise
 * "jump to the source passage" feels. Too small → claims lose surrounding
 * context and citations feel fragmentary. Too large → retrieval gets imprecise
 * and you blow past even nomic's 8192-token window.
 *
 * `chunkText` is the seam. A sensible default is provided
 * (`chunkByParagraphs`); the strategy is intentionally swappable.
 */

export interface Chunk {
  ord: number;
  text: string;
  /** Nearest preceding Markdown/heading anchor, if detectable. */
  section?: string;
  /** Rough token estimate (~4 chars/token) for budgeting + storage. */
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target chunk size in tokens (nomic handles up to 8192; 512 is a safe RAG default). */
  targetTokens: number;
  /** Overlap between consecutive chunks, in tokens, to preserve cross-boundary context. */
  overlapTokens: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetTokens: 512,
  overlapTokens: 64,
};

/** Cheap, model-agnostic token estimate. Good enough for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Track the most recent Markdown heading so chunks carry a section anchor. */
function headingOf(block: string): string | undefined {
  const m = /^(#{1,6})\s+(.+)$/m.exec(block.trimStart());
  return m ? m[2]!.trim() : undefined;
}

/**
 * Default strategy: RECURSIVE (paragraph → sentence → hard-split).
 *
 * Robust to any input — including the messy text PDFs produce and pathological
 * mega-paragraphs that simple packing can't bound. Every atom carries its
 * nearest heading so chunks stay section-aware for traceability.
 */
export function chunkText(text: string, opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS): Chunk[] {
  return chunkRecursive(text, opts);
}

interface Atom {
  text: string;
  section?: string;
}

/** Split a paragraph into sentences (kept naive on purpose — no NLP dep). */
function splitSentences(para: string): string[] {
  const parts = para.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g);
  return (parts ?? [para]).map((s) => s.trim()).filter(Boolean);
}

/** Hard-split an over-long sentence on a word boundary near the target size. */
function hardSplit(text: string, targetChars: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > targetChars) {
    const window = rest.slice(0, targetChars + 1);
    const cut = window.lastIndexOf(" ");
    const at = cut > targetChars * 0.5 ? cut : targetChars;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Break text into atoms no larger than targetTokens, recursing
 * paragraph → sentence → hard-split only as needed. Each atom keeps the nearest
 * heading seen so far.
 */
function toAtoms(text: string, targetTokens: number): Atom[] {
  const targetChars = targetTokens * 4;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+\n/g, "\n").trim())
    .filter(Boolean);

  const atoms: Atom[] = [];
  let section: string | undefined;
  for (const para of paragraphs) {
    const heading = headingOf(para);
    if (heading) section = heading;
    if (estimateTokens(para) <= targetTokens) {
      atoms.push({ text: para, section });
      continue;
    }
    for (const sentence of splitSentences(para)) {
      if (estimateTokens(sentence) <= targetTokens) {
        atoms.push({ text: sentence, section });
      } else {
        for (const piece of hardSplit(sentence, targetChars)) {
          atoms.push({ text: piece, section });
        }
      }
    }
  }
  return atoms;
}

/** Greedily pack atoms up to target size, carrying token overlap across cuts. */
function packAtoms(atoms: Atom[], opts: ChunkOptions): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: Atom[] = [];
  let bufTokens = 0;
  let ord = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const body = buf.map((a) => a.text).join("\n\n");
    const section = buf.find((a) => a.section)?.section;
    chunks.push({ ord: ord++, text: body, section, tokenCount: estimateTokens(body) });
    const carried: Atom[] = [];
    let carriedTokens = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      const t = estimateTokens(buf[i]!.text);
      if (carriedTokens + t > opts.overlapTokens) break;
      carried.unshift(buf[i]!);
      carriedTokens += t;
    }
    buf = carried;
    bufTokens = carriedTokens;
  };

  for (const atom of atoms) {
    const t = estimateTokens(atom.text);
    if (bufTokens + t > opts.targetTokens && buf.length > 0) flush();
    buf.push(atom);
    bufTokens += t;
  }
  flush();
  return chunks;
}

/** Recursive strategy: the default used by chunkText. */
export function chunkRecursive(text: string, opts: ChunkOptions = DEFAULT_CHUNK_OPTIONS): Chunk[] {
  return packAtoms(toAtoms(text, opts.targetTokens), opts);
}

/** Alternative strategy: pack paragraphs up to target size, with token overlap. */
export function chunkByParagraphs(text: string, opts: ChunkOptions): Chunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+\n/g, "\n").trim())
    .filter((p) => p.length > 0);

  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let bufTokens = 0;
  let currentSection: string | undefined;
  let ord = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const body = buf.join("\n\n");
    chunks.push({ ord: ord++, text: body, section: currentSection, tokenCount: estimateTokens(body) });
    // Carry overlap: keep trailing paragraphs that fit within overlapTokens.
    const carried: string[] = [];
    let carriedTokens = 0;
    for (let i = buf.length - 1; i >= 0; i--) {
      const t = estimateTokens(buf[i]!);
      if (carriedTokens + t > opts.overlapTokens) break;
      carried.unshift(buf[i]!);
      carriedTokens += t;
    }
    buf = carried;
    bufTokens = carriedTokens;
  };

  for (const para of paragraphs) {
    const heading = headingOf(para);
    if (heading) currentSection = heading;
    const t = estimateTokens(para);
    if (bufTokens + t > opts.targetTokens && buf.length > 0) flush();
    buf.push(para);
    bufTokens += t;
  }
  flush();
  return chunks;
}
