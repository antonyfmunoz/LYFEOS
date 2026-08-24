import { afterEach, describe, expect, it } from "vitest";
import { classifyMission } from "../server/utils";

describe("mission classification provider boundary", () => {
  const originalKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    else process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY = originalKey;
  });

  it("uses deterministic caller defaults when the optional provider is not configured", async () => {
    delete process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    await expect(classifyMission("Review a private pattern", null, { category: "personal", difficulty: "D" }))
      .resolves.toEqual({ category: "personal", difficulty: "D" });
  });
});
