import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMendeleyOverview } from "@/app/actions";
import { MendeleyPanel } from "@/components/sync/mendeley-panel";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const overview = await getMendeleyOverview();
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Mendeley sync</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Connect your local Mendeley library and sync new papers into the repository.
      </p>
      <MendeleyPanel initial={overview} />
    </main>
  );
}
