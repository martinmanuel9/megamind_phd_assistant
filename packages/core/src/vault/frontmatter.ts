/**
 * Minimal YAML frontmatter emitter + permissive reader. No YAML dependency: the
 * schema we emit is small and fixed, and we only ever parse frontmatter we
 * wrote. Ported from open-brain.
 */

export type FrontmatterValue = string | string[] | null | undefined;
export type FrontmatterField = [key: string, value: FrontmatterValue];

const SPECIAL_LEADING = new Set([
  "[", "]", "{", "}", "-", "?", ":", "!", "*", "&", "@", "%", ">", "|", "#", "'", '"', ",",
]);

function emitScalar(raw: string): string {
  const needsQuote =
    raw.length === 0 ||
    SPECIAL_LEADING.has(raw[0]!) ||
    (/[: ]/.test(raw) && raw.includes(": ")) ||
    raw.includes("#") ||
    raw !== raw.trim();
  if (!needsQuote) return raw;
  return `"${raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function emitFrontmatter(fields: FrontmatterField[]): string {
  const lines = ["---"];
  for (const [key, value] of fields) {
    if (value === null || value === undefined) {
      lines.push(`${key}:`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}:`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${emitScalar(item)}`);
      }
    } else {
      lines.push(`${key}: ${emitScalar(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---/;
const SCALAR_LINE_RE = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/;
const LIST_ITEM_RE = /^\s+-\s+(.*)$/;

function unquoteScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

export interface ExtractedFields {
  created: string | undefined;
  tags: string[];
}

export function extractFrontmatterFields(content: string): ExtractedFields {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { created: undefined, tags: [] };
  const lines = match[1]!.split("\n");

  let created: string | undefined;
  const tags: string[] = [];
  let inTagsBlock = false;

  for (const line of lines) {
    const scalar = SCALAR_LINE_RE.exec(line);
    if (scalar) {
      inTagsBlock = false;
      const [, key, value] = scalar;
      if (key === "created" && value!.trim().length > 0) created = unquoteScalar(value!);
      else if (key === "tags" && value!.trim().length === 0) inTagsBlock = true;
      continue;
    }
    if (inTagsBlock) {
      const item = LIST_ITEM_RE.exec(line);
      if (item) tags.push(unquoteScalar(item[1]!));
      else inTagsBlock = false;
    }
  }
  return { created, tags };
}

export interface BibliographyFields {
  authors: string[];
  source: string | undefined;
  published: string | undefined;
  venue: string | undefined;
  publisher: string | undefined;
  doi: string | undefined;
  accessed: string | undefined;
  volume: string | undefined;
  issue: string | undefined;
  pages: string | undefined;
  isbn: string | undefined;
}

const BIBLIO_SCALAR_KEYS = [
  "source", "published", "venue", "publisher", "doi", "accessed", "volume", "issue", "pages", "isbn",
] as const;

export function extractBibliographyFields(content: string): BibliographyFields {
  const out: BibliographyFields = {
    authors: [], source: undefined, published: undefined, venue: undefined,
    publisher: undefined, doi: undefined, accessed: undefined, volume: undefined,
    issue: undefined, pages: undefined, isbn: undefined,
  };
  const match = content.match(FRONTMATTER_RE);
  if (!match) return out;
  const lines = match[1]!.split("\n");

  let inAuthorsBlock = false;
  for (const line of lines) {
    const scalar = SCALAR_LINE_RE.exec(line);
    if (scalar) {
      inAuthorsBlock = false;
      const [, key, value] = scalar;
      const trimmed = value!.trim();
      if (key === "authors" && trimmed.length === 0) {
        inAuthorsBlock = true;
        continue;
      }
      if ((BIBLIO_SCALAR_KEYS as readonly string[]).includes(key!) && trimmed.length > 0) {
        (out as unknown as Record<string, unknown>)[key!] = unquoteScalar(value!);
      }
      continue;
    }
    if (inAuthorsBlock) {
      const item = LIST_ITEM_RE.exec(line);
      if (item) out.authors.push(unquoteScalar(item[1]!));
      else inAuthorsBlock = false;
    }
  }
  return out;
}
