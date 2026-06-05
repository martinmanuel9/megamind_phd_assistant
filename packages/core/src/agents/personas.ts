import type { AgentsSettings, Persona, Workflow } from "../settings.js";
import { loadSettings, updateSettings } from "../settings.js";
import { BUILTIN_PERSONAS, BUILTIN_WORKFLOWS } from "./templates.js";

/** Install built-in personas/workflows once. Pure: returns the next AgentsSettings. */
export function seedAgents(agents: AgentsSettings): AgentsSettings {
  if (agents.seeded) return agents;
  const haveP = new Set(agents.personas.map((p) => p.id));
  const haveW = new Set(agents.workflows.map((w) => w.id));
  return {
    ...agents,
    personas: [...agents.personas, ...BUILTIN_PERSONAS.filter((p) => !haveP.has(p.id))],
    workflows: [...agents.workflows, ...BUILTIN_WORKFLOWS.filter((w) => !haveW.has(w.id))],
    seeded: true,
  };
}

/** Load agents from settings, seeding templates on first access (persists). */
export function loadAgents(): AgentsSettings {
  const s = loadSettings();
  if (!s.agents.seeded) {
    const seeded = seedAgents(s.agents);
    updateSettings({ agents: seeded });
    return seeded;
  }
  return s.agents;
}

export function listPersonas(): Persona[] { return loadAgents().personas; }
export function listWorkflows(): Workflow[] { return loadAgents().workflows; }

export function getPersona(id: string): Persona | undefined {
  return loadAgents().personas.find((p) => p.id === id);
}
export function getWorkflow(id: string): Workflow | undefined {
  return loadAgents().workflows.find((w) => w.id === id);
}

export function savePersona(p: Persona): Persona {
  const agents = loadAgents();
  const idx = agents.personas.findIndex((x) => x.id === p.id);
  const personas = [...agents.personas];
  if (idx >= 0) personas[idx] = p; else personas.push(p);
  updateSettings({ agents: { ...agents, personas } });
  return p;
}

export function deletePersona(id: string): void {
  const agents = loadAgents();
  updateSettings({ agents: { ...agents, personas: agents.personas.filter((p) => p.id !== id) } });
}

export function saveWorkflow(w: Workflow): Workflow {
  const agents = loadAgents();
  const idx = agents.workflows.findIndex((x) => x.id === w.id);
  const workflows = [...agents.workflows];
  if (idx >= 0) workflows[idx] = w; else workflows.push(w);
  updateSettings({ agents: { ...agents, workflows } });
  return w;
}

export function deleteWorkflow(id: string): void {
  const agents = loadAgents();
  updateSettings({ agents: { ...agents, workflows: agents.workflows.filter((w) => w.id !== id) } });
}

/** Generate a unique non-builtin id from a name. */
export function newAgentId(prefix: string, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  return `${prefix}-${base}-${Math.abs(hashStr(name + prefix)).toString(36).slice(0, 6)}`;
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
