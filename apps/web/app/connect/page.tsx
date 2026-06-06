import Link from "next/link";
import { networkInterfaces } from "node:os";
import { ArrowLeft } from "lucide-react";
import { getMcpConnectionInfo, mcpServerStatus } from "@/app/actions";
import { ConnectorConfigs } from "@/components/connect/connector-configs";

export const dynamic = "force-dynamic";

/** First non-internal IPv4 address — used to connect clients on other machines. */
function firstLanIp(): string | undefined {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return undefined;
}

export default async function ConnectPage() {
  const [info, server] = await Promise.all([getMcpConnectionInfo(), mcpServerStatus()]);
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Connect clients</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Wire Perplexity, Claude, Codex, Cursor and others to your MCP server. Copy a config for your
        client, then restart it.
      </p>
      <ConnectorConfigs info={info} running={server.running} lanIp={firstLanIp()} />
    </main>
  );
}
