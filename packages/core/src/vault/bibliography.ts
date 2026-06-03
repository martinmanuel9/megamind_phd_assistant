/**
 * Citation formatting. Adapted from open-brain to operate on a generic
 * CitationInput so it works for both Supabase `documents` rows and note
 * frontmatter. Styles: markdown (casual), APA 7th, Chicago author-date.
 */

export type CitationStyle = "markdown" | "apa" | "chicago";

export interface CitationInput {
  title: string;
  authors?: string[];
  published?: string;
  venue?: string;
  publisher?: string;
  doi?: string;
  source?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  isbn?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ParsedDate {
  year: string;
  monthName?: string;
  day?: string;
}

function parseDate(published?: string): ParsedDate | undefined {
  if (!published) return undefined;
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(published);
  if (full) {
    return { year: full[1]!, monthName: MONTHS[Number(full[2]) - 1], day: String(Number(full[3])) };
  }
  const yr = /^(\d{4})/.exec(published);
  return yr ? { year: yr[1]! } : undefined;
}

function detectKind(f: CitationInput): "web" | "journal" | "book" {
  if (f.isbn) return "book";
  if (f.doi || (f.volume && f.issue)) return "journal";
  return "web";
}

function ensureTrailingPeriod(s: string): string {
  return s.endsWith(".") ? s : `${s}.`;
}

function doiUrl(doi: string): string {
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

function sentenceCase(s: string): string {
  if (s.length === 0) return s;
  let out = "";
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "(") { depth++; out += c; continue; }
    if (c === ")") { depth = Math.max(0, depth - 1); out += c; continue; }
    out += i === 0 ? c.toUpperCase() : depth > 0 ? c : c.toLowerCase();
  }
  return out;
}

function joinMarkdown(a: string[]): string {
  if (a.length === 0) return "Unknown author";
  if (a.length === 1) return a[0]!;
  if (a.length === 2) return `${a[0]} & ${a[1]}`;
  return `${a.slice(0, -1).join(", ")}, & ${a[a.length - 1]}`;
}

function joinApa(a: string[]): string {
  if (a.length === 0) return "Unknown.";
  if (a.length === 1) return ensureTrailingPeriod(a[0]!);
  if (a.length === 2) return `${ensureTrailingPeriod(a[0]!)}, & ${ensureTrailingPeriod(a[1]!)}`;
  return `${a.slice(0, -1).map(ensureTrailingPeriod).join(", ")}, & ${ensureTrailingPeriod(a[a.length - 1]!)}`;
}

function joinChicago(a: string[]): string {
  if (a.length === 0) return "Unknown";
  if (a.length === 1) return a[0]!;
  if (a.length === 2) return `${a[0]}, and ${a[1]}`;
  return `${a.slice(0, -1).join(", ")}, and ${a[a.length - 1]}`;
}

export function formatCitation(f: CitationInput, style: CitationStyle): string {
  const authors = f.authors ?? [];
  if (style === "markdown") {
    const p: string[] = [`**${joinMarkdown(authors)}**`];
    if (f.published) p.push(`(${f.published})`);
    p.push(`"${f.title}."`);
    if (f.venue) p.push(`*${f.venue}*.`);
    if (f.source) p.push(`[link](${f.source})`);
    else if (f.doi) p.push(`[doi](${doiUrl(f.doi)})`);
    return p.join(" ");
  }

  const kind = detectKind(f);
  const date = parseDate(f.published);

  if (style === "apa") {
    const p: string[] = [joinApa(authors)];
    p.push(date ? (kind !== "book" && date.monthName && date.day ? `(${date.year}, ${date.monthName} ${date.day}).` : `(${date.year}).`) : "(n.d.).");
    if (kind === "book") {
      p.push(`*${f.title}*.`);
      if (f.publisher) p.push(`${f.publisher}.`);
    } else if (kind === "journal") {
      p.push(`${sentenceCase(f.title)}.`);
      if (f.venue) {
        const iss = f.volume && f.issue ? `, ${f.volume}(${f.issue})` : "";
        const pg = f.pages ? `, ${f.pages}` : "";
        p.push(`*${f.venue}*${iss}${pg}.`);
      }
      if (f.doi) p.push(doiUrl(f.doi));
      else if (f.source) p.push(f.source);
    } else {
      p.push(`${sentenceCase(f.title)}.`);
      if (f.venue) p.push(`${f.venue}.`);
      if (f.source) p.push(f.source);
    }
    return p.join(" ");
  }

  // chicago
  const p: string[] = [`${joinChicago(authors)}.`, date ? `${date.year}.` : "n.d."];
  if (kind === "book") {
    p.push(`*${f.title}*.`);
    if (f.publisher) p.push(`${f.publisher}.`);
  } else if (kind === "journal") {
    p.push(`"${f.title}."`);
    if (f.venue) {
      const iss = f.volume && f.issue ? ` ${f.volume} (${f.issue})` : "";
      const pg = f.pages ? `: ${f.pages}` : "";
      p.push(`*${f.venue}*${iss}${pg}.`);
    }
    if (f.doi) p.push(doiUrl(f.doi) + ".");
    else if (f.source) p.push(f.source + ".");
  } else {
    p.push(`"${f.title}."`);
    if (f.venue) p.push(`${f.venue}.`);
    if (date?.monthName && date.day) p.push(`${date.monthName} ${date.day}.`);
    if (f.source) p.push(f.source + ".");
  }
  return p.join(" ");
}
