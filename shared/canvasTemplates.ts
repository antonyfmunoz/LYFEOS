import { z } from "zod";
import { canvasDocumentSchema, type CanvasDocument } from "./canvases";

export const canvasTemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,48}$/),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  category: z.enum(["planning", "decision", "reflection"]),
  document: canvasDocumentSchema,
}).strict();

export type CanvasTemplate = z.infer<typeof canvasTemplateSchema>;

export const builtInCanvasTemplates: readonly CanvasTemplate[] = canvasTemplateSchema.array().parse([
  {
    id: "project-map",
    name: "Project map",
    description: "Map one outcome into constraints, milestones, and immediate actions.",
    category: "planning",
    document: {
      version: 1,
      viewport: { x: 80, y: 80, zoom: 1 },
      nodes: [
        { id: "project_outcome", type: "heading", x: 360, y: 40, width: 320, height: 90, title: "Outcome", body: "Define the observable result.", color: "cyan", completed: false, url: null },
        { id: "project_constraints", type: "note", x: 40, y: 220, width: 240, height: 160, title: "Constraints", body: "Time, resources, dependencies, and boundaries.", color: "amber", completed: false, url: null },
        { id: "project_milestones", type: "note", x: 400, y: 220, width: 240, height: 160, title: "Milestones", body: "Sequence the major proof points.", color: "violet", completed: false, url: null },
        { id: "project_actions", type: "task", x: 760, y: 220, width: 240, height: 160, title: "Next actions", body: "List the smallest executable steps.", color: "emerald", completed: false, url: null },
      ],
      edges: [
        { id: "project_edge_constraints", sourceId: "project_constraints", targetId: "project_outcome", label: "bounds", style: "dashed" },
        { id: "project_edge_milestones", sourceId: "project_outcome", targetId: "project_milestones", label: "requires", style: "solid" },
        { id: "project_edge_actions", sourceId: "project_milestones", targetId: "project_actions", label: "unlocks", style: "solid" },
      ],
    },
  },
  {
    id: "decision-map",
    name: "Decision map",
    description: "Compare two options against explicit criteria, evidence, and tradeoffs.",
    category: "decision",
    document: {
      version: 1,
      viewport: { x: 80, y: 80, zoom: 1 },
      nodes: [
        { id: "decision_question", type: "heading", x: 360, y: 30, width: 320, height: 90, title: "Decision", body: "State the choice and decision date.", color: "cyan", completed: false, url: null },
        { id: "decision_criteria", type: "note", x: 400, y: 180, width: 240, height: 150, title: "Criteria", body: "Define what matters before comparing options.", color: "amber", completed: false, url: null },
        { id: "decision_option_a", type: "note", x: 80, y: 400, width: 260, height: 170, title: "Option A", body: "Evidence, advantages, costs, and uncertainty.", color: "violet", completed: false, url: null },
        { id: "decision_option_b", type: "note", x: 700, y: 400, width: 260, height: 170, title: "Option B", body: "Evidence, advantages, costs, and uncertainty.", color: "rose", completed: false, url: null },
        { id: "decision_action", type: "task", x: 400, y: 650, width: 240, height: 140, title: "Decision and next step", body: "Record the choice and first reversible action.", color: "emerald", completed: false, url: null },
      ],
      edges: [
        { id: "decision_edge_criteria", sourceId: "decision_question", targetId: "decision_criteria", label: "evaluated by", style: "solid" },
        { id: "decision_edge_a", sourceId: "decision_criteria", targetId: "decision_option_a", label: "compare", style: "dashed" },
        { id: "decision_edge_b", sourceId: "decision_criteria", targetId: "decision_option_b", label: "compare", style: "dashed" },
        { id: "decision_edge_action", sourceId: "decision_question", targetId: "decision_action", label: "commit", style: "solid" },
      ],
    },
  },
  {
    id: "reflection-loop",
    name: "Reflection loop",
    description: "Turn present evidence into a desired change and one testable next experiment.",
    category: "reflection",
    document: {
      version: 1,
      viewport: { x: 80, y: 100, zoom: 1 },
      nodes: [
        { id: "reflection_current", type: "note", x: 40, y: 220, width: 240, height: 160, title: "Current state", body: "Describe what is happening without interpretation.", color: "slate", completed: false, url: null },
        { id: "reflection_evidence", type: "note", x: 360, y: 40, width: 240, height: 160, title: "Evidence", body: "Record observations that support or challenge the story.", color: "cyan", completed: false, url: null },
        { id: "reflection_desired", type: "note", x: 680, y: 220, width: 240, height: 160, title: "Desired change", body: "Define the difference you want to observe.", color: "violet", completed: false, url: null },
        { id: "reflection_experiment", type: "task", x: 360, y: 460, width: 240, height: 160, title: "Next experiment", body: "Choose one bounded action and the evidence you will review.", color: "emerald", completed: false, url: null },
      ],
      edges: [
        { id: "reflection_edge_observe", sourceId: "reflection_current", targetId: "reflection_evidence", label: "observe", style: "solid" },
        { id: "reflection_edge_compare", sourceId: "reflection_evidence", targetId: "reflection_desired", label: "compare", style: "solid" },
        { id: "reflection_edge_test", sourceId: "reflection_desired", targetId: "reflection_experiment", label: "test", style: "solid" },
        { id: "reflection_edge_review", sourceId: "reflection_experiment", targetId: "reflection_current", label: "review", style: "dashed" },
      ],
    },
  },
]);

export function createCanvasDocumentFromTemplate(templateId: string): CanvasDocument {
  const template = builtInCanvasTemplates.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error("Choose a supported Canvas template.");
  return canvasDocumentSchema.parse(template.document);
}
