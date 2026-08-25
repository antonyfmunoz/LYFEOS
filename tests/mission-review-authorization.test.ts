import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createMissionReviewToken,
  hashMissionReviewToken,
  missionReviewTokenMatches,
  normalizeRubricDefinition,
  validateEvidenceChecks,
} from "../server/mission-review-authorization";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("mission review authorization", () => {
  it("creates unique opaque tokens and persists only a deterministic hash", () => {
    const first = createMissionReviewToken();
    const second = createMissionReviewToken();
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashMissionReviewToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
    expect(missionReviewTokenMatches(first.token, first.tokenHash)).toBe(true);
    expect(missionReviewTokenMatches(`${first.token}x`, first.tokenHash)).toBe(false);
  });

  it("requires an exact declared-evidence check set for every review decision", () => {
    expect(validateEvidenceChecks(["artifact", "observation"], [{ requirement: "artifact", met: true }], "revisions_needed")).toEqual({
      ok: false,
      status: 400,
      error: "Review each declared evidence requirement before recording a decision.",
    });
    expect(validateEvidenceChecks(["artifact"], [{ requirement: "artifact", met: false }], "meets_evidence")).toEqual({
      ok: false,
      status: 409,
      error: "Every declared evidence requirement must be marked met before this mission can advance progression.",
    });
    expect(validateEvidenceChecks(["artifact"], [{ requirement: "artifact", met: false }], "revisions_needed")).toEqual({ ok: true });
    expect(validateEvidenceChecks(["artifact"], [{ requirement: "artifact", met: true }], "meets_evidence")).toEqual({ ok: true });
  });

  it("normalizes a versionable weighted rubric without dropping declared evidence", () => {
    expect(normalizeRubricDefinition(["artifact", "observation"], [
      { id: "artifact", requirement: "artifact", guidance: "Inspect the submitted work.", weight: 3, required: true },
      { id: "observation", requirement: "observation", guidance: "Compare the recorded outcome.", weight: 2, required: true },
    ])).toEqual([
      { id: "artifact", requirement: "artifact", guidance: "Inspect the submitted work.", weight: 3, required: true },
      { id: "observation", requirement: "observation", guidance: "Compare the recorded outcome.", weight: 2, required: true },
    ]);
  });

  it("accepts criterion IDs while still requiring every rubric decision", () => {
    expect(validateEvidenceChecks(
      ["artifact"],
      [{ criterionId: "proof", requirement: "artifact", met: true }],
      "meets_evidence",
      [{ id: "proof", requirement: "artifact", guidance: "Inspect it.", weight: 2, required: true }],
    )).toEqual({ ok: true });
  });

  it("binds a scoped invitation to a different authenticated principal", () => {
    const routes = source("server/routes/mission-reviews.ts");
    expect(routes).toContain('row.invitation.ownerUserId === req.session.userId');
    expect(routes).toContain('reviewerUserId: req.session.userId!');
    expect(routes).toContain('eq(missionReviewInvitations.reviewerUserId, req.session.userId!)');
    expect(routes).toContain('req.get("x-lyfeos-review-token")');
    expect(routes).toContain('req.get("x-lyfeos-review-invitation-id")');
    expect(routes).not.toContain("token: token");
  });

  it("commits bound native delivery evidence without storing the capability token", () => {
    const routes = source("server/routes/mission-reviews.ts");
    const messages = source("client/src/pages/MessagesPage.tsx");
    expect(routes).toContain('deliveryChannel: "native_inbox"');
    expect(routes).toContain('assertion: "recipient_inbox_committed"');
    expect(routes).toContain('extension: { kind: "mission_review_invitation", invitationId: input.invitationId, reviewPath }');
    expect(routes).toContain('throw new Error("NATIVE_REVIEW_DELIVERY_UNAVAILABLE")');
    expect(messages).toContain('message.extension?.kind === "mission_review_invitation"');
    expect(messages).toContain("Open scoped review");
  });

  it("keeps the invitation token in a URL fragment and clears it from the address bar", () => {
    const routes = source("server/routes/mission-reviews.ts");
    const page = source("client/src/pages/MissionReviewPage.tsx");
    expect(routes).toContain('reviewPath: `/review-mission#token=${token}`');
    expect(page).toContain('window.history.replaceState({}, "", "/review-mission")');
    expect(page).toContain('headers["x-lyfeos-review-token"] = token');
  });

  it("ships the schema change through both migration paths", () => {
    const migration = source("migrations/0094_mission_review_authorization.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mission_review_invitations"');
    expect(migration).toContain('"reviewer_user_id" integer REFERENCES "users"("id")');
    expect(release).toContain('id: "0094_mission_review_authorization"');
  });

  it("ships versioned rubrics, reversals, and scoped appeals through both migration paths", () => {
    const migration = source("migrations/0100_transformation_intelligence.sql");
    const release = source("server/release-migrate.ts");
    expect(migration).toContain('"rubric_definition" jsonb');
    expect(migration).toContain('"reversal_of_id" integer REFERENCES "skill_progression_events"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "mission_review_appeals"');
    expect(release).toContain('id: "0100_transformation_intelligence"');
  });

  it("ships bounded Mission method and tool packs through both migration paths", () => {
    const migration = source("migrations/0116_mission_contract_method_pack.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('"method_steps" jsonb NOT NULL');
    expect(migration).toContain('jsonb_array_length("method_steps") <= 12');
    expect(migration).toContain('"tool_requirements" jsonb NOT NULL');
    expect(release).toContain('id: "0116_mission_contract_method_pack"');
    expect(schema).toContain('methodSteps: jsonb("method_steps")');
    expect(schema).toContain('toolRequirements: jsonb("tool_requirements")');
  });

  it("ships auditable native review delivery through both migration paths", () => {
    const migration = source("migrations/0117_mission_review_native_delivery.sql");
    const release = source("server/release-migrate.ts");
    const schema = source("shared/schema.ts");
    expect(migration).toContain('"delivery_channel" text');
    expect(migration).toContain('"delivery_status" = \'delivered\'');
    expect(migration).toContain('"delivery_message_id" IS NOT NULL');
    expect(release).toContain('id: "0117_mission_review_native_delivery"');
    expect(schema).toContain('deliveryMessageId: uuid("delivery_message_id")');
  });
});
