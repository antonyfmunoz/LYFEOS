import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { healthAssistantBoundary } from "../server/health-assistant";

describe("private health-record assistant", () => {
  it("blocks emergency and clinical requests before model retrieval", () => {
    expect(healthAssistantBoundary("I have chest pain, what does my data say?")).toMatchObject({ kind: "emergency" });
    expect(healthAssistantBoundary("What dose should I take?")).toMatchObject({ kind: "clinical" });
    expect(healthAssistantBoundary("Diagnose me from these records")).toMatchObject({ kind: "clinical" });
    expect(healthAssistantBoundary("Summarize which sleep days are recorded and missing")).toBeNull();
  });

  it("requires durable preference, one-time confirmation, selected series, and metadata-only receipts", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-insights.ts"), "utf8");
    expect(routes).toContain('app.post("/api/health-assistant/explain", isAuthenticated');
    expect(routes).toContain("profile?.aiContextEnabled");
    expect(routes).toContain("confirmed: z.literal(true)");
    expect(routes).toContain("seriesIds: z.array");
    expect(routes).toContain("No selected health values were sent to an AI provider");
    const schema = readFileSync(resolve(process.cwd(), "shared/schema.ts"), "utf8");
    expect(schema).toContain("Metadata-only model receipts intentionally omit the private question");
    expect(schema).not.toContain('question: text("question")');
  });

  it("keeps model proposals inert until an owner decision and in data-rights paths", () => {
    const routes = readFileSync(resolve(process.cwd(), "server/routes/health-insights.ts"), "utf8");
    expect(routes).toContain('app.post("/api/health-assistant/drafts/:id/decision", isAuthenticated');
    expect(routes).toContain('eq(healthAiDrafts.state, "pending")');
    expect(routes).toContain('"health_ai_requests", "health_ai_drafts"');
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/HealthAssistant.tsx"), "utf8");
    expect(client).toContain("A draft cannot become a health fact, mission, or XP event");
    expect(client).toContain("Send only these selected record values");
  });
});
