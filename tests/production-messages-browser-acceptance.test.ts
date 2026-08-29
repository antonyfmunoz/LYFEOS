import fs from "node:fs";
import { describe, expect, it } from "vitest";

const script = fs.readFileSync("scripts/messages-browser-acceptance.ts", "utf8");
const workflow = fs.readFileSync(".github/workflows/production-browser-acceptance.yml", "utf8");
const verifyWorkflow = fs.readFileSync(".github/workflows/verify.yml", "utf8");
const packageJson = fs.readFileSync("package.json", "utf8");

describe("production Messages browser acceptance custody", () => {
  it("pins production runtime and reviewed harness identity", () => {
    expect(script).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(script).toContain("LYFEOS_ACCEPTANCE_SOURCE");
    expect(script).toContain("LYFEOS_ACCEPTANCE_HARNESS_SOURCE");
    expect(script).toContain('release.body?.sourceRevision === SOURCE');
    expect(script).not.toContain("demo123456");
  });

  it("reuses the same two-account rendered lifecycle in isolated and production modes", () => {
    expect(script).toContain('"lyfeos.production-messages-browser.v1"');
    expect(script).toContain('"lyfeos.isolated-messages-browser.v1"');
    for (const invariant of [
      "readReceiptRendered",
      "reactionRendered",
      "replyRendered",
      "editRendered",
      "privateNoteOwnerOnly",
      "blockLifecycleRendered",
    ]) expect(script).toContain(invariant);
    expect(script).toContain("verified account/session/identifier erasure");
    expect(script).toContain("authorization for autonomous sending");
  });

  it("retains exact database residue checks only for isolated mode and provider-independent production cleanup", () => {
    expect(script).toContain('MODE === "isolated" ? new pg.Pool');
    expect(script).toContain("identifierErasure");
    expect(script).toContain("session?.status === 401");
    expect(script).toContain("email.body?.available === true");
    expect(script).toContain("displayName.body?.available === true");
  });

  it("runs inside the protected production chain while preserving isolated CI", () => {
    expect(packageJson).toContain('"acceptance:production-messages": "tsx scripts/messages-browser-acceptance.ts"');
    expect(workflow).toContain("Run disposable production Messages acceptance");
    expect(workflow).toContain("LYFEOS_MESSAGES_ACCEPTANCE_MODE: production");
    expect(workflow).toContain("run: npm run acceptance:production-messages");
    expect(verifyWorkflow).toContain("npm run acceptance:messages");
    expect(verifyWorkflow).toContain("Upload isolated Messages evidence");
  });
});
