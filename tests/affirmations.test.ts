import { describe, expect, it } from "vitest";
import { buildFoundationalAffirmation } from "../server/affirmations";

describe("foundational affirmations", () => {
  it("creates a personalized affirmation from onboarding evidence", () => {
    const affirmation = buildFoundationalAffirmation({
      displayName: "AFM",
      coreValues: ["growth", "integrity"],
      strengths: ["creativity", "discipline"],
      desiredEmotion: "confidence",
      vision90Day: "build a reliable daily system",
    });

    expect(affirmation).toContain("AFM");
    expect(affirmation).toContain("growth, integrity");
    expect(affirmation).toContain("creativity, discipline");
    expect(affirmation).toContain("confidence");
    expect(affirmation).toContain("build a reliable daily system");
    expect(affirmation.split(/\s+/).length).toBeGreaterThanOrEqual(100);
  });

  it("remains useful when only a display name is available", () => {
    const affirmation = buildFoundationalAffirmation({ displayName: "Player One" });

    expect(affirmation).toContain("Player One");
    expect(affirmation).not.toContain("undefined");
    expect(affirmation).not.toContain("[object Object]");
  });

  it("bounds user-provided detail length", () => {
    const affirmation = buildFoundationalAffirmation({
      displayName: "A".repeat(1_000),
      vision90Day: "V".repeat(1_000),
    });

    expect(affirmation.length).toBeLessThan(2_000);
  });
});
