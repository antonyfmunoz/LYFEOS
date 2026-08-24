import { z } from "zod";
import type { Quest } from "./schema";

export const automationTriggerTypes = ["mission_created", "mission_completed", "manual"] as const;
export const automationTriggerSchema = z.enum(automationTriggerTypes);

const automationConditionsSchema = z.object({
  titleContains: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
}).strict();

const setMissionCategoryActionSchema = z.object({
  type: z.literal("set_mission_category"),
  category: z.string().trim().min(1).max(80),
}).strict();

const scheduleFollowUpActionSchema = z.object({
  type: z.literal("schedule_follow_up"),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1_000).default(""),
  category: z.string().trim().min(1).max(80).default("general"),
  delayDays: z.number().int().min(0).max(365),
}).strict();

export const automationActionSchema = z.discriminatedUnion("type", [
  setMissionCategoryActionSchema,
  scheduleFollowUpActionSchema,
]);

export const automationDefinitionSchema = z.object({
  version: z.literal(1),
  trigger: z.object({ type: automationTriggerSchema }).strict(),
  conditions: automationConditionsSchema.default({}),
  actions: z.array(automationActionSchema).min(1).max(3),
  stopOnError: z.boolean().default(true),
}).strict();

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(800).nullable().default(null),
  definition: automationDefinitionSchema,
}).strict();

export const updateAutomationSchema = createAutomationSchema.partial().extend({
  enabled: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "At least one field is required.");

export type AutomationTriggerType = z.infer<typeof automationTriggerSchema>;
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationDefinition = z.infer<typeof automationDefinitionSchema>;

export type AutomationMissionContext = Pick<Quest, "id" | "title" | "category" | "completed" | "completedAt">;

export function automationMatchesMission(definition: AutomationDefinition, quest: AutomationMissionContext): boolean {
  const titleNeedle = definition.conditions.titleContains?.trim().toLocaleLowerCase();
  if (titleNeedle && !quest.title.toLocaleLowerCase().includes(titleNeedle)) return false;
  const category = definition.conditions.category?.trim().toLocaleLowerCase();
  if (category && (quest.category || "general").toLocaleLowerCase() !== category) return false;
  return true;
}

export function describeAutomationAction(action: AutomationAction, quest: AutomationMissionContext): string {
  if (action.type === "set_mission_category") return `Set “${quest.title}” category to “${action.category}”.`;
  const timing = action.delayDays === 0 ? "today" : `in ${action.delayDays} day${action.delayDays === 1 ? "" : "s"}`;
  return `Create follow-up “${action.title}” due ${timing}.`;
}

export function previewAutomation(definition: AutomationDefinition, quest: AutomationMissionContext) {
  const matched = automationMatchesMission(definition, quest);
  return {
    matched,
    actions: matched ? definition.actions.map((action) => ({ type: action.type, description: describeAutomationAction(action, quest) })) : [],
    disclosure: matched
      ? "Preview only. No mission was changed and no follow-up was created."
      : "This mission does not match the automation conditions. No action would run.",
  };
}

export const defaultAutomationDefinition: AutomationDefinition = {
  version: 1,
  trigger: { type: "manual" },
  conditions: {},
  actions: [{ type: "schedule_follow_up", title: "Follow up", description: "", category: "general", delayDays: 1 }],
  stopOnError: true,
};
