import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { vaultGitStatus } from "@/app/actions";
import { VaultPanel } from "@/components/vault/vault-panel";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const status = await vaultGitStatus();
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Obsidian Vault &amp; git</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Version and sync your Obsidian vault to GitHub.
      </p>
      <VaultPanel initial={status} />
    </main>
  );
}
