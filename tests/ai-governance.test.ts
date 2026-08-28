import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_ACTION_POLICIES,
  aiMemoryPolicyInput,
  buildAIContextSources,
  buildPortablePersonaProjection,
  resolveAIActionPolicy,
} from "../server/ai-governance";
import { assertPublicHttpUrl, isPrivateOrReservedAddress } from "../server/public-web";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("AI and memory governance", () => {
  it("assigns every exposed assistant tool an explicit fail-closed policy", () => {
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    const names = [...chat.matchAll(/^\s+name:\s+"([^"]+)"/gm)].map((match) => match[1]);
    expect(names.length).toBeGreaterThan(20);
    expect(new Set(names)).toEqual(new Set(Object.keys(AI_ACTION_POLICIES)));
    expect(resolveAIActionPolicy("future_external_sender")).toMatchObject({ risk: "prohibited", externalEffect: "external_send" });
    expect(Object.values(AI_ACTION_POLICIES).some((policy) => policy.externalEffect === "external_send")).toBe(false);
  });

  it("requires approval for consequential local changes and keeps reads distinct", () => {
    expect(resolveAIActionPolicy("update_profile")).toMatchObject({ risk: "medium", approvalRequired: true });
    expect(resolveAIActionPolicy("complete_mission")).toMatchObject({ risk: "medium", approvalRequired: true, repair: "mission_state" });
    expect(resolveAIActionPolicy("search_missions")).toMatchObject({ risk: "read", approvalRequired: false });
    expect(resolveAIActionPolicy("web_search")).toMatchObject({ risk: "read", externalEffect: "network_read" });
  });

  it("never builds a portable persona projection without destination consent", () => {
    const persona = { id: "persona-1", name: "Atlas", interactionStyle: { tone: "direct" }, lyfeosPresentation: { role: "guide" }, ecosystemSharingEnabled: false, allowedDestinations: [], revision: 2 };
    expect(() => buildPortablePersonaProjection(persona, "umh")).toThrow(/not authorized/i);
    expect(buildPortablePersonaProjection({ ...persona, ecosystemSharingEnabled: true, allowedDestinations: ["umh"] }, "umh")).toEqual(expect.objectContaining({ schema: "umh.ai_persona.v1", name: "Atlas", revision: 2 }));
    expect(() => buildPortablePersonaProjection({ ...persona, ecosystemSharingEnabled: true, allowedDestinations: ["umh"] }, "creatoros")).toThrow(/not authorized/i);
  });

  it("validates bounded retention choices and records only source metadata", () => {
    expect(aiMemoryPolicyInput.safeParse({ chatHistoryDays: null, contextReceiptDays: 90, actionReceiptDays: 365, crossProductMemoryEnabled: false, allowedDestinations: [], expectedRevision: 1 }).success).toBe(true);
    expect(aiMemoryPolicyInput.safeParse({ chatHistoryDays: 7, contextReceiptDays: 90, actionReceiptDays: 365 }).success).toBe(false);
    const sources = buildAIContextSources({ planningEnabled: true, identityEnabled: false, dailyStateEnabled: true, conversationHistoryEnabled: false, missionCount: 3, visionGoalCount: 2, dailyLogCount: 4, priorConversationMessageCount: 50, knowledgeLayerNames: ["Sleep"], imageCount: 1 });
    expect(sources.map((source) => source.key)).toEqual(["current_request", "planning", "daily_state", "knowledge:sleep", "images"]);
    expect(JSON.stringify(sources)).not.toContain("content");
  });

  it("wires source receipts, granular deletion, repair, and external-send boundaries into the product", () => {
    const chat = readSource("server/replit_integrations/chat/routes.ts");
    const profileRoute = readSource("server/routes/profile.ts");
    const profilePage = readSource("client/src/pages/ProfilePage.tsx");
    const migration = readSource("migrations/0102_ai_memory_governance.sql");
    const lifecycleMigration = readSource("migrations/0138_ai_memory_lifecycle.sql");
    const resetChoiceMigration = readSource("migrations/0139_affirmation_reset_choice.sql");
    const retentionWorker = readSource("server/ai-memory-retention-worker.ts");
    const server = readSource("server/index.ts");
    const appContext = readSource("client/src/lib/context.tsx");
    expect(chat).toContain("CONTEXT SOURCE LEDGER");
    expect(chat).toContain("External sending is disabled");
    expect(chat).toContain('"/api/ai-actions/:actionId/repair"');
    expect(profileRoute).toContain('"context-sources"');
    expect(profileRoute).toContain('"action-history"');
    expect(profilePage).toContain("Portable persona via UMH");
    expect(profilePage).toContain("Recent context sources");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ai_context_receipts"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ai_action_repairs"');
    expect(lifecycleMigration).toContain('"ai_memory_policies_revision_valid"');
    expect(resetChoiceMigration).toContain('"affirmation_auto_generation_enabled" boolean NOT NULL DEFAULT true');
    expect(profileRoute).toContain('DELETE FROM "ai_voice_sessions"');
    expect(profileRoute).toContain('"ai_assistant_name" = \'NOVA\'');
    expect(profileRoute).toContain('"affirmation_auto_generation_enabled" = false');
    expect(profilePage).toContain("profile.affirmationAutoGenerationEnabled === false");
    expect(appContext).toContain("userProfile.affirmationAutoGenerationEnabled === false");
    expect(retentionWorker).toContain("pg_try_advisory_xact_lock");
    expect(retentionWorker).toContain('voice."status" <> \'active\'');
    expect(server).toContain("startAIMemoryRetentionWorker()");
  });

  it("requires disposable rendered proof for retention, erasure, truthful active receipts, and cleanup", () => {
    const profilePage = readSource("client/src/pages/ProfilePage.tsx");
    const acceptance = readSource("scripts/ai-memory-browser-acceptance.ts");
    const workflow = readSource(".github/workflows/verify.yml");
    const packageJson = readSource("package.json");
    expect(profilePage).toContain('data-testid="ai-memory-settings"');
    expect(profilePage).toContain('data-testid="ai-memory-retention-chats"');
    expect(profilePage).toContain('data-testid="ai-memory-clear-actions"');
    expect(profilePage).toContain('aria-live="polite"');
    expect(acceptance).toContain('LYFEOS_TEST_ENV === "isolated"');
    expect(acceptance).toContain('["127.0.0.1", "localhost"].includes(BASE_URL.hostname)');
    expect(acceptance).toContain('"lyfeos.ai-memory-browser-acceptance.v1"');
    expect(acceptance).toContain("1 active action receipt will remain until execution finishes.");
    expect(acceptance).toContain("verified-zero-residue");
    expect(workflow).toContain("npm run acceptance:ai-memory");
    expect(workflow).toContain("lyfeos-isolated-ai-memory-${{ github.sha }}");
    expect(packageJson).toContain('"acceptance:ai-memory"');
  });

  it("blocks assistant webpage reads from private networks and unsafe schemes", async () => {
    expect(isPrivateOrReservedAddress("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedAddress("10.2.3.4")).toBe(true);
    expect(isPrivateOrReservedAddress("::1")).toBe(true);
    expect(isPrivateOrReservedAddress("8.8.8.8")).toBe(false);
    await expect(assertPublicHttpUrl("http://localhost/admin")).rejects.toThrow(/private/i);
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(/HTTP/i);
    await expect(assertPublicHttpUrl("https://8.8.8.8/")).resolves.toBeInstanceOf(URL);
  });
});
