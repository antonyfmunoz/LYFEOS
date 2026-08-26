import { z } from "zod";
import type { Quest } from "./schema";

export const automationTriggerTypes = ["mission_created", "mission_completed", "manual", "schedule"] as const;
export const automationTriggerSchema = z.enum(automationTriggerTypes);

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timeZoneSchema = z.string().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}, "Choose a valid IANA time zone.");

export const automationScheduleTriggerSchema = z.object({
  type: z.literal("schedule"),
  questId: z.number().int().positive(),
  timeZone: timeZoneSchema,
  localTime: clockTimeSchema,
  cadence: z.enum(["daily", "weekly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema.nullable().default(null),
  maxOccurrences: z.number().int().min(1).max(365),
  missedRunPolicy: z.enum(["skip", "run_once"]),
}).strict().superRefine((input, context) => {
  if (input.cadence === "weekly" && input.weekdays.length === 0) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose at least one weekday for a weekly schedule." });
  if (new Set(input.weekdays).size !== input.weekdays.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose each weekday only once." });
  if (input.endDate && input.endDate < input.startDate) context.addIssue({ code: z.ZodIssueCode.custom, message: "The schedule end date cannot be before its start date." });
});

const automationTriggerDefinitionSchema = z.union([
  z.object({ type: z.enum(["mission_created", "mission_completed", "manual"]) }).strict(),
  automationScheduleTriggerSchema,
]);

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
  version: z.union([z.literal(1), z.literal(2)]),
  trigger: automationTriggerDefinitionSchema,
  conditions: automationConditionsSchema.default({}),
  actions: z.array(automationActionSchema).min(1).max(3),
  stopOnError: z.boolean().default(true),
}).strict().superRefine((input, context) => {
  if (input.trigger.type === "schedule" && input.version !== 2) context.addIssue({ code: z.ZodIssueCode.custom, message: "Scheduled automations require definition version 2." });
});

export const createAutomationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(800).nullable().default(null),
  definition: automationDefinitionSchema,
}).strict();

export const updateAutomationSchema = createAutomationSchema.partial().extend({
  enabled: z.boolean().optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "At least one field is required.");

export const automationRunRequestSchema = z.object({
  questId: z.number().int().positive(),
  mutationId: z.string().uuid(),
}).strict();

export type AutomationTriggerType = z.infer<typeof automationTriggerSchema>;
export type AutomationScheduleTrigger = z.infer<typeof automationScheduleTriggerSchema>;
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
