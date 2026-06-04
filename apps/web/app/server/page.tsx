import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSchedulerStatus, mcpServerLogs, mcpServerStatus } from "@/app/actions";
import { McpControl } from "@/components/server/mcp-control";

export const dynamic = "force-dynamic";

export default async function ServerPage() {
  const [status, logs, sched] = await Promise.all([mcpServerStatus(), mcpServerLogs(300), getSchedulerStatus()]);
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">MCP server</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Start, stop, and monitor the server your AI clients connect to.
      </p>
      <McpControl initial={status} initialLogs={logs} sched={sched} />
    </main>
  );
}
