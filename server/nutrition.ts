export const nutrientDefinitions = {
  energy_kcal: { label: "Energy", unit: "kcal" },
  protein_g: { label: "Protein", unit: "g" },
  carbohydrate_g: { label: "Carbohydrate", unit: "g" },
  fat_g: { label: "Fat", unit: "g" },
  fiber_g: { label: "Fiber", unit: "g" },
  sugar_g: { label: "Sugar", unit: "g" },
  sodium_mg: { label: "Sodium", unit: "mg" },
  water_g: { label: "Water", unit: "g" },
  alcohol_g: { label: "Alcohol", unit: "g" },
  starch_g: { label: "Starch", unit: "g" },
  saturated_fat_g: { label: "Saturated fat", unit: "g" },
  monounsaturated_fat_g: { label: "Monounsaturated fat", unit: "g" },
  polyunsaturated_fat_g: { label: "Polyunsaturated fat", unit: "g" },
  trans_fat_g: { label: "Trans fat", unit: "g" },
  omega_3_g: { label: "Omega-3 fatty acids", unit: "g" },
  omega_6_g: { label: "Omega-6 fatty acids", unit: "g" },
  cholesterol_mg: { label: "Cholesterol", unit: "mg" },
  calcium_mg: { label: "Calcium", unit: "mg" },
  chloride_mg: { label: "Chloride", unit: "mg" },
  chromium_ug: { label: "Chromium", unit: "µg" },
  copper_mg: { label: "Copper", unit: "mg" },
  iodine_ug: { label: "Iodine", unit: "µg" },
  iron_mg: { label: "Iron", unit: "mg" },
  magnesium_mg: { label: "Magnesium", unit: "mg" },
  manganese_mg: { label: "Manganese", unit: "mg" },
  molybdenum_ug: { label: "Molybdenum", unit: "µg" },
  phosphorus_mg: { label: "Phosphorus", unit: "mg" },
  potassium_mg: { label: "Potassium", unit: "mg" },
  selenium_ug: { label: "Selenium", unit: "µg" },
  zinc_mg: { label: "Zinc", unit: "mg" },
  vitamin_a_rae_ug: { label: "Vitamin A", unit: "µg RAE" },
  vitamin_c_mg: { label: "Vitamin C", unit: "mg" },
  vitamin_d_ug: { label: "Vitamin D", unit: "µg" },
  vitamin_e_mg: { label: "Vitamin E", unit: "mg" },
  vitamin_k_ug: { label: "Vitamin K", unit: "µg" },
  thiamin_mg: { label: "Thiamin (B1)", unit: "mg" },
  riboflavin_mg: { label: "Riboflavin (B2)", unit: "mg" },
  niacin_mg: { label: "Niacin (B3)", unit: "mg" },
  pantothenic_acid_mg: { label: "Pantothenic acid (B5)", unit: "mg" },
  vitamin_b6_mg: { label: "Vitamin B6", unit: "mg" },
  biotin_ug: { label: "Biotin (B7)", unit: "µg" },
  folate_dfe_ug: { label: "Folate", unit: "µg DFE" },
  vitamin_b12_ug: { label: "Vitamin B12", unit: "µg" },
  choline_mg: { label: "Choline", unit: "mg" },
  added_sugar_g: { label: "Added sugar", unit: "g" },
  caffeine_mg: { label: "Caffeine", unit: "mg" },
  theobromine_mg: { label: "Theobromine", unit: "mg" },
  alpha_linolenic_acid_g: { label: "Alpha-linolenic acid (ALA)", unit: "g" },
  eicosapentaenoic_acid_g: { label: "Eicosapentaenoic acid (EPA)", unit: "g" },
  docosahexaenoic_acid_g: { label: "Docosahexaenoic acid (DHA)", unit: "g" },
  retinol_ug: { label: "Retinol", unit: "µg" },
  beta_carotene_ug: { label: "Beta-carotene", unit: "µg" },
  lycopene_ug: { label: "Lycopene", unit: "µg" },
  lutein_zeaxanthin_ug: { label: "Lutein + zeaxanthin", unit: "µg" },
  vitamin_d2_ug: { label: "Vitamin D2", unit: "µg" },
  vitamin_d3_ug: { label: "Vitamin D3", unit: "µg" },
  food_folate_ug: { label: "Food folate", unit: "µg" },
  folic_acid_ug: { label: "Folic acid", unit: "µg" },
  alanine_g: { label: "Alanine", unit: "g" },
  arginine_g: { label: "Arginine", unit: "g" },
  aspartic_acid_g: { label: "Aspartic acid", unit: "g" },
  cystine_g: { label: "Cystine", unit: "g" },
  glutamic_acid_g: { label: "Glutamic acid", unit: "g" },
  glycine_g: { label: "Glycine", unit: "g" },
  histidine_g: { label: "Histidine", unit: "g" },
  isoleucine_g: { label: "Isoleucine", unit: "g" },
  leucine_g: { label: "Leucine", unit: "g" },
  lysine_g: { label: "Lysine", unit: "g" },
  methionine_g: { label: "Methionine", unit: "g" },
  phenylalanine_g: { label: "Phenylalanine", unit: "g" },
  proline_g: { label: "Proline", unit: "g" },
  serine_g: { label: "Serine", unit: "g" },
  threonine_g: { label: "Threonine", unit: "g" },
  tryptophan_g: { label: "Tryptophan", unit: "g" },
  tyrosine_g: { label: "Tyrosine", unit: "g" },
  valine_g: { label: "Valine", unit: "g" },
} as const;

export type NutrientKey = keyof typeof nutrientDefinitions;
export const nutrientKeys = Object.keys(nutrientDefinitions) as NutrientKey[];

export function nutritionGramsFromInput(quantity: number, inputUnit: "g" | "serving" | "ml" | "portion", servingSizeGrams: number, conversionGramsPerUnit?: number | null): number {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(servingSizeGrams) || servingSizeGrams <= 0) throw new Error("Nutrition input must use positive quantities.");
  if (inputUnit === "g") return Number(quantity.toFixed(4));
  if (inputUnit === "serving") return Number((quantity * servingSizeGrams).toFixed(4));
  if (!Number.isFinite(conversionGramsPerUnit) || conversionGramsPerUnit! <= 0) throw new Error("This food needs an explicit density or portion conversion.");
  return Number((quantity * conversionGramsPerUnit!).toFixed(4));
}

export function nutritionTotals(rows: Array<{ nutrientKey: string; amountPer100g: number; unit: string; servingGrams: number }>) {
  const totals: Record<string, { amount: number; unit: string }> = {};
  for (const row of rows) {
    const amount = row.amountPer100g * (row.servingGrams / 100);
    const current = totals[row.nutrientKey];
    totals[row.nutrientKey] = { amount: Number(((current?.amount || 0) + amount).toFixed(2)), unit: row.unit };
  }
  return totals;
}

export type NutritionTrendRow = {
  entryId: number;
  occurredAt: Date;
  servingGrams: number;
  nutrientKey: string;
  amountPer100g: number;
  unit: string;
};

export type NutritionContributionEntry = {
  entryId: number;
  foodId: number;
  foodName: string;
  servingGrams: number;
  nutrients: Array<{ nutrientKey: string; amountPer100g: number; unit: string }>;
};

export type NutritionReportEntry = {
  entryId: number;
  occurredAt: Date;
  servingGrams: number;
  nutrients: Array<{ nutrientKey: string; amountPer100g: number; unit: string }>;
};

export type NutritionDailyReportRow = {
  date: string;
  nutrientKey: NutrientKey;
  nutrientLabel: string;
  unit: string;
  value: number | null;
  valueState: "recorded" | "unknown" | "not_recorded";
  recordedEntries: number;
  totalEntries: number;
};

// Contributions are calculated from the nutrient evidence attached to each
// diary entry. Nutrients absent from an entry are unknown, never implied zero.
export function nutritionContributions(entries: NutritionContributionEntry[]) {
  return nutrientKeys.map((nutrientKey) => {
    const definition = nutrientDefinitions[nutrientKey];
    const foods = new Map<number, { foodId: number; foodName: string; amount: number; entryCount: number }>();
    let recordedEntries = 0;
    let total = 0;
    for (const entry of entries) {
      const nutrient = entry.nutrients.find((item) => item.nutrientKey === nutrientKey);
      if (!nutrient) continue;
      const amount = nutrient.amountPer100g * (entry.servingGrams / 100);
      recordedEntries += 1;
      total += amount;
      const current = foods.get(entry.foodId);
      foods.set(entry.foodId, {
        foodId: entry.foodId,
        foodName: entry.foodName,
        amount: (current?.amount || 0) + amount,
        entryCount: (current?.entryCount || 0) + 1,
      });
    }
    return {
      nutrientKey,
      label: definition.label,
      unit: definition.unit,
      total: recordedEntries ? Number(total.toFixed(2)) : null,
      recordedEntries,
      totalEntries: entries.length,
      contributions: Array.from(foods.values())
        .map((food) => ({ ...food, amount: Number(food.amount.toFixed(2)) }))
        .sort((left, right) => right.amount - left.amount || left.foodName.localeCompare(right.foodName)),
    };
  });
}

// Missing nutrient data stays null, not zero. A zero is only shown when an
// existing food record explicitly contains a zero-valued nutrient.
export function nutritionTrend(rows: NutritionTrendRow[], startDate: string, days: number, dateKey: (value: Date) => string = (value) => value.toISOString().slice(0, 10)) {
  const daily = new Map<string, { entryIds: Set<number>; totals: ReturnType<typeof nutritionTotals> }>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    daily.set(date.toISOString().slice(0, 10), { entryIds: new Set(), totals: {} });
  }
  for (const row of rows) {
    const key = dateKey(row.occurredAt);
    const current = daily.get(key);
    if (!current) continue;
    current.entryIds.add(row.entryId);
    current.totals = nutritionTotals([
      ...Object.entries(current.totals).map(([nutrientKey, total]) => ({ nutrientKey, amountPer100g: total.amount, unit: total.unit, servingGrams: 100 })),
      { nutrientKey: row.nutrientKey, amountPer100g: row.amountPer100g, unit: row.unit, servingGrams: row.servingGrams },
    ]);
  }
  return Array.from(daily, ([date, value]) => ({
    date,
    entries: value.entryIds.size,
    energyKcal: value.totals.energy_kcal?.amount ?? null,
    proteinGrams: value.totals.protein_g?.amount ?? null,
    carbohydrateGrams: value.totals.carbohydrate_g?.amount ?? null,
    fatGrams: value.totals.fat_g?.amount ?? null,
  }));
}

export type NutritionTrendDay = ReturnType<typeof nutritionTrend>[number];

export function nutritionPeriodSummary(trend: NutritionTrendDay[]) {
  const metric = (key: "energyKcal" | "proteinGrams" | "carbohydrateGrams" | "fatGrams") => {
    const values = trend.flatMap((day) => day[key] === null ? [] : [day[key] as number]);
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      recordedDays: values.length,
      totalRecorded: values.length ? Number(total.toFixed(2)) : null,
      averagePerRecordedDay: values.length ? Number((total / values.length).toFixed(2)) : null,
    };
  };
  return {
    days: trend.length,
    diaryDays: trend.filter((day) => day.entries > 0).length,
    diaryEntries: trend.reduce((sum, day) => sum + day.entries, 0),
    energyKcal: metric("energyKcal"), proteinGrams: metric("proteinGrams"),
    carbohydrateGrams: metric("carbohydrateGrams"), fatGrams: metric("fatGrams"),
  };
}

export function nutritionPeriodComparison(current: NutritionTrendDay[], previous: NutritionTrendDay[]) {
  return { current: nutritionPeriodSummary(current), previous: nutritionPeriodSummary(previous) };
}

// The reconciliation report is deliberately long-form: every supported
// nutrient receives one row per local calendar date. This keeps an explicit
// recorded zero distinct from a missing nutrient value and from a day with no
// diary entries at all.
export function nutritionDailyReport(entries: NutritionReportEntry[], startDate: string, days: number, dateKey: (value: Date) => string = (value) => value.toISOString().slice(0, 10)): NutritionDailyReportRow[] {
  const daily = new Map<string, { entryIds: Set<number>; nutrients: Map<string, { amount: number; entryIds: Set<number> }> }>();
  for (let index = 0; index < days; index += 1) {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    daily.set(date.toISOString().slice(0, 10), { entryIds: new Set(), nutrients: new Map() });
  }
  for (const entry of entries) {
    const day = daily.get(dateKey(entry.occurredAt));
    if (!day) continue;
    day.entryIds.add(entry.entryId);
    for (const nutrient of entry.nutrients) {
      if (!(nutrient.nutrientKey in nutrientDefinitions)) continue;
      const current = day.nutrients.get(nutrient.nutrientKey) || { amount: 0, entryIds: new Set<number>() };
      current.amount += nutrient.amountPer100g * (entry.servingGrams / 100);
      current.entryIds.add(entry.entryId);
      day.nutrients.set(nutrient.nutrientKey, current);
    }
  }
  return Array.from(daily, ([date, day]) => nutrientKeys.map((nutrientKey): NutritionDailyReportRow => {
    const nutrient = day.nutrients.get(nutrientKey);
    const valueState = day.entryIds.size === 0 ? "not_recorded" : nutrient ? "recorded" : "unknown";
    return {
      date,
      nutrientKey,
      nutrientLabel: nutrientDefinitions[nutrientKey].label,
      unit: nutrientDefinitions[nutrientKey].unit,
      value: nutrient ? Number(nutrient.amount.toFixed(2)) : null,
      valueState,
      recordedEntries: nutrient?.entryIds.size || 0,
      totalEntries: day.entryIds.size,
    };
  })).flat();
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function nutritionDailyReportCsv(rows: NutritionDailyReportRow[]): string {
  const header = ["date", "nutrient_key", "nutrient_label", "unit", "value", "value_state", "recorded_entries", "total_entries"];
  const body = rows.map((row) => [row.date, row.nutrientKey, row.nutrientLabel, row.unit, row.value, row.valueState, row.recordedEntries, row.totalEntries].map(csvCell).join(","));
  return [header.join(","), ...body].join("\r\n");
}
