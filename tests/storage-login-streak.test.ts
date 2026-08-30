import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));

import { DatabaseStorage } from "../server/storage";
import { formatLocalDate } from "../server/utils";

describe("DatabaseStorage.processLoginStreak", () => {
  it("does not rewrite stats after the current day's reset has run", async () => {
    const storage = new DatabaseStorage();
    vi.spyOn(storage, "getUserStats").mockResolvedValue({
      lastActiveDate: formatLocalDate(new Date()),
      streakDays: 6,
    } as any);
    const update = vi.spyOn(storage, "updateUserStats");

    await expect(storage.processLoginStreak(42)).resolves.toEqual({
      streakDays: 6,
      isNewDay: false,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
