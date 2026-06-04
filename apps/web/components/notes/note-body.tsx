"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render a vault note's Markdown body (frontmatter stripped). */
export function NoteBody({ content }: { content: string }) {
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:font-semibold prose-a:text-primary">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}
