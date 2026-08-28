import { z } from "zod";

export type AIActionRisk = "read" | "low" | "medium" | "high" | "prohibited";
export type AIActionPolicy = {
  risk: AIActionRisk;
  approvalRequired: boolean;
  externalEffect: "none" | "network_read" | "external_send";
  repair: "none" | "mission_state" | "created_missions" | "profile_fields" | "daily_log" | "vision_goal";
};

const readOnly = (externalEffect: AIActionPolicy["externalEffect"] = "none"): AIActionPolicy => ({ risk: "read", approvalRequired: false, externalEffect, repair: "none" });
const local = (repair: AIActionPolicy["repair"] = "none"): AIActionPolicy => ({ risk: "low", approvalRequired: false, externalEffect: "none", repair });
const consequential = (repair: AIActionPolicy["repair"]): AIActionPolicy => ({ risk: "medium", approvalRequired: true, externalEffect: "none", repair });

// Exhaustive allow-list. Unknown tools and any external-send capability fail
// closed. Adding a tool therefore requires an explicit product policy review.
export const AI_ACTION_POLICIES: Readonly<Record<string, AIActionPolicy>> = Object.freeze({
  terminate_mission: consequential("mission_state"),
  complete_mission: consequential("mission_state"),
  create_mission: local("created_missions"),
  update_mission: consequential("mission_state"),
  restore_mission: consequential("mission_state"),
  search_missions: readOnly(),
  update_profile: consequential("profile_fields"),
  create_calendar_event: consequential("created_missions"),
  toggle_widget: local(),
  navigate_to_page: local(),
  play_affirmation: local(),
  generate_affirmation: consequential("profile_fields"),
  update_daily_log: consequential("daily_log"),
  archive_research_entry: consequential("daily_log"),
  toggle_theme: local("profile_fields"),
  start_mission_timer: local(),
  pause_timer: local(),
  resume_timer: local(),
  end_timer: local(),
  stop_affirmation: local(),
  web_search: readOnly("network_read"),
  read_webpage: readOnly("network_read"),
  create_vision_goal: consequential("vision_goal"),
  batch_create_missions: consequential("created_missions"),
  uncomplete_mission: consequential("mission_state"),
  lookup_knowledge_base: readOnly(),
  suggest_reflection_prompts: consequential("profile_fields"),
});

export function resolveAIActionPolicy(toolName: string): AIActionPolicy {
  return AI_ACTION_POLICIES[toolName] ?? { risk: "prohibited", approvalRequired: true, externalEffect: "external_send", repair: "none" };
}

export const assistantPersonaInput = z.object({
  name: z.string().trim().min(1).max(32),
  interactionStyle: z.object({
    tone: z.enum(["direct", "balanced", "encouraging"]).optional(),
    detail: z.enum(["concise", "adaptive", "detailed"]).optional(),
  }).strict().default({}),
  ecosystemSharingEnabled: z.boolean().default(false),
  allowedDestinations: z.array(z.enum(["umh", "entrepreneuros", "creatoros"])).max(3).default([]),
  expectedRevision: z.number().int().positive().optional(),
}).strict();

export type AssistantPersona = {
  id: string;
  name: string;
  interactionStyle: Record<string, unknown>;
  lyfeosPresentation: Record<string, unknown>;
  ecosystemSharingEnabled: boolean;
  allowedDestinations: string[];
  revision: number;
};

export function buildPortablePersonaProjection(persona: AssistantPersona, destination: string) {
  if (!persona.ecosystemSharingEnabled || !persona.allowedDestinations.includes(destination)) {
    throw new Error("Persona sharing is not authorized for this destination.");
  }
  return {
    schema: "umh.ai_persona.v1",
    personaId: persona.id,
    source: "lyfeos",
    destination,
    name: persona.name,
    interactionStyle: persona.interactionStyle,
    revision: persona.revision,
    purpose: "consistent_assistant_experience",
  } as const;
}

export const aiMemoryPolicyInput = z.object({
  chatHistoryDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]),
  contextReceiptDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
  actionReceiptDays: z.union([z.literal(90), z.literal(365), z.literal(1095)]),
  crossProductMemoryEnabled: z.boolean().default(false),
  allowedDestinations: z.array(z.enum(["umh", "entrepreneuros", "creatoros"])).max(3).default([]),
  expectedRevision: z.number().int().positive(),
}).strict();

export type AIContextSource = {
  key: string;
  label: string;
  category: "request" | "planning" | "identity" | "daily_state" | "conversation_history" | "knowledge" | "image";
  recordCount: number;
  origin: "user" | "lyfeos" | "knowledge_base";
};

export function buildAIContextSources(input: {
  planningEnabled: boolean;
  identityEnabled: boolean;
  dailyStateEnabled: boolean;
  conversationHistoryEnabled: boolean;
  missionCount: number;
  visionGoalCount: number;
  dailyLogCount: number;
  priorConversationMessageCount: number;
  knowledgeLayerNames: string[];
  imageCount: number;
}): AIContextSource[] {
  const sources: AIContextSource[] = [{ key: "current_request", label: "Current request", category: "request", recordCount: 1, origin: "user" }];
  if (input.planningEnabled) sources.push({ key: "planning", label: "Missions and vision goals", category: "planning", recordCount: input.missionCount + input.visionGoalCount, origin: "lyfeos" });
  if (input.identityEnabled) sources.push({ key: "identity_profile", label: "Identity profile", category: "identity", recordCount: 1, origin: "lyfeos" });
  if (input.dailyStateEnabled) sources.push({ key: "daily_state", label: "Recent daily state", category: "daily_state", recordCount: input.dailyLogCount, origin: "lyfeos" });
  if (input.conversationHistoryEnabled) sources.push({ key: "conversation_history", label: "Earlier AI conversations", category: "conversation_history", recordCount: input.priorConversationMessageCount, origin: "lyfeos" });
  for (const name of input.knowledgeLayerNames) sources.push({ key: `knowledge:${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, label: name, category: "knowledge", recordCount: 1, origin: "knowledge_base" });
  if (input.imageCount > 0) sources.push({ key: "images", label: "User-authorized images", category: "image", recordCount: input.imageCount, origin: "user" });
  return sources;
}
