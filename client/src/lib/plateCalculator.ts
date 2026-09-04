export type PlateLoadUnit = "kg" | "lb";

export type PlateBreakdown =
  | { available: true; perSide: Array<{ weight: number; count: number }>; barWeight: number; targetLoad: number; unit: PlateLoadUnit }
  | { available: false; reason: "invalid_target" | "below_bar" | "no_exact_standard_layout"; barWeight: number; targetLoad: number; unit: PlateLoadUnit };

const standardPlates: Record<PlateLoadUnit, number[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5],
  lb: [45, 35, 25, 10, 5, 2.5],
};

// Calculates a symmetrical conventional barbell layout. It does not estimate
// equipment availability: an exact result means only that standard listed
// plates can represent the selected total including the selected bar.
export function plateBreakdown(targetLoad: number, unit: PlateLoadUnit, barWeight: number): PlateBreakdown {
  if (!Number.isFinite(targetLoad) || targetLoad <= 0 || !Number.isFinite(barWeight) || barWeight <= 0) return { available: false, reason: "invalid_target", barWeight, targetLoad, unit };
  if (targetLoad < barWeight) return { available: false, reason: "below_bar", barWeight, targetLoad, unit };

  let remainingPerSide = Math.round(((targetLoad - barWeight) / 2) * 100) / 100;
  const perSide: Array<{ weight: number; count: number }> = [];
  for (const weight of standardPlates[unit]) {
    const count = Math.floor((remainingPerSide + 0.000_001) / weight);
    if (!count) continue;
    perSide.push({ weight, count });
    remainingPerSide = Math.round((remainingPerSide - count * weight) * 100) / 100;
  }
  if (Math.abs(remainingPerSide) > 0.000_001) return { available: false, reason: "no_exact_standard_layout", barWeight, targetLoad, unit };
  return { available: true, perSide, barWeight, targetLoad, unit };
}
