import { describe, expect, it } from "vitest";
import { plateBreakdown } from "../client/src/lib/plateCalculator";

describe("plateBreakdown", () => {
  it("returns a symmetrical exact layout including the selected bar", () => {
    expect(plateBreakdown(100, "kg", 20)).toEqual({ available: true, targetLoad: 100, barWeight: 20, unit: "kg", perSide: [{ weight: 25, count: 1 }, { weight: 15, count: 1 }] });
    expect(plateBreakdown(135, "lb", 45)).toEqual({ available: true, targetLoad: 135, barWeight: 45, unit: "lb", perSide: [{ weight: 45, count: 1 }] });
  });

  it("does not invent a layout when the target is invalid, below the bar, or not representable", () => {
    expect(plateBreakdown(0, "kg", 20)).toMatchObject({ available: false, reason: "invalid_target" });
    expect(plateBreakdown(15, "kg", 20)).toMatchObject({ available: false, reason: "below_bar" });
    expect(plateBreakdown(20.5, "kg", 20)).toMatchObject({ available: false, reason: "no_exact_standard_layout" });
  });
});
