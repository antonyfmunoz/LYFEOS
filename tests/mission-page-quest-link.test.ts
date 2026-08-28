import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("canonical Mission page ownership", () => {
  it("binds one Mission page to its owned Quest instead of the calendar-event foreign key", () => {
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0140_mission_page_quest_link.sql");
    const route = source("server/routes/content.ts");
    const detail = source("client/src/pages/MissionDetailPage.tsx");
    const context = source("client/src/lib/context.tsx");
    expect(schema).toContain('questId: integer("quest_id").references(() => quests.id');
    expect(migration).toContain('"mission_pages_quest_unique_idx"');
    expect(migration).toContain('REFERENCES "quests"("id") ON DELETE CASCADE');
    expect(route).toContain('eq(quests.userId, req.session.userId!)');
    expect(route).toContain('eq(missionPages.questId, pageData.questId)');
    expect(route).toContain('if (existingQuestPage) return res.status(200).json({ page: existingQuestPage });');
    expect(detail).toContain('missionPages.find(page => page.questId === mission.id)');
    expect(detail).toContain('questId: mission.id');
    expect(detail).not.toContain('eventId: mission.id');
    expect(context).toContain('questId: mission.questId ? parseInt(mission.questId) : null');
    expect(context).not.toContain('.then((response) => response.json())');
  });

  it("keeps the release runner and isolated restore ledger converged", () => {
    const release = source("server/release-migrate.ts");
    const verify = source(".github/workflows/verify.yml");
    expect(release).toContain('id: "0140_mission_page_quest_link"');
    expect(verify.match(/= "132"/g)).toHaveLength(2);
  });
});
