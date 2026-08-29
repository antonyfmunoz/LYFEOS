import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canvasDocumentSchema,
  canvasRevisionSnapshotSchema,
  createCanvasRequestSchema,
  createEmptyCanvasDocument,
  updateCanvasRequestSchema,
} from "../shared/canvases";
import { builtInCanvasTemplates, canvasTemplateSchema, createCanvasDocumentFromTemplate } from "../shared/canvasTemplates";
import { fitCanvasViewport, panCanvasViewport, zoomCanvasViewport } from "../client/src/lib/canvasViewport";

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

  it("recognizes the static new-canvas route and exposes stable production acceptance seams", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    const catalog = source("client/src/pages/CanvasesPage.tsx");
    expect(editor).toContain('const [location, navigate] = useLocation()');
    expect(editor).toContain('location === "/canvases/new" || canvasId === "new"');
    expect(editor).toContain('data-testid="canvas-editor"');
    expect(editor).toContain('data-testid="canvas-save"');
    expect(editor).toContain('data-testid="canvas-workspace"');
    expect(editor).toContain('data-testid={`canvas-template-${template.id}`}');
    expect(editor).toContain('data-testid={`canvas-history-version-${revision.revisionNumber}`}');
    expect(catalog).toContain('data-testid="canvas-page"');
    expect(catalog).toContain('data-testid="canvas-new"');
    expect(catalog).toContain('data-testid={`canvas-card-${canvas.id}`}');
  });

  it("keeps zoom anchored, bounds panning, and fits node bounds deterministically", () => {
    expect(zoomCanvasViewport({ x: 0, y: 0, zoom: 1 }, 2, 400, 300)).toEqual({ x: -400, y: -300, zoom: 2 });
    expect(panCanvasViewport({ x: 9_990, y: -9_990, zoom: 1 }, 100, -100)).toEqual({ x: 10_000, y: -10_000, zoom: 1 });
    const nodes = [
      { id: "node_a", type: "note" as const, x: 100, y: 50, width: 200, height: 100, title: "A", body: "", color: "cyan" as const, completed: false, url: null },
      { id: "node_b", type: "note" as const, x: 500, y: 350, width: 200, height: 100, title: "B", body: "", color: "cyan" as const, completed: false, url: null },
    ];
    expect(fitCanvasViewport(nodes, 1_000, 600, 50)).toEqual({ x: 0, y: -12, zoom: 1.25 });
    expect(fitCanvasViewport([], 1_000, 600)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("persists immutable owner-scoped versions through both migration paths and data rights", () => {
    const migration = source("migrations/0107_canvas_revisions.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    const profile = source("server/routes/profile.ts");
    for (const contract of [migration, release, schema]) {
      expect(contract).toContain("canvas_revisions");
      expect(contract).toContain("revision_number");
      expect(contract).toContain("source_revision");
      expect(contract).toContain("canvas_revisions_canvas_revision_unique_idx");
    }
    expect(release).toContain('id: "0107_canvas_revisions"');
    expect(profile).toContain('"canvas_revisions", "canvases"');
    expect(canvasRevisionSnapshotSchema.safeParse({ title: "Map", description: null, category: "planning", content: createEmptyCanvasDocument() }).success).toBe(true);
  });

  it("serializes canvas saves and restores historical snapshots only as new versions", () => {
    const routes = source("server/routes/content.ts");
    expect(routes).toContain('req.header("x-lyfeos-expected-revision")');
    expect(routes).toContain("SELECT id FROM canvases");
    expect(routes).toContain("FOR UPDATE");
    expect(routes).toContain('action: "restored"');
    expect(routes).toContain("canvasRevisionSnapshotSchema.safeParse(source.snapshot)");
    expect(routes).toContain("currentRevision: outcome.currentRevision");
    expect(routes).toContain("revisionNumber: canvasRevisions.revisionNumber");
  });

  it("exposes immutable history and concurrency protection in the existing editor", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain('"x-lyfeos-expected-revision"');
    expect(editor).toContain("Saved version history");
    expect(editor).toContain("Saved versions are immutable");
    expect(editor).toContain("restoreRevision.mutate(revision.revisionNumber)");
    expect(editor).toContain("disabled={isCurrent || restoreRevision.isPending || dirty}");
  });

  it("bounds local undo and groups a drag gesture into one reversible document change", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain("undoStack.current.slice(-19)");
    expect(editor).toContain("const undoDocument");
    expect(editor).toContain("const redoDocument");
    expect(editor).toContain("snapshot: document, moved: false");
    expect(editor).toContain("if (drag?.moved)");
    expect(editor).toContain("each node drag, pan, zoom, fit, bulk action, or confirmed import stored as one reversible change");
  });

  it("reviews a bounded local JSON import before replacing the unsaved document", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain("file.size > 16 * 1024 * 1024");
    expect(editor).toContain("canvasDocumentSchema.safeParse(parsedJson)");
    expect(editor).toContain("Review JSON import");
    expect(editor).toContain("has not been uploaded or saved");
    expect(editor).toContain("Replace unsaved canvas");
    expect(editor).toContain("updateDocument(() => pendingImport.document)");
    expect(editor).toContain("persistence still requires Save");
  });

  it("persists functional viewport controls and moves multi-selected nodes as one group", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain("zoomCanvasViewport(current.viewport");
    expect(editor).toContain("fitCanvasViewport(current.nodes");
    expect(editor).toContain("panCanvasViewport");
    expect(editor).toContain("translate3d(${document.viewport.x}px, ${document.viewport.y}px, 0) scale(${document.viewport.zoom})");
    expect(editor).toContain("Shift-click nodes to extend or reduce the selection");
    expect(editor).toContain("selectedNodeIds.includes(node.id) ? selectedNodeIds");
    expect(editor).toContain("drag.origins[node.id]");
    expect(editor).toContain("Group inspector");
    expect(editor).toContain("Delete selected nodes");
    expect(editor).toContain("aria-pressed={selectedNodeIds.includes(node.id)}");
  });

  it("renders and edits directed, labeled connection semantics", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain('markerEnd="url(#canvas-arrow)"');
    expect(editor).toContain("{edge.label}</text>");
    expect(editor).toContain("const updateEdge");
    expect(editor).toContain("Relationship label");
    expect(editor).toContain("Directed solid");
    expect(editor).toContain("Directed dashed");
  });

  it("ships unique schema-governed templates and returns isolated documents", () => {
    expect(builtInCanvasTemplates.map((template) => template.id)).toEqual(["project-map", "decision-map", "reflection-loop"]);
    expect(new Set(builtInCanvasTemplates.map((template) => template.id)).size).toBe(builtInCanvasTemplates.length);
    for (const template of builtInCanvasTemplates) expect(canvasTemplateSchema.safeParse(template).success).toBe(true);

    const first = createCanvasDocumentFromTemplate("project-map");
    const second = createCanvasDocumentFromTemplate("project-map");
    first.nodes[0].title = "Changed locally";
    expect(second.nodes[0].title).toBe("Outcome");
    expect(() => createCanvasDocumentFromTemplate("unknown-template")).toThrow("Choose a supported Canvas template.");
  });

  it("reviews a template before one reversible unsaved replacement", () => {
    const editor = source("client/src/pages/CanvasEditorPage.tsx");
    expect(editor).toContain('aria-label="Canvas template library"');
    expect(editor).toContain("aria-pressed={pendingTemplateId === template.id}");
    expect(editor).toContain("Apply replaces the unsaved Canvas document");
    expect(editor).toContain("updateDocument(() => createCanvasDocumentFromTemplate(pendingTemplate.id))");
    expect(editor).toContain("only in the unsaved editor");
    expect(editor).toContain("still requires Save");
    expect(editor).toContain("unsaved, reversible Canvas change");
  });
});
