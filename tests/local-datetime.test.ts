import { describe, expect, it } from "vitest";
import { localDateTimeIso } from "../client/src/lib/utils";

describe("local health capture time", () => {
  it("preserves the selected local clock time when creating an instant", () => {
    const result = localDateTimeIso("2026-08-23", "18:45");
    expect(Number.isNaN(new Date(result).getTime())).toBe(false);
    const local = new Date(result);
    expect(local.getHours()).toBe(18);
    expect(local.getMinutes()).toBe(45);
  });

  it("rejects invalid date or time input", () => {
    expect(() => localDateTimeIso("2026-08-23", "24:00")).toThrow("valid local date and time");
    expect(() => localDateTimeIso("not-a-date", "10:00")).toThrow("valid local date and time");
  });
});
