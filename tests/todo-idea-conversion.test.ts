import { describe, expect, it } from "vitest";
import { localMidnight, todoIdeaLines } from "../server/todo-idea-parsing";

describe("todo idea conversion helpers", () => {
  it("keeps only non-empty, trimmed captured ideas", () => {
    expect(todoIdeaLines("  First idea\n\n Second idea \n  ")).toEqual(["First idea", "Second idea"]);
  });

  it("creates a local calendar midnight without a UTC date shift", () => {
    const date = localMidnight("2026-08-14");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()]).toEqual([2026, 8, 14, 0]);
  });
});
