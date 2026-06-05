/** Read the `type:` scalar from a note's YAML frontmatter, if present. */
export function frontmatterType(content: string): string | undefined {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return undefined;
  const t = fm[1]!.match(/^type:\s*(.+)$/m);
  if (!t) return undefined;
  return t[1]!.trim().replace(/^["']|["']$/g, "") || undefined;
}

/** Source notes are thin citation pointers — everything else is worth embedding. */
export function isEmbeddable(noteType: string | undefined): boolean {
  return noteType !== "source";
}

export interface NoteDiff {
  added: string[];
  removed: string[];
}

/** Compare disk paths to DB paths: what to add, what to remove. */
export function diffNotes(diskPaths: string[], dbPaths: string[]): NoteDiff {
  const disk = new Set(diskPaths);
  const db = new Set(dbPaths);
  return {
    added: diskPaths.filter((p) => !db.has(p)),
    removed: dbPaths.filter((p) => !disk.has(p)),
  };
}
