import Link from "next/link";
import { loadSettings, redactSettings } from "@lob/core";
import { SetupForms } from "@/components/setup/setup-forms";
import { ModelAdvisor } from "@/components/setup/model-advisor";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const settings = redactSettings(loadSettings());
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Setup</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Configure your backend. Everything is stored locally in
        <code className="mx-1 font-mono text-xs">~/.localopenbrain/settings.json</code>
        and read by both the app and the MCP server.
      </p>
      <div className="mb-6">
        <ModelAdvisor />
      </div>
      <SetupForms initial={settings} />
    </main>
  );
}
