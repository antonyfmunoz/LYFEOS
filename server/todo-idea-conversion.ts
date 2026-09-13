import { and, eq } from "drizzle-orm";
import { userDailyLogs } from "@shared/schema";
import { db } from "./db";
import { createMissionLifecycleResult } from "./mission-lifecycle";
import { todoIdeaLines } from "./todo-idea-parsing";

/**
 * Moves explicitly captured closed-day ideas into the durable Mission Archive.
 * These are unscheduled someday-Missions, never completed work or achievements.
 * Daily-log save and mission-list load both reconcile the same pending logs;
 * mission-list loading recovers any day the user did not revisit immediately.
 */
export async function convertTodoIdeasToMissions(input: {
  userId: number;
  includeLog: (date: string) => boolean;
  archivedAtForLog: (date: string) => Date;
}) {
  const pendingLogs = await db.select()
    .from(userDailyLogs)
    .where(and(eq(userDailyLogs.userId, input.userId), eq(userDailyLogs.todosConverted, false)));
  const eligibleLogs = pendingLogs.filter((log) => Boolean(log.todoIdeas) && input.includeLog(log.date));
  if (eligibleLogs.length === 0) return { logsProcessed: 0, created: 0, duplicatesSkipped: 0 };

  let created = 0;
  let duplicatesSkipped = 0;

  for (const log of eligibleLogs) {
    const lines = todoIdeaLines(log.todoIdeas);
    const seenInLog = new Set<string>();
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const title = lines[lineIndex];
      const normalizedTitle = title.toLowerCase();
      if (seenInLog.has(normalizedTitle)) {
        duplicatesSkipped++;
        continue;
      }
      seenInLog.add(normalizedTitle);
      const result = await createMissionLifecycleResult({
        userId: input.userId,
        title,
        description: `Captured from To-Do Ideas on ${log.date}. Saved in Mission Archive as an unscheduled someday-Mission; it is not completed work.`,
        category: "todo",
        completed: false,
        experienceReward: 0,
        createdAt: input.archivedAtForLog(log.date),
        lifecycleKey: `todo-idea:${log.id}:${lineIndex}`,
        source: "todo",
        suppressAutomations: true,
      });
      if (result.replayed) duplicatesSkipped++;
      else created++;
    }
    await db.update(userDailyLogs)
      .set({ todosConverted: true })
      .where(eq(userDailyLogs.id, log.id));
  }

  return { logsProcessed: eligibleLogs.length, created, duplicatesSkipped };
}
