import { describe, expect, it } from "vitest";
import { bodyMeasurementConversionVersion, convertBodyMeasurement, isValidBodyMeasurementUnit } from "@shared/body-measurements";

describe("governed body measurement conversions", () => {
  it("converts only compatible physical units with a versioned deterministic registry", () => {
    expect(bodyMeasurementConversionVersion).toBe("body-measurement-units-v1");
    expect(convertBodyMeasurement(100, "weight", "kg", "lb")).toBe(220.462);
    expect(convertBodyMeasurement(10, "waist", "in", "cm")).toBe(25.4);
    expect(convertBodyMeasurement(20, "body_fat_percent", "%", "%")).toBe(20);
  });

  it("does not coerce incompatible or custom units", () => {
    expect(convertBodyMeasurement(100, "weight", "cm", "kg")).toBeNull();
    expect(convertBodyMeasurement(4, "custom", "score", "points")).toBeNull();
    expect(isValidBodyMeasurementUnit("weight", "lbs")).toBe(false);
    expect(isValidBodyMeasurementUnit("custom", "score")).toBe(true);
  });
});
