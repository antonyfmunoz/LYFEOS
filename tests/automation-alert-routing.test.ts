import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("workflow automation operational alert boundary", () => {
  it("emits a content-free Sentry event only at the repeated-failure pause threshold", () => {
    const source = readFileSync(resolve(process.cwd(), "server/automation-engine.ts"), "utf8");
    const alertBlock = source.slice(source.indexOf("// Emit once"), source.indexOf("\n}\n\nasync function executeRunActions"));
    expect(alertBlock).toContain("failureState?.consecutiveFailures === FAILURE_PAUSE_THRESHOLD");
    expect(alertBlock).toContain('failureState.pauseReason === "REPEATED_ACTION_FAILURE"');
    expect(alertBlock).toContain('Sentry.captureMessage("Workflow automation paused after repeated action failures"');
    expect(alertBlock).toContain('tags: { subsystem: "workflow_automation", pause_reason: "REPEATED_ACTION_FAILURE" }');
    expect(alertBlock).not.toContain("userId");
    expect(alertBlock).not.toContain("automationName");
  });
});
