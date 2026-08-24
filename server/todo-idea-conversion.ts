import { and, eq } from "drizzle-orm";
import { userDailyLogs, quests } from "@shared/schema";
import { db } from "./db";
import { createMissionLifecycle } from "./mission-lifecycle";
import { todoIdeaLines } from "./todo-idea-parsing";

/**
 * Turns explicitly captured prior-day ideas into ordinary user-owned missions.
 * Both daily-log save and mission-list load call this same service; the latter
 * acts as recovery if a user did not return on the next day.
 */
export async function convertTodoIdeasToMissions(input: {
  userId: number;
  includeLog: (date: string) => boolean;
  createdAtForLog: (date: string) => Date;
}) {
  const pendingLogs = await db.select()
    .from(userDailyLogs)
    .where(and(eq(userDailyLogs.userId, input.userId), eq(userDailyLogs.todosConverted, false)));
  const eligibleLogs = pendingLogs.filter((log) => Boolean(log.todoIdeas) && input.includeLog(log.date));
  if (eligibleLogs.length === 0) return { logsProcessed: 0, created: 0, duplicatesSkipped: 0 };

  const existingQuests = await db.select({ title: quests.title })
    .from(quests)
    .where(eq(quests.userId, input.userId));
  const existingTitles = new Set(existingQuests.map((quest) => quest.title.toLowerCase().trim()));
  let created = 0;
  let duplicatesSkipped = 0;

  for (const log of eligibleLogs) {
    const lines = todoIdeaLines(log.todoIdeas);
    for (const title of lines) {
      const normalizedTitle = title.toLowerCase();
      if (existingTitles.has(normalizedTitle)) {
        duplicatesSkipped++;
        continue;
      }
      await createMissionLifecycle({
        userId: input.userId,
        title,
        description: `Auto-created from To-Do Ideas on ${log.date}`,
        category: "todo",
        completed: false,
        experienceReward: 50,
        createdAt: input.createdAtForLog(log.date),
        source: "system",
      });
      existingTitles.add(normalizedTitle);
      created++;
    }
    await db.update(userDailyLogs)
      .set({ todosConverted: true })
      .where(eq(userDailyLogs.id, log.id));
  }

  return { logsProcessed: eligibleLogs.length, created, duplicatesSkipped };
}
