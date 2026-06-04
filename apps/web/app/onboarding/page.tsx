import { BrainCircuit } from "lucide-react";
import { loadSettings, redactSettings } from "@lob/core";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const settings = redactSettings(loadSettings());
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <BrainCircuit className="size-7 text-primary" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Megamind</h1>
          <p className="text-sm text-muted-foreground">Let&apos;s get your research assistant set up.</p>
        </div>
      </div>
      <OnboardingWizard initial={settings} />
    </main>
  );
}
