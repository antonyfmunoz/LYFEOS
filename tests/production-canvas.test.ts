import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("production Canvas evidence custody", () => {
  const acceptance = source("scripts/production-canvas-browser-acceptance.ts");
  const workflow = source(".github/workflows/production-browser-acceptance.yml");
  const packageJson = source("package.json");
  const catalog = source("client/src/pages/CanvasesPage.tsx");
  const editor = source("client/src/pages/CanvasEditorPage.tsx");

  it("binds the production-only contract to immutable runtime and harness sources", () => {
    expect(acceptance).toContain('contract: "lyfeos.production-canvas-browser.v1"');
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain("release.body?.sourceRevision === SOURCE");
    expect(acceptance).toContain("HARNESS_SOURCE");
  });

  it("qualifies desktop/mobile templates, editing, local import, concurrency, history, isolation and cleanup", () => {
    expect(acceptance).toContain('name: "desktop-1440x900"');
    expect(acceptance).toContain('name: "mobile-390x844"');
    expect(acceptance).toContain("governedTemplateReviewed");
    expect(acceptance).toContain("nodeAndConnectionEditingReconciled");
    expect(acceptance).toContain("localImportReviewedAndPersisted");
    expect(acceptance).toContain("staleSaveStoppedAsConflict");
    expect(acceptance).toContain("maximumDocumentRendered");
    expect(acceptance).toContain("restoreCreatedNewImmutableRevision");
    expect(acceptance).toContain("crossOwnerIsolationReconciled");
    expect(acceptance).toContain("otherAccountErased");
    expect(acceptance).toContain("registerDisposableAccount");
    expect(acceptance).toContain('response.headers.get("retry-after")');
    expect(acceptance).toContain("Object.assign(account");
    expect(acceptance).toContain("human assistive-technology comprehension");
    expect(acceptance).toContain("physical-device pointer");
  });

  it("uses stable nonvisual hooks and protected evidence custody", () => {
    expect(catalog).toContain('data-testid="canvas-page"');
    expect(catalog).toContain('data-testid="canvas-new"');
    expect(catalog).toContain("canvas-card-${canvas.id}");
    expect(editor).toContain('data-testid="canvas-editor"');
    expect(editor).toContain('data-testid="canvas-workspace"');
    expect(editor).toContain('data-testid="canvas-history"');
    expect(packageJson).toContain('"acceptance:production-canvas"');
    expect(workflow).toContain("npm run acceptance:production-canvas");
    expect(workflow).toContain("LYFEOS_CANVAS_OUTPUT_DIR");
  });
});
