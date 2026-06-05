import type { Persona } from "../settings.js";

export const STRUCTURED_SECTIONS = ["## Strengths", "## Weaknesses", "## Actionable revisions", "## Verdict"] as const;

const DEPTH_HINT: Record<Persona["depth"], string> = {
  brief: "Be concise — a few bullet points per section.",
  standard: "Give a normal-length review.",
  detailed: "Be thorough and specific, citing parts of the artifact.",
};

/** Build the system prompt that gives the model its persona and output contract. */
export function buildSystemPrompt(persona: Persona): string {
  const lines = [
    `You are acting as: ${persona.name} (${persona.archetype}).`,
    `Persona / stance: ${persona.stance}`,
    `Your review focus & rubric: ${persona.rubric}`,
    `Tone: ${persona.tone}. ${DEPTH_HINT[persona.depth]}`,
    `You are reviewing the user's artifact (a draft, assignment, or chapter). Address the author directly.`,
    `Do not invent facts. If you reference outside sources, only use the provided context passages.`,
  ];
  if (persona.outputFormat === "structured") {
    lines.push(
      `Respond in Markdown with EXACTLY these section headings, in order:`,
      STRUCTURED_SECTIONS.join("\n"),
      `Under "## Verdict", give a one-line overall judgment (and a grade if a rubric grade is requested).`,
    );
  } else {
    lines.push(`Respond in clear Markdown prose. Use headings/bullets where helpful.`);
  }
  return lines.join("\n");
}

/** Build the user message: artifact + optional grounding context + prior outputs. */
export function buildUserPrompt(input: {
  artifactTitle: string;
  artifactText: string;
  context?: string;
  priorOutputs?: { name: string; body: string }[];
}): string {
  const parts = [`ARTIFACT TITLE: ${input.artifactTitle}`, ``, `ARTIFACT:`, input.artifactText];
  if (input.context) parts.push(``, `REFERENCE PASSAGES (for grounding; cite as needed):`, input.context);
  if (input.priorOutputs?.length) {
    parts.push(``, `EARLIER REVIEWS IN THIS WORKFLOW (respond to them where relevant):`);
    for (const p of input.priorOutputs) parts.push(`--- ${p.name} ---`, p.body);
  }
  return parts.join("\n");
}
