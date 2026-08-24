export type EnergyDisplayUnit = "kcal" | "kJ";
export type VolumeDisplayUnit = "ml" | "fl_oz";

const kilojoulesPerKilocalorie = 4.184;
const millilitersPerFluidOunce = 29.5735;
const rounded = (value: number, digits = 1) => Number(value.toFixed(digits));

export function energyFromKcal(value: number, unit: EnergyDisplayUnit): number {
  return rounded(unit === "kJ" ? value * kilojoulesPerKilocalorie : value);
}

export function energyToKcal(value: number, unit: EnergyDisplayUnit): number {
  return rounded(unit === "kJ" ? value / kilojoulesPerKilocalorie : value);
}

export function volumeFromMl(value: number, unit: VolumeDisplayUnit): number {
  return rounded(unit === "fl_oz" ? value / millilitersPerFluidOunce : value);
}

export function volumeToMl(value: number, unit: VolumeDisplayUnit): number {
  return rounded(unit === "fl_oz" ? value * millilitersPerFluidOunce : value, 0);
}
