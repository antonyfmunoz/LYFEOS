import { z } from "zod";
import { isCalendarDate } from "./calendar";

export const projectStates = ["planned", "active", "on_hold", "completed", "archived"] as const;
export const projectStateSchema = z.enum(projectStates);

const optionalDate = z.string().trim().nullable().refine((value) => value === null || isCalendarDate(value), "Use a valid YYYY-MM-DD date.");

const projectFieldsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1_500).nullable().default(null),
  outcome: z.string().trim().min(1).max(1_000),
  startDate: optionalDate.default(null),
  dueDate: optionalDate.default(null),
}).strict();

export const createProjectSchema = projectFieldsSchema.refine((value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate, { message: "Due date cannot be before start date.", path: ["dueDate"] });

export const updateProjectSchema = projectFieldsSchema.partial().extend({
  expectedRevision: z.number().int().min(1),
}).strict().refine((input) => Object.keys(input).some((key) => key !== "expectedRevision"), "At least one project field is required.");

export const transitionProjectSchema = z.object({
  state: projectStateSchema,
  expectedRevision: z.number().int().min(1),
}).strict();

export const projectMissionSchema = z.object({ missionId: z.number().int().positive(), expectedRevision: z.number().int().min(1) }).strict();

type ProjectState = z.infer<typeof projectStateSchema>;
const transitions: Record<ProjectState, readonly ProjectState[]> = {
  planned: ["active", "archived"],
  active: ["on_hold", "completed", "archived"],
  on_hold: ["active", "archived"],
  completed: ["active", "archived"],
  archived: ["planned"],
};

export function canTransitionProject(from: ProjectState, to: ProjectState): boolean {
  return from === to || transitions[from].includes(to);
}
