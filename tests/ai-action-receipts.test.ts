import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("AI action receipts", () => {
  it("renders the persisted terminal states used by the action executor", () => {
    const activity = readSource("client/src/components/ai/AssistantActivity.tsx");
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    expect(chat).toContain('state: rejected ? "rejected" : "succeeded"');
    expect(activity).toContain('action.state === "succeeded"');
    expect(activity).toContain('action.state === "rejected"');
  });

  it("holds medium-risk assistant actions for an explicit user decision", () => {
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    const activity = readSource("client/src/components/ai/AssistantActivity.tsx");
    expect(chat).toContain("if (policy.approvalRequired)");
    expect(chat).toContain("resolveAIActionPolicy(toolName)");
    expect(chat).toContain('state: "pending_approval"');
    expect(chat).toContain('"/api/ai-actions/:actionId/approve"');
    expect(activity).toContain("Awaiting your approval");
    expect(activity).toContain('decision: "approve"');
  });

  it("shows a privacy-safe action preview and expiry before approval", () => {
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    const activity = readSource("client/src/components/ai/AssistantActivity.tsx");
    expect(chat).toContain("function pendingActionPreview");
    expect(chat).toContain("preview: pendingActionPreview");
    expect(activity).toContain("No change has happened. Expires");
    expect(activity).toContain('["/api/users", user?.id, "daily-logs"]');
    expect(activity).toContain('["/api/vision-goals"]');
  });

  it("does not instruct the model to misrepresent queued changes as complete", () => {
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    expect(chat).toContain("Never describe a pending action as completed");
    expect(chat).toContain("awaiting approval");
    expect(chat).not.toContain("Confirm what you did clearly and concisely.");
  });
});
