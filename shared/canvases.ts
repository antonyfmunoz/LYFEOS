import { z } from "zod";

export const canvasNodeIdPattern = /^[A-Za-z0-9_-]{1,64}$/;

export const canvasNodeTypeSchema = z.enum(["note", "heading", "task", "link"]);
export const canvasNodeColorSchema = z.enum(["slate", "cyan", "violet", "amber", "rose", "emerald"]);

export const canvasNodeSchema = z.object({
  id: z.string().regex(canvasNodeIdPattern),
  type: canvasNodeTypeSchema,
  x: z.number().int().min(0).max(10_000),
  y: z.number().int().min(0).max(10_000),
  width: z.number().int().min(160).max(640),
  height: z.number().int().min(80).max(480),
  title: z.string().trim().max(160),
  body: z.string().max(10_000),
  color: canvasNodeColorSchema,
  completed: z.boolean(),
  url: z.string().trim().max(2_000).nullable(),
}).strict().superRefine((node, ctx) => {
  if (node.type === "link" && node.url) {
    try {
      const url = new URL(node.url);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["url"], message: "Links must use a valid http or https URL." });
    }
  }
});

export const canvasEdgeSchema = z.object({
  id: z.string().regex(canvasNodeIdPattern),
  sourceId: z.string().regex(canvasNodeIdPattern),
  targetId: z.string().regex(canvasNodeIdPattern),
  label: z.string().trim().max(120),
  style: z.enum(["solid", "dashed"]),
}).strict();

export const canvasViewportSchema = z.object({
  x: z.number().int().min(-10_000).max(10_000),
  y: z.number().int().min(-10_000).max(10_000),
  zoom: z.number().min(0.25).max(3),
}).strict();

export const canvasDocumentSchema = z.object({
  version: z.literal(1),
  nodes: z.array(canvasNodeSchema).max(300),
  edges: z.array(canvasEdgeSchema).max(500),
  viewport: canvasViewportSchema,
}).strict().superRefine((document, ctx) => {
  const nodeIds = document.nodes.map((node) => node.id);
  const edgeIds = document.edges.map((edge) => edge.id);
  const nodeIdSet = new Set(nodeIds);

  if (nodeIdSet.size !== nodeIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["nodes"], message: "Canvas node IDs must be unique." });
  }
  if (new Set(edgeIds).size !== edgeIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges"], message: "Canvas edge IDs must be unique." });
  }
  document.edges.forEach((edge, index) => {
    if (edge.sourceId === edge.targetId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index], message: "A canvas node cannot connect to itself." });
    }
    if (!nodeIdSet.has(edge.sourceId) || !nodeIdSet.has(edge.targetId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["edges", index], message: "Every canvas connection must reference existing nodes." });
    }
  });
});

const canvasMetadataFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(800).nullable().optional(),
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/).default("general"),
  favorite: z.boolean().default(false),
};

export const createCanvasRequestSchema = z.object({
  ...canvasMetadataFields,
  content: canvasDocumentSchema,
}).strict();

export const updateCanvasRequestSchema = z.object({
  title: canvasMetadataFields.title.optional(),
  description: canvasMetadataFields.description,
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/).optional(),
  favorite: z.boolean().optional(),
  content: canvasDocumentSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide at least one canvas field to update.");

export const canvasRevisionSnapshotSchema = z.object({
  title: canvasMetadataFields.title,
  description: z.string().trim().max(800).nullable(),
  category: z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9 _-]+$/),
  content: canvasDocumentSchema,
}).strict();

export type CanvasDocument = z.infer<typeof canvasDocumentSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasNodeType = z.infer<typeof canvasNodeTypeSchema>;

export function createCanvasId(prefix: "node" | "edge"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 12)}`;
}

export function createEmptyCanvasDocument(): CanvasDocument {
  return {
    version: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function parseCanvasDocument(value: unknown): CanvasDocument | null {
  const parsed = canvasDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
