import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canvasDocumentSchema,
  createCanvasRequestSchema,
  createEmptyCanvasDocument,
  updateCanvasRequestSchema,
} from "../shared/canvases";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Canvas instrument", () => {
  it("accepts a bounded versioned visual document", () => {
    const document = createEmptyCanvasDocument();
    document.nodes = [
      { id: "node_a", type: "note", x: 20, y: 30, width: 220, height: 140, title: "Idea", body: "Evidence", color: "cyan", completed: false, url: null },
      { id: "node_b", type: "task", x: 320, y: 30, width: 220, height: 140, title: "Act", body: "", color: "emerald", completed: false, url: null },
    ];
    document.edges = [{ id: "edge_a", sourceId: "node_a", targetId: "node_b", label: "leads to", style: "solid" }];
    expect(canvasDocumentSchema.safeParse(document).success).toBe(true);
  });

  it("rejects duplicate nodes, dangling connections, self-connections, and unsafe links", () => {
    const duplicate = createEmptyCanvasDocument();
    const node = { id: "node_a", type: "link" as const, x: 0, y: 0, width: 220, height: 140, title: "Link", body: "", color: "violet" as const, completed: false, url: "javascript:alert(1)" };
    duplicate.nodes = [node, { ...node }];
    duplicate.edges = [{ id: "edge_a", sourceId: "node_a", targetId: "missing", label: "", style: "solid" }];
    expect(canvasDocumentSchema.safeParse(duplicate).success).toBe(false);

    const selfConnected = createEmptyCanvasDocument();
    selfConnected.nodes = [{ ...node, url: "https://lyfeos.net" }];
    selfConnected.edges = [{ id: "edge_a", sourceId: "node_a", targetId: "node_a", label: "", style: "dashed" }];
    expect(canvasDocumentSchema.safeParse(selfConnected).success).toBe(false);
  });

  it("uses strict create and update envelopes that reject caller-supplied ownership", () => {
    const content = createEmptyCanvasDocument();
    expect(createCanvasRequestSchema.safeParse({ title: "Map", content, userId: 999 }).success).toBe(false);
    expect(updateCanvasRequestSchema.safeParse({ userId: 999 }).success).toBe(false);
    expect(updateCanvasRequestSchema.safeParse({}).success).toBe(false);
    expect(updateCanvasRequestSchema.safeParse({ title: "Renamed" }).success).toBe(true);
  });

  it("validates route payloads before storage and binds new records to the session owner", () => {
    const routes = source("server/routes/content.ts");
    expect(routes).toContain("createCanvasRequestSchema.parse(req.body)");
    expect(routes).toContain("updateCanvasRequestSchema.parse(req.body)");
    expect(routes).toContain("userId: req.session.userId!");
    expect(routes).not.toContain("storage.updateCanvas(canvasId, req.body)");
  });

  it("makes Canvas discoverable through protected routes without adding another primary navigation destination", () => {
    const app = source("client/src/App.tsx");
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    expect(app).toContain('<Route path="/canvases/:canvasId">');
    expect(app).toContain('<Route path="/canvases">');
    expect(vault).toContain("navigate('/canvases')");
  });

  it("preserves unknown legacy content until the user explicitly converts it", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain("Legacy canvas preserved");
    expect(editor).toContain("legacyContent !== null");
    expect(editor).toContain("Start blank v1 canvas");
  });
});
