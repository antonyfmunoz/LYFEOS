export const bodyMeasurementUnits = {
  weight: ["kg", "lb"],
  body_fat_percent: ["%"],
  waist: ["cm", "in"],
  chest: ["cm", "in"],
  hips: ["cm", "in"],
} as const;

export type GovernedBodyMeasurementMetric = keyof typeof bodyMeasurementUnits;

export function governedBodyMeasurementUnits(metric: string): readonly string[] | null {
  return metric in bodyMeasurementUnits ? bodyMeasurementUnits[metric as GovernedBodyMeasurementMetric] : null;
}

export function isValidBodyMeasurementUnit(metric: string, unit: string): boolean {
  const governed = governedBodyMeasurementUnits(metric);
  return governed ? governed.includes(unit as never) : metric === "custom" && unit.trim().length > 0;
}

export function convertBodyMeasurement(value: number, metric: string, fromUnit: string, toUnit: string): number | null {
  if (!Number.isFinite(value) || !isValidBodyMeasurementUnit(metric, fromUnit) || !isValidBodyMeasurementUnit(metric, toUnit)) return null;
  if (fromUnit === toUnit) return value;
  let converted: number | null = null;
  if (metric === "weight") converted = fromUnit === "kg" && toUnit === "lb" ? value * 2.2046226218 : value / 2.2046226218;
  if (["waist", "chest", "hips"].includes(metric)) converted = fromUnit === "cm" && toUnit === "in" ? value / 2.54 : value * 2.54;
  return converted == null ? null : Math.round(converted * 1000) / 1000;
}

export const bodyMeasurementConversionVersion = "body-measurement-units-v1";
