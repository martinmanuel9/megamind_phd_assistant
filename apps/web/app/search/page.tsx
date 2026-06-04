import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SearchPanel } from "@/components/search/search-panel";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Search</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Semantic search across your document repository and captured memory.
      </p>
      <SearchPanel />
    </main>
  );
}
