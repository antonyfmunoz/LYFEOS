import { describe, expect, it } from "vitest";
import { buildExtractiveVoiceSummary } from "../server/voice-session-summary";

describe("voice session extractive summary", () => {
  it("uses user transcript only and preserves traceable action sources", () => {
    const result = buildExtractiveVoiceSummary([
      { id: "u1", speaker: "user", transcript: "We need to finish the release checklist. The customer interview confirmed the onboarding issue." },
      { id: "a1", speaker: "assistant", transcript: "I invented an assistant-only conclusion that must not become a key point." },
      { id: "u2", speaker: "user", transcript: "I will verify onboarding tomorrow. We need to finish the release checklist." },
    ]);
    expect(result.keyPoints).toEqual([
      "We need to finish the release checklist.",
      "The customer interview confirmed the onboarding issue.",
      "I will verify onboarding tomorrow.",
    ]);
    expect(result.summary).not.toContain("invented");
    expect(result.actionItems).toEqual([
      { text: "We need to finish the release checklist.", sourceSegmentId: "u1", owner: "shared", status: "open" },
      { text: "I will verify onboarding tomorrow.", sourceSegmentId: "u2", owner: "user", status: "open" },
    ]);
  });

  it("states when no substantive user transcript was captured", () => {
    expect(buildExtractiveVoiceSummary([{ id: "a1", speaker: "assistant", transcript: "Hello." }])).toEqual({
      summary: "No substantive user transcript was captured.",
      keyPoints: [],
      actionItems: [],
    });
  });
});
