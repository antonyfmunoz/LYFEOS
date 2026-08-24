import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_AI_CONTEXT_PREFERENCES, resolveAIContextPreferences, resolveAIVisibleDisplayName } from "../server/ai-context-preferences";

describe("AI context preferences", () => {
  it("defaults to planning-only context", () => {
    expect(DEFAULT_AI_CONTEXT_PREFERENCES).toEqual({
      planning: true,
      identity: false,
      dailyState: false,
      conversationHistory: false,
    });
    expect(resolveAIContextPreferences(undefined)).toEqual(DEFAULT_AI_CONTEXT_PREFERENCES);
  });

  it("does not let malformed stored values broaden the prompt", () => {
    expect(resolveAIContextPreferences({ planning: false, identity: "yes", dailyState: true })).toEqual({
      planning: false,
      identity: false,
      dailyState: true,
      conversationHistory: false,
    });
  });

  it("keeps the account display name out of prompts unless identity context is enabled", () => {
    expect(resolveAIVisibleDisplayName(undefined, "Antony")).toBe("Player");
    expect(resolveAIVisibleDisplayName({ identity: false }, "Antony")).toBe("Player");
    expect(resolveAIVisibleDisplayName({ identity: true }, "  Antony  ")).toBe("Antony");
  });

  it("enforces the preferences at the prompt and exposes them to the user", () => {
    const chat = readFileSync(resolve(process.cwd(), "server/replit_integrations/chat/routes.ts"), "utf8");
    const profile = readFileSync(resolve(process.cwd(), "client/src/pages/ProfilePage.tsx"), "utf8");
    expect(chat).toContain("resolveAIContextPreferences(profile?.aiContextPreferences)");
    expect(chat).toContain("Conversation history is private unless the Player enables it.");
    expect(chat).toContain("resolveAIVisibleDisplayName(contextPreferences, user?.displayName)");
    expect(chat).toContain("&& (contextPreferences.planning || contextPreferences.dailyState)");
    expect(chat).toContain("if (contextPreferences.planning) {");
    expect(chat).toContain("if (contextPreferences.dailyState) {");
    expect(profile).toContain("Choose what can be included in future AI prompts");
    expect(profile).toContain("AI_CONTEXT_OPTIONS");
    expect(profile).toContain("related images referenced there");
    expect(profile).toContain("images referenced in those reflections");
  });
});
