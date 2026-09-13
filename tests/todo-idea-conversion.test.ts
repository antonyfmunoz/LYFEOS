import { describe, expect, it } from "vitest";
import { localEndOfDay, localMidnight, todoIdeaLines } from "../server/todo-idea-parsing";

describe("todo idea conversion helpers", () => {
  it("keeps only non-empty, trimmed captured ideas", () => {
    expect(todoIdeaLines("  First idea\n\n Second idea \n  ")).toEqual(["First idea", "Second idea"]);
  });

  it("creates a local calendar midnight without a UTC date shift", () => {
    const date = localMidnight("2026-08-14");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()]).toEqual([2026, 8, 14, 0]);
  });

  it("preserves the captured date at the final instant of the local day", () => {
    const date = localEndOfDay("2026-08-14");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()])
      .toEqual([2026, 8, 14, 23, 59, 59, 999]);
  });
});
