"use client";

import { useEffect, useState, useTransition } from "react";
import type { HardwareAdvice } from "@/app/actions";
import { fetchHardwareAdvice, setChatModel } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cpu, Loader2 } from "lucide-react";

export function ModelAdvisor() {
  const [advice, setAdvice] = useState<HardwareAdvice | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [pulls, setPulls] = useState<Record<string, { status: string; pct: number }>>({});
  const [pending, start] = useTransition();

  async function pull(name: string) {
    setPulls((p) => ({ ...p, [name]: { status: "starting", pct: 0 } }));
    try {
      const res = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        setPulls((p) => ({ ...p, [name]: { status: `error: ${e.error ?? res.status}`, pct: 0 } }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string };
            if (j.error) { setPulls((p) => ({ ...p, [name]: { status: `error: ${j.error}`, pct: p[name]?.pct ?? 0 } })); continue; }
            const pct = j.total ? Math.round(((j.completed ?? 0) / j.total) * 100) : undefined;
            setPulls((p) => ({ ...p, [name]: { status: j.status ?? "", pct: pct ?? p[name]?.pct ?? 0 } }));
          } catch { /* partial line */ }
        }
      }
      setPulls((p) => ({ ...p, [name]: { status: "done", pct: 100 } }));
      setAdvice((a) => (a ? { ...a, recommendations: a.recommendations.map((m) => (m.name === name ? { ...m, installed: true } : m)) } : a));
    } catch (e) {
      setPulls((p) => ({ ...p, [name]: { status: `error: ${(e as Error).message}`, pct: p[name]?.pct ?? 0 } }));
    }
  }

  useEffect(() => {
    fetchHardwareAdvice().then(setAdvice).catch(() => setAdvice(null));
  }, []);

  if (!advice) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Detecting hardware…
        </CardContent>
      </Card>
    );
  }

  const hw = advice.hardware;
  const gpuLabel =
    hw.gpu.type === "apple"
      ? `${hw.gpu.name ?? "Apple GPU"}${hw.gpu.cores ? ` · ${hw.gpu.cores} cores` : ""} (unified)`
      : hw.gpu.type === "nvidia"
        ? `${hw.gpu.name ?? "NVIDIA"}${hw.gpu.vramGB ? ` · ${hw.gpu.vramGB}GB VRAM` : ""}`
        : "CPU only";

  const use = (name: string) =>
    start(async () => {
      await setChatModel(name);
      setActive(name);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="size-4" /> Model advisor
        </CardTitle>
        <CardDescription>
          Recommended local models for this machine, ranked for agent/tool-use workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{hw.totalRamGB}GB RAM</Badge>
          <Badge variant="outline">{gpuLabel}</Badge>
          <Badge variant="outline">~{hw.modelBudgetGB}GB model budget</Badge>
          <Badge variant={hw.ollama.reachable ? "success" : "destructive"}>
            Ollama {hw.ollama.reachable ? "reachable" : "offline"}
          </Badge>
        </div>

        <div className="space-y-2">
          {advice.recommendations.map((m) => (
            <div
              key={m.name}
              className={`flex items-center gap-3 rounded-md border p-3 ${m.recommended ? "border-success/40 bg-success/5" : "border-border"} ${!m.fits ? "opacity-60" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm">{m.name}</span>
                  <span className="text-xs text-muted-foreground">~{m.approxGB}GB</span>
                  {m.recommended && <Badge variant="success">recommended</Badge>}
                  {m.agentic && <Badge variant="outline">agentic</Badge>}
                  {m.multimodal && <Badge variant="outline">multimodal</Badge>}
                  {!m.fits && <Badge variant="destructive">too large</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{m.note}</div>
              </div>
              {(() => {
                const pull_ = pulls[m.name];
                const installed = m.installed || pull_?.status === "done";
                if (pull_ && pull_.status !== "done" && !pull_.status.startsWith("error")) {
                  return (
                    <div className="w-40 shrink-0">
                      <div className="h-1.5 w-full overflow-hidden rounded bg-secondary">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pull_.pct}%` }} />
                      </div>
                      <div className="mt-1 truncate text-[10px] text-muted-foreground">{pull_.status} {pull_.pct}%</div>
                    </div>
                  );
                }
                if (installed) {
                  return (
                    <Button size="sm" variant={active === m.name ? "secondary" : "outline"} disabled={pending} onClick={() => use(m.name)}>
                      {active === m.name ? "✓ chat model" : "Use"}
                    </Button>
                  );
                }
                return (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button size="sm" disabled={!m.fits || !advice.hardware.ollama.reachable} onClick={() => pull(m.name)}>Pull</Button>
                    {pull_?.status.startsWith("error") && <span className="text-[10px] text-destructive">{pull_.status}</span>}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          &quot;Use&quot; sets it as the chat model. Not-installed models show the pull command. The
          embedding model is set separately below.
        </p>
      </CardContent>
    </Card>
  );
}
