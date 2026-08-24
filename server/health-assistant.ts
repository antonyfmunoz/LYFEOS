import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

export type HealthAssistantBoundary = { kind: "emergency" | "clinical"; message: string } | null;

export function healthAssistantBoundary(question: string): HealthAssistantBoundary {
  const normalized = question.toLocaleLowerCase();
  if (/\b(chest pain|cannot breathe|can't breathe|severe bleeding|overdose|suicid(?:e|al)|stroke symptoms|unconscious)\b/.test(normalized)) return {
    kind: "emergency",
    message: "LyfeOS cannot assess an emergency. Contact local emergency services or an appropriate crisis service now; do not wait for an app response.",
  };
  if (/\b(diagnos(?:e|is)|prescrib(?:e|ing)|what (?:disease|condition) do i have|should i (?:take|stop taking)|what dose|dosage|treat(?:ment)? for|cure for|interpret my blood(?:work| test))\b/.test(normalized)) return {
    kind: "clinical",
    message: "LyfeOS can summarize the records you select, but it cannot diagnose, prescribe, choose a dose, interpret laboratory results clinically, or recommend treatment. Ask a qualified clinician for that decision.",
  };
  return null;
}

const healthAssistantOutput = z.object({
  summary: z.string().trim().min(1).max(1800),
  observations: z.array(z.object({ text: z.string().trim().min(1).max(500), citations: z.array(z.string().regex(/^S[1-4]$/)).min(1).max(4) })).max(4),
  proposedReflection: z.object({
    title: z.string().trim().min(3).max(180),
    reflection: z.string().trim().min(3).max(2000),
    domains: z.array(z.enum(["nutrition", "training", "recovery", "sleep", "hydration", "body", "metrics", "planning"])).min(1).max(8),
    nextExperiment: z.string().trim().max(500).nullable(),
  }).nullable(),
});
export type HealthAssistantOutput = z.infer<typeof healthAssistantOutput>;

export async function generateHealthAssistance(input: {
  question: string;
  sources: Array<{ id: string; label: string; unit: string; points: Array<{ date: string; value: number; records: number }> }>;
  proposeReflection: boolean;
}): Promise<{ output: HealthAssistantOutput; provider: string; model: string }> {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("HEALTH_AI_PROVIDER_UNAVAILABLE");
  const model = process.env.HEALTH_AI_MODEL || "claude-haiku-4-5";
  const anthropic = new Anthropic({ apiKey, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
  const sourceText = input.sources.map((source, index) => `[S${index + 1}] ${source.label} (${source.unit})\n${source.points.map((point) => `${point.date}: ${point.value} (${point.records} record${point.records === 1 ? "" : "s"})`).join("\n") || "No recorded daily values in the selected period."}`).join("\n\n");
  const response = await anthropic.messages.create({
    model, max_tokens: 1100,
    system: `You are the optional LyfeOS health-record assistant. Use only the supplied, user-selected factual daily records. Never diagnose, prescribe, recommend a dose or treatment, interpret a laboratory range clinically, infer missing values, claim causation, readiness, health status, competence, or progress, or rely on general medical knowledge. Clearly distinguish record presence from meaning. Each observation must cite one or more supplied source IDs. A proposed reflection is an editable user review draft, never a medical action or factual health conclusion. ${input.proposeReflection ? "Return a neutral reflection draft if the records support one." : "Return proposedReflection as null."}`,
    messages: [{ role: "user", content: `User question: ${input.question}\n\nSelected private records:\n${sourceText}` }],
    tools: [{
      name: "return_health_record_assistance",
      description: "Return a bounded explanation with source citations and an optional neutral reflection draft.",
      input_schema: {
        type: "object", additionalProperties: false,
        properties: {
          summary: { type: "string" },
          observations: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, properties: { text: { type: "string" }, citations: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", enum: ["S1", "S2", "S3", "S4"] } } }, required: ["text", "citations"] } },
          proposedReflection: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false, properties: { title: { type: "string" }, reflection: { type: "string" }, domains: { type: "array", minItems: 1, maxItems: 8, items: { type: "string", enum: ["nutrition", "training", "recovery", "sleep", "hydration", "body", "metrics", "planning"] } }, nextExperiment: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: ["title", "reflection", "domains", "nextExperiment"] }] },
        },
        required: ["summary", "observations", "proposedReflection"],
      },
    }],
    tool_choice: { type: "tool", name: "return_health_record_assistance" },
  });
  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === "return_health_record_assistance");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("HEALTH_AI_INVALID_OUTPUT");
  const output = healthAssistantOutput.parse(toolUse.input);
  const allowedCitations = new Set(input.sources.map((_, index) => `S${index + 1}`));
  if (output.observations.some((observation) => observation.citations.some((citation) => !allowedCitations.has(citation)))) throw new Error("HEALTH_AI_INVALID_CITATION");
  if (!input.proposeReflection) output.proposedReflection = null;
  return { output, provider: "anthropic", model };
}
