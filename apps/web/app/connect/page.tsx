import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getMcpConnectionInfo } from "@/app/actions";
import { ConnectorConfigs } from "@/components/connect/connector-configs";

export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const info = await getMcpConnectionInfo();
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Connect clients</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Wire Perplexity, Claude, Codex, Cursor and others to your MCP server. Make sure the server
        is running (<Link href="/server" className="underline">/server</Link>).
      </p>
      <ConnectorConfigs info={info} />
    </main>
  );
}
