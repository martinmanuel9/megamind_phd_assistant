import { execFileSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { type Config } from "../config.js";

/**
 * Hardware detection + local-model recommendation. Designed to run on any
 * machine this software is installed on (macOS Apple Silicon / Intel, Linux with
 * NVIDIA, etc.) and recommend an Ollama chat model that (a) fits the available
 * memory and (b) is capable of agent/tool-use workflows.
 */

export interface GpuInfo {
  type: "apple" | "nvidia" | "amd" | "intel" | "cpu";
  name?: string;
  vramGB?: number;
  cores?: number;
}

export interface Hardware {
  platform: string;
  arch: string;
  cpu: string;
  cpuCores: number;
  totalRamGB: number;
  gpu: GpuInfo;
  /** Memory budget (GB) for model weights: unified RAM (minus headroom) or VRAM. */
  modelBudgetGB: number;
  ollama: { reachable: boolean; baseUrl: string; installed: string[] };
}

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"] }).toString();
}

function detectGpu(platform: string, arch: string): GpuInfo {
  // Apple Silicon: unified memory GPU.
  if (platform === "darwin" && arch === "arm64") {
    let cores: number | undefined;
    let name = "Apple GPU";
    try {
      const j = JSON.parse(sh("system_profiler", ["SPDisplaysDataType", "-json"]));
      const d = j.SPDisplaysDataType?.[0];
      name = d?.sppci_model ?? d?._name ?? name;
      const c = d?.sppci_cores ?? d?.spdisplays_cores;
      if (c) cores = Number(c);
    } catch { /* fall through */ }
    return { type: "apple", name, cores };
  }
  // Linux / discrete NVIDIA.
  try {
    const out = sh("nvidia-smi", ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"]);
    const [name, mib] = out.trim().split("\n")[0]!.split(",").map((s) => s.trim());
    return { type: "nvidia", name, vramGB: Math.round(Number(mib) / 1024) };
  } catch { /* no nvidia */ }
  return { type: "cpu" };
}

export function ollamaHost(config: Config): string {
  return config.models.baseUrl.replace(/\/v1\/?$/, "");
}

async function detectOllama(config: Config): Promise<Hardware["ollama"]> {
  const host = ollamaHost(config);
  try {
    const r = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(2000) });
    const d = (await r.json()) as { models?: { name: string }[] };
    return { reachable: true, baseUrl: config.models.baseUrl, installed: (d.models ?? []).map((m) => m.name) };
  } catch {
    return { reachable: false, baseUrl: config.models.baseUrl, installed: [] };
  }
}

export async function detectHardware(config: Config): Promise<Hardware> {
  const platform = process.platform;
  const arch = process.arch;
  const totalRamGB = Math.round(totalmem() / 1024 ** 3);
  const gpu = detectGpu(platform, arch);

  // Budget: discrete GPU → VRAM; Apple unified → RAM minus OS/app headroom;
  // CPU-only → ~60% of RAM (slow, but bounds the pick).
  let modelBudgetGB: number;
  if (gpu.type === "nvidia" && gpu.vramGB) modelBudgetGB = gpu.vramGB;
  else if (gpu.type === "apple") modelBudgetGB = Math.max(2, totalRamGB - 8);
  else modelBudgetGB = Math.max(2, Math.floor(totalRamGB * 0.6));

  const ollama = await detectOllama(config);
  return { platform, arch, cpu: cpus()[0]?.model ?? "unknown", cpuCores: cpus().length, totalRamGB, gpu, modelBudgetGB, ollama };
}

// --- Model catalog + recommendation -----------------------------------------

export interface ModelRec {
  name: string;
  approxGB: number;
  /** Strong tool-use / agent-workflow capability. */
  agentic: boolean;
  multimodal?: boolean;
  note: string;
  fits: boolean;
  installed: boolean;
  recommended: boolean;
}

// Approx Q4_K_M sizes. Ordered roughly small → large within families.
const CATALOG: Omit<ModelRec, "fits" | "installed" | "recommended">[] = [
  { name: "llama3.2:3b", approxGB: 2, agentic: false, note: "Tiny fallback for very constrained machines." },
  { name: "qwen2.5:7b", approxGB: 5, agentic: true, note: "Strong tool-use in a small footprint." },
  { name: "llama3.1:8b", approxGB: 5, agentic: true, note: "Solid general agent baseline." },
  { name: "gemma3:12b", approxGB: 8, agentic: false, multimodal: true, note: "Great synthesis + multimodal; 128k context." },
  { name: "qwen2.5:14b", approxGB: 9, agentic: true, note: "Best balance for local agent/tool-use workflows." },
  { name: "gpt-oss:20b", approxGB: 13, agentic: true, note: "Strong reasoning + agentic; needs ~16GB free." },
  { name: "gemma3:27b", approxGB: 17, agentic: false, multimodal: true, note: "High-quality synthesis; needs ~24GB+." },
  { name: "qwen2.5:32b", approxGB: 20, agentic: true, note: "Top local agentic quality; needs ~32GB+." },
  { name: "llama3.3:70b", approxGB: 43, agentic: true, note: "Frontier-class local; needs a big GPU / 64GB+." },
];

export interface HardwareAdvice {
  hardware: Hardware;
  recommendations: ModelRec[];
  /** The single best agent-capable model that fits. */
  bestForAgents?: string;
}

export async function getHardwareAdvice(config: Config): Promise<HardwareAdvice> {
  const hardware = await detectHardware(config);
  const installed = new Set(hardware.ollama.installed);
  const budget = hardware.modelBudgetGB;

  const isInstalled = (name: string): boolean => {
    if (installed.has(name) || installed.has(`${name}:latest`)) return true;
    // Treat a bare `:latest` of the same family as the catalog's default size
    // (e.g. installed `gpt-oss:latest` == catalog `gpt-oss:20b`).
    const base = name.split(":")[0]!;
    if (name === "gpt-oss:20b" && (installed.has("gpt-oss:latest") || installed.has("gpt-oss"))) return true;
    return [...installed].some((i) => i === base || i === `${base}:latest`) && !name.includes(":");
  };

  const recs: ModelRec[] = CATALOG.map((m) => ({
    ...m,
    fits: m.approxGB <= budget,
    installed: isInstalled(m.name),
    recommended: false,
  }));

  // Best agentic model that fits = the largest agentic one within budget.
  const agenticFits = recs.filter((m) => m.agentic && m.fits).sort((a, b) => b.approxGB - a.approxGB);
  const best = agenticFits[0];
  if (best) best.recommended = true;

  // Sort for display: recommended first, then fits, then by size desc.
  recs.sort((a, b) =>
    Number(b.recommended) - Number(a.recommended) ||
    Number(b.fits) - Number(a.fits) ||
    b.approxGB - a.approxGB,
  );

  return { hardware, recommendations: recs, bestForAgents: best?.name };
}
