import { lazy, Suspense, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Apple, ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Plus, Settings2, Star, Trash2, Utensils } from "lucide-react";
import { apiRequest, queryClient, timeContextHeaders } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getLocalDateString, localDateTimeIso } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { submitHealthMutation } from "@/lib/healthOfflineQueue";
import { toast } from "@/hooks/use-toast";
import { compareRecipeIngredients } from "@shared/recipe-comparison";
import { energyFromKcal, energyToKcal, type EnergyDisplayUnit } from "@shared/health-display-units";

const FoodCatalogSearch = lazy(() => import("./FoodCatalogSearch"));

type Nutrient = { nutrientKey: string; amountPer100g: number; unit: string };
type FoodPortion = { id: number; foodId: number; label: string; gramsPerUnit: number };
type Food = { id: number; name: string; brand: string | null; barcode: string | null; servingSizeGrams: number; densityGramsPerMl: number | null; favorite: boolean; note: string | null; recentUseCount: number; lastLoggedAt: string | null; catalogProviderId: string | null; catalogDatasetVersion: string | null; catalogItemVersion: string | null; catalogAttributionText: string | null; catalogAttributionUrl: string | null; catalogSourceModified: boolean; nutrients: Nutrient[]; portions: FoodPortion[] };
type DiaryEntry = { id: number; foodId: number; foodName: string; foodBrand: string | null; servingGrams: number; inputQuantity: number | null; inputUnit: "g" | "serving" | "ml" | "portion" | null; inputPortionId: number | null; inputUnitLabel: string | null; inputGramsPerUnit: number | null; mealSlot: string; nutrients: Nutrient[] };
type Diary = { date: string; entries: DiaryEntry[]; totals: Record<string, { amount: number; unit: string }> };
type Recipe = { id: number; name: string; servings: number; folder: string | null; revisionCount: number; currentRevision: number; ingredients: Array<{ foodId: number; grams: number; food: { name: string } | null }> };
type RecipeRevision = { revisionNumber: number; name: string; servings: number; folder: string | null; note: string | null; ingredientsSnapshot: Array<{ foodId: number; grams: number; sortOrder: number }>; createdAt: string };
type HealthTarget = { id: number; kind: string; targetValue: number; unit: string; effectiveFrom: string; effectiveTo: string | null; source: "user" | "professional" | "calculated"; calculationVersion: string | null; weekdays: number[]; rationale: string | null; methodId: string | null; methodVersion: string | null; note: string | null; revision: number };
type HealthTargetRevision = { id: number; targetId: number; revisionNumber: number; action: "baseline" | "created" | "updated" | "deleted"; snapshot: HealthTarget & { deletedAt?: string }; createdAt: string };
type NutritionTrendDay = { date: string; entries: number; energyKcal: number | null; proteinGrams: number | null; carbohydrateGrams: number | null; fatGrams: number | null };
type NutritionPeriodMetric = { recordedDays: number; totalRecorded: number | null; averagePerRecordedDay: number | null };
type NutritionPeriodSummary = { days: number; diaryDays: number; diaryEntries: number; energyKcal: NutritionPeriodMetric; proteinGrams: NutritionPeriodMetric; carbohydrateGrams: NutritionPeriodMetric; fatGrams: NutritionPeriodMetric };
type NutritionComparison = { periods: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } }; current: NutritionPeriodSummary; previous: NutritionPeriodSummary };
type NutritionContribution = { nutrientKey: string; label: string; unit: string; total: number | null; recordedEntries: number; totalEntries: number; contributions: Array<{ foodId: number; foodName: string; amount: number; entryCount: number }> };
type NutrientDefinition = { nutrientKey: string; label: string; unit: string };
const coreNutrientKeys = new Set(["energy_kcal", "protein_g", "carbohydrate_g", "fat_g"]);

function today(): string { return getLocalDateString(); }
function previousDay(date: string): string { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); }
function nextDay(date: string): string { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10); }
function invalidNumber(value: string): boolean { return !Number.isFinite(Number(value)) || Number(value) <= 0; }
function trendValueLabel(value: number | null, entries: number): number | string { return value === null ? (entries ? "Unknown" : "No diary records") : value; }

export default function NutritionDiary() {
  const { user } = useAuth();
  const [date, setDate] = useState(today);
  const [expanded, setExpanded] = useState(false);
  const [selectedFoodId, setSelectedFoodId] = useState<string>("");
  const [servingGrams, setServingGrams] = useState("100");
  const [inputUnit, setInputUnit] = useState<"g" | "serving" | "ml" | "portion">("g");
  const [inputPortionId, setInputPortionId] = useState("");
  const [mealSlot, setMealSlot] = useState("other");
  const [entryTime, setEntryTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [foodName, setFoodName] = useState("");
  const [energy, setEnergy] = useState("");
  const [protein, setProtein] = useState("0");
  const [carbs, setCarbs] = useState("0");
  const [fat, setFat] = useState("0");
  const [foodServingSize, setFoodServingSize] = useState("100");
  const [foodDensity, setFoodDensity] = useState("");
  const [portionLabel, setPortionLabel] = useState("");
  const [portionGrams, setPortionGrams] = useState("");
  const [extraNutrients, setExtraNutrients] = useState<Record<string, string>>({});
  const [editingFoodId, setEditingFoodId] = useState<number | null>(null);
  const [recipeName, setRecipeName] = useState("");
  const [recipeServings, setRecipeServings] = useState("1");
  const [recipeFolder, setRecipeFolder] = useState("");
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ foodId: string; grams: string }>>([{ foodId: "", grams: "100" }]);
  const [selectedRecipeId, setSelectedRecipeId] = useState("");
  const [recipeLogServings, setRecipeLogServings] = useState("1");
  const [editingRecipeId, setEditingRecipeId] = useState<number | null>(null);
  const [selectedRecipeRevision, setSelectedRecipeRevision] = useState("");
  const [targetKind, setTargetKind] = useState("energy");
  const [targetValue, setTargetValue] = useState("");
  const [targetFrom, setTargetFrom] = useState(today);
  const [targetTo, setTargetTo] = useState("");
  const [targetWeekdays, setTargetWeekdays] = useState<number[]>([]);
  const [targetRationale, setTargetRationale] = useState("");
  const [trendDays, setTrendDays] = useState(14);
  const [reportDownloadError, setReportDownloadError] = useState(false);
  const [contributionNutrient, setContributionNutrient] = useState("energy_kcal");
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingTarget, setEditingTarget] = useState<HealthTarget | null>(null);
  const [deletedEntry, setDeletedEntry] = useState<{ receiptId: string; expiresAt: string } | null>(null);
  const foods = useQuery<{ foods: Food[] }>({ queryKey: ["/api/nutrition/foods"], queryFn: () => apiRequest("/api/nutrition/foods") });
  const diary = useQuery<Diary>({ queryKey: ["/api/nutrition/diary", { date }], queryFn: () => apiRequest(`/api/nutrition/diary?date=${date}`) });
  const recipes = useQuery<{ recipes: Recipe[] }>({ queryKey: ["/api/nutrition/recipes"], queryFn: () => apiRequest("/api/nutrition/recipes") });
  const recipeRevisions = useQuery<{ revisions: RecipeRevision[]; disclosure: string }>({ queryKey: ["/api/nutrition/recipes/revisions", { selectedRecipeId }], queryFn: () => apiRequest(`/api/nutrition/recipes/${selectedRecipeId}/revisions`), enabled: !!selectedRecipeId });
  const targets = useQuery<{ targets: HealthTarget[] }>({ queryKey: ["/api/health-fitness/targets"], queryFn: () => apiRequest("/api/health-fitness/targets") });
  const targetRevisions = useQuery<{ revisions: HealthTargetRevision[] }>({ queryKey: ["/api/health-fitness/target-revisions"], queryFn: () => apiRequest("/api/health-fitness/target-revisions") });
  const trends = useQuery<{ trend: NutritionTrendDay[]; comparison: NutritionComparison; disclosure: string }>({ queryKey: ["/api/nutrition/trends", { days: trendDays }], queryFn: () => apiRequest(`/api/nutrition/trends?days=${trendDays}`) });
  const contributions = useQuery<{ totalEntries: number; nutrients: NutritionContribution[]; disclosure: string }>({ queryKey: ["/api/nutrition/contributions", { days: trendDays }], queryFn: () => apiRequest(`/api/nutrition/contributions?days=${trendDays}`) });
  const nutrientRegistry = useQuery<{ nutrients: NutrientDefinition[]; disclosure: string }>({ queryKey: ["/api/nutrition/nutrients"], queryFn: () => apiRequest("/api/nutrition/nutrients") });
  const profile = useQuery<{ profile: { energyUnit: EnergyDisplayUnit } | null }>({ queryKey: ["/api/health-fitness/profile"], queryFn: () => apiRequest("/api/health-fitness/profile") });
  const energyUnit = profile.data?.profile?.energyUnit || "kcal";
  const displayEnergy = (value: number) => energyFromKcal(value, energyUnit);
  const nutritionTargetUnit = (kind: string) => (kind === "energy" || kind === "energy_kcal") ? energyUnit : nutrientRegistry.data?.nutrients.find((nutrient) => nutrient.nutrientKey === kind)?.unit || (kind === "sodium" ? "mg" : "g");
  const isNutritionTarget = (kind: string) => ["energy", "protein", "carbohydrate", "fat", "fiber", "sugar", "sodium"].includes(kind) || Boolean(nutrientRegistry.data?.nutrients.some((nutrient) => nutrient.nutrientKey === kind));
  const selectedFood = useMemo(() => foods.data?.foods.find((food) => food.id === Number(selectedFoodId)), [foods.data, selectedFoodId]);
  const mealSummaries = useMemo(() => {
    const summaries = new Map<string, { entries: number; recordedEnergyEntries: number; energyKcal: number }>();
    for (const entry of diary.data?.entries || []) {
      const energyValue = entry.nutrients.find((nutrient) => nutrient.nutrientKey === "energy_kcal");
      const current = summaries.get(entry.mealSlot) || { entries: 0, recordedEnergyEntries: 0, energyKcal: 0 };
      current.entries += 1;
      if (energyValue) {
        current.recordedEnergyEntries += 1;
        current.energyKcal += energyValue.amountPer100g * entry.servingGrams / 100;
      }
      summaries.set(entry.mealSlot, current);
    }
    return Array.from(summaries, ([mealSlot, summary]) => ({ mealSlot, ...summary, energyKcal: Number(summary.energyKcal.toFixed(1)) }));
  }, [diary.data?.entries]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/nutrition/foods"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/nutrition/diary"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/nutrition/trends"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/nutrition/contributions"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/nutrition/recipes"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/targets"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/health-fitness/target-revisions"] }),
  ]);
  const createFood = useMutation({
    mutationFn: () => apiRequest<{ food: Food }>(editingFoodId ? `/api/nutrition/foods/${editingFoodId}` : "/api/nutrition/foods", { method: editingFoodId ? "PATCH" : "POST", body: JSON.stringify({
      name: foodName, servingSizeGrams: Number(foodServingSize), densityGramsPerMl: foodDensity === "" ? null : Number(foodDensity), favorite: editingFoodId ? Boolean(selectedFood?.favorite) : false,
      nutrients: [
        { nutrientKey: "energy_kcal", amountPer100g: Number(energy) },
        { nutrientKey: "protein_g", amountPer100g: Number(protein) || 0 },
        { nutrientKey: "carbohydrate_g", amountPer100g: Number(carbs) || 0 },
        { nutrientKey: "fat_g", amountPer100g: Number(fat) || 0 },
        ...Object.entries(extraNutrients).filter(([, value]) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0).map(([nutrientKey, value]) => ({ nutrientKey, amountPer100g: Number(value) })),
      ],
    }) }),
    onSuccess: ({ food }) => { setFoodName(""); setEnergy(""); setProtein("0"); setCarbs("0"); setFat("0"); setExtraNutrients({}); setFoodServingSize("100"); setFoodDensity(""); setEditingFoodId(null); setSelectedFoodId(String(food.id)); void refresh(); },
  });
  const savePortion = useMutation({
    mutationFn: () => apiRequest(`/api/nutrition/foods/${selectedFoodId}/portions`, { method: "POST", body: JSON.stringify({ label: portionLabel, gramsPerUnit: Number(portionGrams) }) }),
    onSuccess: () => { setPortionLabel(""); setPortionGrams(""); void refresh(); },
  });
  const removePortion = useMutation({ mutationFn: (id: number) => apiRequest(`/api/nutrition/food-portions/${id}`, { method: "DELETE" }), onSuccess: () => { setInputPortionId(""); void refresh(); } });
  const toggleFavorite = useMutation({ mutationFn: (food: Food) => apiRequest(`/api/nutrition/foods/${food.id}/favorite`, { method: "PATCH", body: JSON.stringify({ favorite: !food.favorite }) }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["/api/nutrition/foods"] }) });
  const logFood = useMutation({
    mutationFn: async () => {
      if (editingEntryId) return apiRequest(`/api/nutrition/diary/${editingEntryId}`, { method: "PATCH", body: JSON.stringify({ quantity: Number(servingGrams), inputUnit, portionId: inputUnit === "portion" ? Number(inputPortionId) : null, mealSlot }) });
      if (!user?.id) throw new Error("Sign in before recording nutrition.");
      return submitHealthMutation({ userId: user.id, url: "/api/nutrition/diary", body: { foodId: Number(selectedFoodId), quantity: Number(servingGrams), inputUnit, portionId: inputUnit === "portion" ? Number(inputPortionId) : null, mealSlot, occurredAt: localDateTimeIso(date, entryTime) } });
    },
    onSuccess: (result) => { setServingGrams(inputUnit === "serving" ? "1" : selectedFood ? String(selectedFood.servingSizeGrams) : "100"); setEditingEntryId(null); if (result && typeof result === "object" && "queued" in result && result.queued) { void queryClient.invalidateQueries({ queryKey: ["health-offline-queue", user?.id] }); toast({ title: "Nutrition record saved on this device", description: "LyfeOS will add it to your account when this device is online." }); } else void refresh(); },
    onError: (error: Error) => toast({ title: "Nutrition record was not saved", description: error.message, variant: "destructive" }),
  });
  const createRecipe = useMutation({
    mutationFn: () => { const currentRevision = recipes.data?.recipes.find((recipe) => recipe.id === editingRecipeId)?.currentRevision; if (editingRecipeId && !currentRevision) throw new Error("Reload this recipe before saving changes."); return apiRequest<{ recipe: Recipe }>(editingRecipeId ? `/api/nutrition/recipes/${editingRecipeId}` : "/api/nutrition/recipes", { method: editingRecipeId ? "PATCH" : "POST", headers: editingRecipeId ? { "x-lyfeos-expected-revision": String(currentRevision) } : undefined, body: JSON.stringify({ name: recipeName, servings: Number(recipeServings), folder: recipeFolder || null, ingredients: recipeIngredients.map((ingredient) => ({ foodId: Number(ingredient.foodId), grams: Number(ingredient.grams) })) }) }); },
    onSuccess: ({ recipe }) => { setRecipeName(""); setRecipeServings("1"); setRecipeFolder(""); setRecipeIngredients([{ foodId: "", grams: "100" }]); setEditingRecipeId(null); setSelectedRecipeId(String(recipe.id)); void refresh(); },
    onError: (error: Error) => toast({ title: error.message.startsWith("409:") ? "A newer recipe version exists" : "Recipe was not saved", description: error.message.startsWith("409:") ? "Your unsaved ingredients remain here. Reload the recipe before trying again." : error.message, variant: "destructive" }),
  });
  const removeRecipe = useMutation({ mutationFn: (id: number) => apiRequest(`/api/nutrition/recipes/${id}`, { method: "DELETE" }), onSuccess: () => { setSelectedRecipeId(""); setEditingRecipeId(null); void refresh(); } });
  const restoreRecipeRevision = useMutation({
    mutationFn: () => { const currentRevision = recipes.data?.recipes.find((recipe) => recipe.id === Number(selectedRecipeId))?.currentRevision; if (!currentRevision) throw new Error("Reload this recipe before restoring a version."); return apiRequest(`/api/nutrition/recipes/${selectedRecipeId}/revisions/${selectedRecipeRevision}/restore`, { method: "POST", headers: { "x-lyfeos-expected-revision": String(currentRevision) } }); },
    onSuccess: () => { setSelectedRecipeRevision(""); void Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ["/api/nutrition/recipes/revisions"] })]); },
  });
  const logRecipe = useMutation({
    mutationFn: () => apiRequest(`/api/nutrition/recipes/${selectedRecipeId}/log`, { method: "POST", body: JSON.stringify({ servings: Number(recipeLogServings), mealSlot, occurredAt: localDateTimeIso(date, entryTime) }) }),
    onSuccess: () => { void refresh(); },
  });
  const copyPreviousDay = useMutation({
    mutationFn: () => apiRequest("/api/nutrition/diary/copy-day", { method: "POST", body: JSON.stringify({ sourceDate: previousDay(date), targetDate: date }) }),
    onSuccess: () => { void refresh(); },
  });
  const copyPreviousMeal = useMutation({
    mutationFn: () => apiRequest("/api/nutrition/diary/copy-meal", { method: "POST", body: JSON.stringify({ sourceDate: previousDay(date), targetDate: date, sourceMealSlot: mealSlot, targetMealSlot: mealSlot }) }),
    onSuccess: () => { void refresh(); },
  });
  const removeEntry = useMutation({
    mutationFn: (id: number) => apiRequest<{ receiptId: string; expiresAt: string }>(`/api/nutrition/diary/${id}`, { method: "DELETE" }),
    onSuccess: (receipt) => { setDeletedEntry(receipt); void refresh(); },
  });
  const restoreEntry = useMutation({
    mutationFn: (receiptId: string) => apiRequest(`/api/nutrition/diary/deletions/${receiptId}/restore`, { method: "POST" }),
    onSuccess: () => { setDeletedEntry(null); void refresh(); },
    onError: () => { setDeletedEntry(null); toast({ title: "Undo is no longer available", variant: "destructive" }); },
  });
  const saveNutritionTarget = useMutation({
    mutationFn: () => apiRequest(editingTarget ? `/api/health-fitness/targets/${editingTarget.id}` : "/api/health-fitness/targets", { method: editingTarget ? "PATCH" : "POST", headers: editingTarget ? { "x-lyfeos-expected-revision": String(editingTarget.revision) } : undefined, body: JSON.stringify({ kind: targetKind, targetValue: Number(targetValue), unit: nutritionTargetUnit(targetKind), effectiveFrom: targetFrom, effectiveTo: targetTo || null, weekdays: targetWeekdays, rationale: targetRationale || null, source: editingTarget?.source || "user", calculationVersion: editingTarget?.calculationVersion || null, methodId: editingTarget?.methodId || null, methodVersion: editingTarget?.methodVersion || null, note: editingTarget?.note || null }) }),
    onSuccess: () => { setTargetValue(""); setTargetFrom(today()); setTargetTo(""); setTargetWeekdays([]); setTargetRationale(""); setEditingTarget(null); void refresh(); },
    onError: (error: Error) => toast({ title: error.message.startsWith("409:") ? "A newer target version exists" : "Target was not saved", description: error.message.startsWith("409:") ? "Your unsaved values remain here. Reload the targets before trying again." : error.message, variant: "destructive" }),
  });
  const removeNutritionTarget = useMutation({
    mutationFn: (id: number) => {
      const target = targets.data?.targets.find((candidate) => candidate.id === id);
      if (!target) throw new Error("Reload this target before deleting it.");
      return apiRequest(`/api/health-fitness/targets/${target.id}`, { method: "DELETE", headers: { "x-lyfeos-expected-revision": String(target.revision) } });
    },
    onSuccess: () => { setEditingTarget(null); void refresh(); },
    onError: (error: Error) => toast({ title: error.message.startsWith("409:") ? "Target changed before deletion" : "Target was not deleted", description: "Reload the targets and try again.", variant: "destructive" }),
  });

  const kcal = diary.data?.totals.energy_kcal?.amount || 0;
  const macro = (key: string) => diary.data?.totals[key]?.amount || 0;
  const currentTarget = (kind: string) => { const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay(); return targets.data?.targets.find((target) => target.kind === kind && target.effectiveFrom <= date && (!target.effectiveTo || target.effectiveTo >= date) && (!target.weekdays?.length || target.weekdays.includes(weekday))); };
  const targetValueLabel = (kind: string, value: number, unit: string) => { const target = currentTarget(kind); if (kind === "energy") { const displayedTarget = target ? energyFromKcal(target.unit === "kJ" ? energyToKcal(target.targetValue, "kJ") : target.targetValue, energyUnit) : null; return displayedTarget === null ? `${Math.round(displayEnergy(value))} ${energyUnit}` : `${Math.round(displayEnergy(value))} / ${Math.round(displayedTarget)} ${energyUnit}`; } return target ? `${Math.round(value)} / ${target.targetValue} ${unit}` : `${Math.round(value)} ${unit}`; };
  const legacyTargetKind: Record<string, string> = { energy_kcal: "energy", protein_g: "protein", carbohydrate_g: "carbohydrate", fat_g: "fat", fiber_g: "fiber", sugar_g: "sugar", sodium_mg: "sodium" };
  const dailyNutrientRows = (nutrientRegistry.data?.nutrients || []).map((nutrient) => {
    const total = diary.data?.totals[nutrient.nutrientKey];
    const target = currentTarget(nutrient.nutrientKey) || (legacyTargetKind[nutrient.nutrientKey] ? currentTarget(legacyTargetKind[nutrient.nutrientKey]) : undefined);
    const recordedEntries = diary.data?.entries.filter((entry) => entry.nutrients.some((value) => value.nutrientKey === nutrient.nutrientKey)).length || 0;
    const energyMetric = nutrient.nutrientKey === "energy_kcal";
    const targetUnitMatches = !target || target.unit === nutrient.unit || (energyMetric && ["kcal", "kJ"].includes(target.unit));
    const comparableTotal = total && energyMetric && target?.unit === "kJ" ? energyFromKcal(total.amount, "kJ") : total?.amount;
    return { ...nutrient, displayTotal: total && energyMetric ? displayEnergy(total.amount) : total?.amount ?? null, displayUnit: energyMetric ? energyUnit : nutrient.unit, total: total?.amount ?? null, recordedEntries, totalEntries: diary.data?.entries.length || 0, target: targetUnitMatches ? target : undefined, targetUnitMismatch: Boolean(target && !targetUnitMatches), percent: comparableTotal != null && target && targetUnitMatches ? Number((comparableTotal / target.targetValue * 100).toFixed(1)) : null };
  });
  const selectedContribution = contributions.data?.nutrients.find((nutrient) => nutrient.nutrientKey === contributionNutrient);
  const selectedRecipe = recipes.data?.recipes.find((recipe) => recipe.id === Number(selectedRecipeId));
  const recipePerServing = useMemo(() => {
    if (!selectedRecipe || !foods.data?.foods.length) return null;
    const totals: Record<string, { amount: number; unit: string }> = {};
    for (const ingredient of selectedRecipe.ingredients) {
      const food = foods.data.foods.find((item) => item.id === ingredient.foodId);
      if (!food) continue;
      for (const nutrient of food.nutrients) {
        const current = totals[nutrient.nutrientKey] || { amount: 0, unit: nutrient.unit };
        current.amount += nutrient.amountPer100g * (ingredient.grams / selectedRecipe.servings / 100);
        totals[nutrient.nutrientKey] = current;
      }
    }
    return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, { ...value, amount: Number(value.amount.toFixed(2)) }]));
  }, [foods.data?.foods, selectedRecipe]);
  const beginFoodEdit = (food: Food) => {
    setEditingFoodId(food.id); setFoodName(food.name); setFoodServingSize(String(food.servingSizeGrams));
    setFoodDensity(food.densityGramsPerMl == null ? "" : String(food.densityGramsPerMl));
    setEnergy(String(food.nutrients.find((nutrient) => nutrient.nutrientKey === "energy_kcal")?.amountPer100g ?? 0));
    setProtein(String(food.nutrients.find((nutrient) => nutrient.nutrientKey === "protein_g")?.amountPer100g ?? 0));
    setCarbs(String(food.nutrients.find((nutrient) => nutrient.nutrientKey === "carbohydrate_g")?.amountPer100g ?? 0));
    setFat(String(food.nutrients.find((nutrient) => nutrient.nutrientKey === "fat_g")?.amountPer100g ?? 0));
    setExtraNutrients(Object.fromEntries(food.nutrients.filter((nutrient) => !coreNutrientKeys.has(nutrient.nutrientKey)).map((nutrient) => [nutrient.nutrientKey, String(nutrient.amountPer100g)])));
  };
  const downloadNutritionReport = async () => {
    setReportDownloadError(false);
    try {
      const response = await fetch(`/api/nutrition/reports/daily.csv?days=${trendDays}`, { credentials: "include", headers: timeContextHeaders() });
      if (!response.ok) throw new Error("Nutrition report export failed");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lyfeos-nutrition-${today()}-${trendDays}d.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setReportDownloadError(true);
    }
  };
  return (
    <section className="glassmorphic rounded-2xl p-6 mb-8 border border-primary/30" aria-labelledby="nutrition-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 id="nutrition-heading" className="font-orbitron text-lg text-primary flex items-center gap-2"><Apple className="h-5 w-5" />Nutrition diary</h2><p className="text-sm text-muted-foreground mt-1">A factual food diary. Calories and macros come only from records you log.</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={Boolean(diary.data?.entries.length) || copyPreviousDay.isPending} onClick={() => copyPreviousDay.mutate()}>Copy previous day</Button><Button variant="outline" size="sm" onClick={() => setExpanded((value) => !value)}><ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} />{expanded ? "Close" : "Log food"}</Button></div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><Button variant="ghost" size="icon" aria-label="Previous diary day" onClick={() => setDate(previousDay(date))}><ChevronLeft className="h-4 w-4" /></Button><Input aria-label="Diary date" className="w-40" type="date" max={today()} value={date} onChange={(event) => event.target.value && setDate(event.target.value)} /><Button variant="ghost" size="icon" aria-label="Next diary day" disabled={date >= today()} onClick={() => setDate(nextDay(date))}><ChevronRight className="h-4 w-4" /></Button>{date !== today() ? <Button variant="ghost" size="sm" onClick={() => setDate(today())}>Today</Button> : <span className="text-xs text-muted-foreground">Today</span>}</div>
      <div className="grid grid-cols-4 gap-2 mt-5">
        {[{ label: "Energy", value: targetValueLabel("energy", kcal, energyUnit) }, { label: "Protein", value: targetValueLabel("protein", macro("protein_g"), "g") }, { label: "Carbs", value: targetValueLabel("carbohydrate", macro("carbohydrate_g"), "g") }, { label: "Fat", value: targetValueLabel("fat", macro("fat_g"), "g") }].map((item) => <div key={item.label} className="rounded-lg border border-primary/15 bg-background/30 p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p><p className="font-mono text-sm text-primary mt-1">{item.value}</p></div>)}
      </div>
      {mealSummaries.length ? <div className="mt-3 flex flex-wrap gap-2" aria-label="Meal summaries">{mealSummaries.map((meal) => <span key={meal.mealSlot} className="rounded-md border border-muted/20 bg-background/20 px-2 py-1 text-xs"><span className="capitalize">{meal.mealSlot}</span> · {meal.recordedEnergyEntries ? `${Math.round(displayEnergy(meal.energyKcal))} ${energyUnit}` : "energy unknown"} · {meal.entries} {meal.entries === 1 ? "entry" : "entries"}</span>)}</div> : null}
      {dailyNutrientRows.length ? <details className="mt-3 rounded-lg border border-primary/15 bg-background/20 p-3"><summary className="cursor-pointer text-sm font-semibold">Daily nutrient details and chosen targets</summary><p className="mt-1 text-xs text-muted-foreground">Blank nutrient fields remain unknown. Percentages compare recorded values only with your own active target; they are not health or adherence judgments.</p><div className="mt-3 max-h-80 overflow-auto"><table className="w-full min-w-[42rem] text-left text-xs"><caption className="sr-only">Recorded nutrient coverage and user-selected target comparison for {date}</caption><thead className="sticky top-0 bg-background"><tr className="border-b border-muted/20"><th scope="col" className="p-2">Nutrient</th><th scope="col" className="p-2">Recorded value</th><th scope="col" className="p-2">Entry coverage</th><th scope="col" className="p-2">Chosen target</th><th scope="col" className="p-2">Recorded / target</th></tr></thead><tbody>{dailyNutrientRows.map((nutrient) => <tr className="border-b border-muted/10" key={nutrient.nutrientKey}><th scope="row" className="p-2 font-normal">{nutrient.label}</th><td className="p-2 font-mono">{nutrient.total === null ? "Unknown" : `${Number(nutrient.total.toFixed(2))} ${nutrient.unit}`}</td><td className="p-2">{nutrient.recordedEntries} of {nutrient.totalEntries} entries</td><td className="p-2">{nutrient.target ? `${nutrient.target.targetValue} ${nutrient.target.unit}` : nutrient.targetUnitMismatch ? "Unit mismatch—review target" : "Not set"}</td><td className="p-2">{nutrient.percent === null ? "Not available" : `${nutrient.percent}%`}</td></tr>)}</tbody></table></div></details> : null}
      {trends.data ? <div className="mt-5 rounded-lg border border-primary/15 bg-background/20 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold">Recorded nutrition history</h3><p className="mt-1 text-xs text-muted-foreground">Gaps mean no recorded value, not zero intake.</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Nutrition history period" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={trendDays} onChange={(event) => { setTrendDays(Number(event.target.value)); setReportDownloadError(false); }}>{[7, 14, 30, 90, 365].map((days) => <option key={days} value={days}>{days === 365 ? "1 year" : `${days} days`}</option>)}</select>
            <Button size="sm" variant="outline" onClick={downloadNutritionReport}><Download />Export CSV</Button>
          </div>
        </div>
        {trends.data.trend.some((day) => day.entries > 0) ? <div className="mt-3 h-40" role="img" aria-label={`Recorded daily energy over ${trendDays} days`}><ResponsiveContainer width="100%" height="100%"><LineChart data={trends.data.trend}><XAxis dataKey="date" tickFormatter={(value) => value.slice(5)} tick={{ fontSize: 10 }} /><YAxis width={36} tick={{ fontSize: 10 }} /><Tooltip labelFormatter={(value) => value} /><Line type="monotone" dataKey="energyKcal" name="Energy (kcal)" stroke="hsl(var(--primary))" strokeWidth={2} connectNulls={false} dot={false} /></LineChart></ResponsiveContainer></div> : <p className="mt-3 text-xs text-muted-foreground">No diary entries are recorded in this period.</p>}
        <details className="mt-3 rounded-md border border-muted/20 p-2"><summary className="cursor-pointer text-xs text-muted-foreground">Compare with the immediately preceding period</summary><p className="mt-2 text-[11px] text-muted-foreground">Side-by-side recorded evidence only. Averages divide by days with a recorded nutrient value, never by missing days.</p><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-xs"><caption className="sr-only">Current and preceding nutrition recording periods</caption><thead><tr><th className="p-2" scope="col">Measure</th><th className="p-2" scope="col">Current {trends.data.comparison.periods.current.startDate}–{trends.data.comparison.periods.current.endDate}</th><th className="p-2" scope="col">Previous {trends.data.comparison.periods.previous.startDate}–{trends.data.comparison.periods.previous.endDate}</th></tr></thead><tbody><tr className="border-t border-muted/10"><th className="p-2 font-normal" scope="row">Days with diary records</th><td className="p-2">{trends.data.comparison.current.diaryDays} of {trends.data.comparison.current.days}</td><td className="p-2">{trends.data.comparison.previous.diaryDays} of {trends.data.comparison.previous.days}</td></tr><tr className="border-t border-muted/10"><th className="p-2 font-normal" scope="row">Diary entries</th><td className="p-2">{trends.data.comparison.current.diaryEntries}</td><td className="p-2">{trends.data.comparison.previous.diaryEntries}</td></tr>{([['Energy', 'energyKcal', 'kcal'], ['Protein', 'proteinGrams', 'g'], ['Carbohydrate', 'carbohydrateGrams', 'g'], ['Fat', 'fatGrams', 'g']] as const).map(([label, key, unit]) => <tr className="border-t border-muted/10" key={key}><th className="p-2 font-normal" scope="row">{label} average per recorded day</th>{([trends.data.comparison.current[key], trends.data.comparison.previous[key]] as NutritionPeriodMetric[]).map((metric, index) => <td className="p-2" key={index}>{metric.averagePerRecordedDay === null ? "Unknown" : `${metric.averagePerRecordedDay} ${unit}`} <span className="text-muted-foreground">· {metric.recordedDays}/{trendDays} days covered</span></td>)}</tr>)}</tbody></table></div></details>
        <details className="mt-3 rounded-md border border-muted/20 p-2"><summary className="cursor-pointer text-xs text-muted-foreground">View accessible nutrition history table</summary><div className="mt-2 max-h-64 overflow-auto"><table className="w-full min-w-[38rem] text-left text-xs"><caption className="sr-only">Recorded nutrition values by local calendar date</caption><thead><tr className="border-b border-muted/20"><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Diary entries</th><th scope="col" className="p-2">Energy (kcal)</th><th scope="col" className="p-2">Protein (g)</th><th scope="col" className="p-2">Carbohydrate (g)</th><th scope="col" className="p-2">Fat (g)</th></tr></thead><tbody>{trends.data.trend.map((day) => <tr key={day.date} className="border-b border-muted/10"><th scope="row" className="p-2 font-normal">{day.date}</th><td className="p-2">{day.entries}</td><td className="p-2">{trendValueLabel(day.energyKcal, day.entries)}</td><td className="p-2">{trendValueLabel(day.proteinGrams, day.entries)}</td><td className="p-2">{trendValueLabel(day.carbohydrateGrams, day.entries)}</td><td className="p-2">{trendValueLabel(day.fatGrams, day.entries)}</td></tr>)}</tbody></table></div></details>
        <p className="mt-2 text-xs text-muted-foreground">{trends.data.disclosure}</p>
        {reportDownloadError ? <p className="mt-2 text-xs text-destructive" role="alert">Could not download the nutrition report.</p> : null}
      </div> : null}
      {contributions.data ? <div className="mt-5 rounded-lg border border-primary/15 bg-background/20 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold">Food contribution report</h3><p className="text-xs text-muted-foreground mt-1">Which logged foods supplied each recorded nutrient value.</p></div><select aria-label="Contribution nutrient" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={contributionNutrient} onChange={(event) => setContributionNutrient(event.target.value)}>{contributions.data.nutrients.map((nutrient) => <option key={nutrient.nutrientKey} value={nutrient.nutrientKey}>{nutrient.label}</option>)}</select></div>{selectedContribution ? <div className="mt-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-mono text-sm text-primary">{selectedContribution.total === null ? "Not recorded" : `${selectedContribution.total} ${selectedContribution.unit}`}</p><p className="text-xs text-muted-foreground">Coverage: {selectedContribution.recordedEntries} of {selectedContribution.totalEntries} diary entries</p></div>{selectedContribution.contributions.length ? <div className="mt-2 space-y-1">{selectedContribution.contributions.slice(0, 8).map((food) => <div key={food.foodId} className="flex items-center justify-between gap-3 rounded-md border border-muted/20 px-2 py-1.5 text-xs"><span>{food.foodName} <span className="text-muted-foreground">· {food.entryCount} {food.entryCount === 1 ? "entry" : "entries"}</span></span><span className="font-mono">{food.amount} {selectedContribution.unit}</span></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">{contributions.data.totalEntries ? "No recorded value for this nutrient in the selected period." : "No diary entries are recorded in this period."}</p>}</div> : null}<p className="mt-2 text-xs text-muted-foreground">{contributions.data.disclosure}</p></div> : null}
      {expanded && <div className="grid gap-4 lg:grid-cols-2 mt-5 pt-5 border-t border-muted/20">
        <Suspense fallback={<div className="rounded-xl border border-primary/15 bg-background/25 p-4 text-xs text-muted-foreground">Loading catalog…</div>}><FoodCatalogSearch selectedFood={selectedFood} onImported={(foodId) => { setSelectedFoodId(String(foodId)); void refresh(); }} /></Suspense>
        <div className="rounded-xl border border-primary/15 bg-background/25 p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Utensils className="h-4 w-4 text-primary" />Log saved food</h3>
          <div className="grid gap-2 mt-3"><select aria-label="Choose saved food" disabled={editingEntryId !== null} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedFoodId} onChange={(event) => { setSelectedFoodId(event.target.value); setInputPortionId(""); const food = foods.data?.foods.find((item) => item.id === Number(event.target.value)); if (food) setServingGrams(inputUnit === "serving" ? "1" : String(food.servingSizeGrams)); }}><option value="">Choose a food</option>{foods.data?.foods.map((food) => <option key={food.id} value={food.id}>{food.favorite ? "★ " : ""}{food.name}{food.brand ? ` — ${food.brand}` : ""}{food.recentUseCount ? ` · used ${food.recentUseCount}×` : ""}</option>)}</select><div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Input aria-label="Food quantity" type="number" min="0.01" step="0.01" value={servingGrams} onChange={(event) => setServingGrams(event.target.value)} /><select aria-label="Food quantity unit" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={inputUnit} onChange={(event) => { const nextUnit = event.target.value as "g" | "serving" | "ml" | "portion"; setInputUnit(nextUnit); setInputPortionId(nextUnit === "portion" ? String(selectedFood?.portions[0]?.id || "") : ""); setServingGrams(nextUnit === "g" ? selectedFood ? String(selectedFood.servingSizeGrams) : "100" : "1"); }}><option value="g">grams</option><option value="serving">servings</option>{selectedFood?.densityGramsPerMl ? <option value="ml">milliliters</option> : null}{selectedFood?.portions.length ? <option value="portion">saved portion</option> : null}</select><select aria-label="Meal" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={mealSlot} onChange={(event) => setMealSlot(event.target.value)}>{["breakfast", "lunch", "dinner", "snack", "other"].map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select><Input aria-label="Meal time" type="time" disabled={editingEntryId !== null} value={entryTime} onChange={(event) => setEntryTime(event.target.value)} /></div>{editingEntryId ? <p className="text-[11px] text-muted-foreground">This correction keeps the entry’s original recorded time.</p> : null}{inputUnit === "portion" ? <select aria-label="Saved food portion" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={inputPortionId} onChange={(event) => setInputPortionId(event.target.value)}>{selectedFood?.portions.map((portion) => <option key={portion.id} value={portion.id}>{portion.label} · {portion.gramsPerUnit} g each</option>)}</select> : null}{selectedFood && inputUnit === "serving" ? <p className="text-xs text-muted-foreground">1 serving = {selectedFood.servingSizeGrams} g for this food.</p> : null}{selectedFood && inputUnit === "ml" ? <p className="text-xs text-muted-foreground">1 ml = {selectedFood.densityGramsPerMl} g using this food’s saved density.</p> : null}<div className="flex flex-wrap gap-2"><Button disabled={!selectedFoodId || invalidNumber(servingGrams) || (!editingEntryId && !entryTime) || (inputUnit === "portion" && !inputPortionId) || logFood.isPending} onClick={() => logFood.mutate()}>{editingEntryId ? <Pencil /> : <Plus />}{editingEntryId ? "Update entry" : "Add to diary"}</Button>{editingEntryId ? <Button variant="ghost" onClick={() => setEditingEntryId(null)}>Cancel</Button> : <Button variant="ghost" disabled={copyPreviousMeal.isPending} onClick={() => copyPreviousMeal.mutate()}>Copy previous {mealSlot}</Button>}</div>{copyPreviousMeal.error ? <p className="text-xs text-destructive">Could not copy that meal. The source must have entries and the target meal must be empty.</p> : null}</div>
          {selectedFood && !editingEntryId ? <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" disabled={toggleFavorite.isPending} onClick={() => toggleFavorite.mutate(selectedFood)}><Star className={selectedFood.favorite ? "fill-current" : ""} />{selectedFood.favorite ? "Favorited" : "Favorite"}</Button><Button size="sm" variant="ghost" onClick={() => beginFoodEdit(selectedFood)}><Pencil />Edit saved food</Button></div> : null}
        </div>
        <div className="rounded-xl border border-primary/15 bg-background/25 p-4">
          <h3 className="text-sm font-semibold">{editingFoodId ? "Correct saved food" : "Create a food from its label"}</h3><p className="text-xs text-muted-foreground mt-1">Values are per 100 g and remain marked as manual. Corrections affect future logs; saved diary snapshots stay unchanged.</p>
          <div className="grid grid-cols-2 gap-2 mt-3"><Input aria-label="Food name" className="col-span-2" placeholder="Food name" value={foodName} onChange={(event) => setFoodName(event.target.value)} /><Input aria-label="Serving size grams" type="number" min="0.01" step="0.01" placeholder="Serving grams" value={foodServingSize} onChange={(event) => setFoodServingSize(event.target.value)} /><Input aria-label="Food density grams per milliliter" type="number" min="0.001" step="any" placeholder="Optional g per ml" value={foodDensity} onChange={(event) => setFoodDensity(event.target.value)} /><Input aria-label="Calories per 100 grams" type="number" min="0" placeholder="Calories" value={energy} onChange={(event) => setEnergy(event.target.value)} /><Input aria-label="Protein grams per 100 grams" type="number" min="0" placeholder="Protein g" value={protein} onChange={(event) => setProtein(event.target.value)} /><Input aria-label="Carbohydrate grams per 100 grams" type="number" min="0" placeholder="Carbs g" value={carbs} onChange={(event) => setCarbs(event.target.value)} /><Input aria-label="Fat grams per 100 grams" type="number" min="0" placeholder="Fat g" value={fat} onChange={(event) => setFat(event.target.value)} /></div><details className="mt-3 rounded-md border border-muted/20 p-2"><summary className="cursor-pointer text-xs font-medium">Optional fiber, fats, vitamins, minerals, and amino acids</summary><p className="mt-1 text-xs text-muted-foreground">Enter only values shown by your source. Blank stays unknown; a recorded 0 remains zero.</p><div className="mt-2 grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1">{nutrientRegistry.data?.nutrients.filter((nutrient) => !coreNutrientKeys.has(nutrient.nutrientKey)).map((nutrient) => <label className="text-xs text-muted-foreground" key={nutrient.nutrientKey}>{nutrient.label} ({nutrient.unit})<Input aria-label={`${nutrient.label} per 100 grams`} className="mt-1" type="number" min="0" step="any" placeholder="Unknown" value={extraNutrients[nutrient.nutrientKey] || ""} onChange={(event) => setExtraNutrients((values) => ({ ...values, [nutrient.nutrientKey]: event.target.value }))} /></label>)}</div><p className="mt-2 text-xs text-muted-foreground">{nutrientRegistry.data?.disclosure}</p></details><div className="flex gap-2 mt-2"><Button className="flex-1" variant="outline" disabled={!foodName.trim() || energy === "" || !Number.isFinite(Number(energy)) || Number(energy) < 0 || invalidNumber(foodServingSize) || (foodDensity !== "" && invalidNumber(foodDensity)) || Object.values(extraNutrients).some((value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) || createFood.isPending} onClick={() => createFood.mutate()}>{editingFoodId ? <Pencil /> : <Plus />}{editingFoodId ? "Update food" : "Save food"}</Button>{editingFoodId ? <Button variant="ghost" onClick={() => { setEditingFoodId(null); setFoodName(""); setEnergy(""); setExtraNutrients({}); setFoodServingSize("100"); setFoodDensity(""); }}>Cancel</Button> : null}</div>{selectedFood ? <div className="mt-3 rounded-md border border-muted/20 p-2"><p className="text-xs font-medium">Saved household portions for {selectedFood.name}</p><p className="mt-1 text-xs text-muted-foreground">Use a label-specific measured weight; LyfeOS never assumes a universal cup or spoon conversion.</p><div className="mt-2 flex flex-wrap gap-2"><Input aria-label="Portion label" className="min-w-32 flex-1" placeholder="e.g. 1 cup" value={portionLabel} onChange={(event) => setPortionLabel(event.target.value)} /><Input aria-label="Portion grams" className="w-28" type="number" min="0.01" step="any" placeholder="grams" value={portionGrams} onChange={(event) => setPortionGrams(event.target.value)} /><Button variant="outline" size="sm" disabled={!portionLabel.trim() || invalidNumber(portionGrams) || savePortion.isPending} onClick={() => savePortion.mutate()}><Plus />Portion</Button></div>{selectedFood.portions.length ? <div className="mt-2 flex flex-wrap gap-2">{selectedFood.portions.map((portion) => <span key={portion.id} className="inline-flex items-center gap-1 rounded-md border border-muted/20 px-2 py-1 text-xs">{portion.label} · {portion.gramsPerUnit} g<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${portion.label} portion`} onClick={() => removePortion.mutate(portion.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}</div> : null}
        </div>
        <div className="rounded-xl border border-primary/15 bg-background/25 p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold">Repeatable meals</h3><p className="text-xs text-muted-foreground mt-1">Save the ingredients and quantities of a real meal. Recipe composition is retained separately from your diary.</p>
          <div className="grid gap-2 mt-3 sm:grid-cols-[1fr_8rem_10rem]"><Input aria-label="Recipe name" placeholder="Meal name" value={recipeName} onChange={(event) => setRecipeName(event.target.value)} /><Input aria-label="Recipe yield servings" type="number" min="0.01" step="0.01" placeholder="Servings" value={recipeServings} onChange={(event) => setRecipeServings(event.target.value)} /><Input aria-label="Recipe folder" placeholder="Folder" value={recipeFolder} onChange={(event) => setRecipeFolder(event.target.value)} /></div>
          <div className="space-y-2 mt-2">{recipeIngredients.map((ingredient, index) => <div className="grid grid-cols-[1fr_7rem_auto] gap-2" key={index}><select aria-label={`Recipe ingredient ${index + 1}`} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={ingredient.foodId} onChange={(event) => setRecipeIngredients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, foodId: event.target.value } : item))}><option value="">Choose a food</option>{foods.data?.foods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}</select><Input aria-label={`Ingredient ${index + 1} grams`} type="number" min="1" placeholder="Grams" value={ingredient.grams} onChange={(event) => setRecipeIngredients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, grams: event.target.value } : item))} /><Button variant="ghost" size="sm" aria-label={`Remove ingredient ${index + 1}`} disabled={recipeIngredients.length === 1} onClick={() => setRecipeIngredients((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button></div>)}</div>
          <div className="flex flex-wrap gap-2 mt-2"><Button variant="outline" size="sm" onClick={() => setRecipeIngredients((items) => [...items, { foodId: "", grams: "100" }])}><Plus />Ingredient</Button><Button variant="outline" size="sm" disabled={!recipeName.trim() || invalidNumber(recipeServings) || recipeIngredients.some((ingredient) => !ingredient.foodId || invalidNumber(ingredient.grams)) || new Set(recipeIngredients.map((ingredient) => ingredient.foodId)).size !== recipeIngredients.length || createRecipe.isPending} onClick={() => createRecipe.mutate()}>{editingRecipeId ? <Pencil /> : <Plus />}{editingRecipeId ? "Update meal" : "Save meal"}</Button>{editingRecipeId ? <Button variant="ghost" size="sm" onClick={() => { setEditingRecipeId(null); setRecipeName(""); setRecipeServings("1"); setRecipeIngredients([{ foodId: "", grams: "100" }]); }}>Cancel</Button> : null}</div>
          {recipes.data?.recipes.length ? <>
            <div className="flex flex-col gap-2 mt-3 sm:flex-row">
              <select aria-label="Saved meal" className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={selectedRecipeId} onChange={(event) => { setSelectedRecipeId(event.target.value); setSelectedRecipeRevision(""); setRecipeLogServings("1"); }}><option value="">Choose saved meal</option>{recipes.data.recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.folder ? `${recipe.folder} / ` : ""}{recipe.name} · {recipe.servings} servings · v{recipe.revisionCount}</option>)}</select>
              <Input aria-label="Consumed recipe servings" className="sm:w-28" type="number" min="0.01" step="0.01" value={recipeLogServings} onChange={(event) => setRecipeLogServings(event.target.value)} />
              <Input aria-label="Saved meal time" className="sm:w-28" type="time" value={entryTime} onChange={(event) => setEntryTime(event.target.value)} />
              <Button disabled={!selectedRecipeId || invalidNumber(recipeLogServings) || !entryTime || logRecipe.isPending} onClick={() => logRecipe.mutate()}><Plus />Log meal</Button>
              <Button variant="ghost" size="sm" disabled={!selectedRecipeId} onClick={() => { const recipe = recipes.data?.recipes.find((item) => item.id === Number(selectedRecipeId)); if (!recipe) return; setEditingRecipeId(recipe.id); setRecipeName(recipe.name); setRecipeServings(String(recipe.servings)); setRecipeFolder(recipe.folder || ""); setRecipeIngredients(recipe.ingredients.map((ingredient) => ({ foodId: String(ingredient.foodId), grams: String(ingredient.grams) }))); }}><Pencil />Edit</Button>
              <Button variant="ghost" size="sm" disabled={!selectedRecipeId || removeRecipe.isPending} onClick={() => removeRecipe.mutate(Number(selectedRecipeId))}><Trash2 />Delete</Button>
            </div>
            {recipePerServing ? <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground" aria-label="Recipe nutrition per serving">{[["Energy", "energy_kcal"], ["Protein", "protein_g"], ["Carbs", "carbohydrate_g"], ["Fat", "fat_g"]].map(([label, key]) => <span key={key} className="rounded-md border border-muted/20 px-2 py-1">{label}: {recipePerServing[key] ? `${recipePerServing[key].amount} ${recipePerServing[key].unit}` : "unknown"}</span>)}</div> : null}
            {recipeRevisions.data?.revisions.length && recipeRevisions.data.revisions.length > 1 ? <details className="mt-2 rounded-lg border border-muted/20 p-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">Compare or restore recipe history</summary>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row"><select aria-label="Recipe revision to inspect" className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm" value={selectedRecipeRevision} onChange={(event) => setSelectedRecipeRevision(event.target.value)}><option value="">Choose prior version</option>{recipeRevisions.data.revisions.slice(1).map((revision) => <option key={revision.revisionNumber} value={revision.revisionNumber}>v{revision.revisionNumber} · {revision.name} · {revision.servings} servings · {new Date(revision.createdAt).toLocaleDateString()}</option>)}</select><Button size="sm" variant="outline" disabled={!selectedRecipeRevision || restoreRecipeRevision.isPending} onClick={() => restoreRecipeRevision.mutate()}>Restore as new version</Button></div>
              {selectedRecipeRevision ? (() => { const prior = recipeRevisions.data?.revisions.find((revision) => revision.revisionNumber === Number(selectedRecipeRevision)); const current = recipes.data?.recipes.find((recipe) => recipe.id === Number(selectedRecipeId)); if (!prior || !current) return null; const changes = compareRecipeIngredients(current.ingredients, prior.ingredientsSnapshot); return <div className="mt-3 rounded-md border border-muted/20 p-2"><p className="text-xs text-white">Current v{current.currentRevision} compared with v{prior.revisionNumber}</p><p className="mt-1 text-[11px] text-muted-foreground">Name: {prior.name} → {current.name} · Yield: {prior.servings} → {current.servings} servings · Folder: {prior.folder || "none"} → {current.folder || "none"}</p><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-xs"><caption className="sr-only">Recipe ingredient changes from version {prior.revisionNumber} to current</caption><thead><tr><th className="p-1" scope="col">Ingredient</th><th className="p-1" scope="col">Prior grams</th><th className="p-1" scope="col">Current grams</th><th className="p-1" scope="col">Change</th></tr></thead><tbody>{changes.map((change) => <tr className="border-t border-muted/10" key={change.foodId}><th className="p-1 font-normal" scope="row">{foods.data?.foods.find((food) => food.id === change.foodId)?.name || `Food ${change.foodId}`}</th><td className="p-1">{change.priorGrams ?? "Not present"}</td><td className="p-1">{change.currentGrams ?? "Not present"}</td><td className="p-1">{change.change.replaceAll("_", " ")}</td></tr>)}</tbody></table></div><p className="mt-2 text-[11px] text-muted-foreground">Restoring creates a new latest version. It never rewrites this history or any diary entry already logged.</p></div>; })() : null}
              {restoreRecipeRevision.error ? <p role="alert" className="mt-2 text-xs text-destructive">That version could not be restored. Nothing was changed.</p> : null}
            </details> : null}
          </> : null}
        </div>
        <div className="rounded-xl border border-primary/15 bg-background/25 p-4 lg:col-span-2"><h3 className="text-sm font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4 text-primary" />Nutrition targets</h3><p className="text-xs text-muted-foreground mt-1">Optional user-set values only. LyfeOS does not calculate or prescribe them for you. Blank weekdays mean every day.</p><div className="grid gap-2 mt-3 sm:grid-cols-4"><select aria-label="Nutrition target kind" disabled={editingTarget !== null} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={targetKind} onChange={(event) => setTargetKind(event.target.value)}>{[["energy", "Energy (legacy kcal)"], ["protein", "Protein (legacy g)"], ["carbohydrate", "Carbohydrate (legacy g)"], ["fat", "Fat (legacy g)"], ...(nutrientRegistry.data?.nutrients.map((nutrient) => [nutrient.nutrientKey, `${nutrient.label} (${nutrient.unit})`]) || [])].map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><Input aria-label="Nutrition target value" type="number" min="0.0001" step="any" placeholder="Target" value={targetValue} onChange={(event) => setTargetValue(event.target.value)} /><Input aria-label="Target effective from" type="date" value={targetFrom} onChange={(event) => setTargetFrom(event.target.value)} /><Input aria-label="Target effective to" type="date" min={targetFrom} value={targetTo} onChange={(event) => setTargetTo(event.target.value)} /><Input aria-label="Target rationale" className="sm:col-span-4" placeholder="Optional reason you chose this target" value={targetRationale} onChange={(event) => setTargetRationale(event.target.value)} /><div className="flex flex-wrap gap-1 sm:col-span-4" aria-label="Target weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, day) => <Button key={label} type="button" size="sm" variant={targetWeekdays.includes(day) ? "default" : "outline"} aria-pressed={targetWeekdays.includes(day)} onClick={() => setTargetWeekdays((days) => days.includes(day) ? days.filter((item) => item !== day) : [...days, day])}>{label}</Button>)}</div><Button variant="outline" className="sm:col-span-2" disabled={invalidNumber(targetValue) || !targetFrom || (targetTo !== "" && targetTo < targetFrom) || saveNutritionTarget.isPending} onClick={() => saveNutritionTarget.mutate()}>{editingTarget ? <Pencil /> : <Plus />}{editingTarget ? "Update target" : "Set target"}</Button>{editingTarget ? <Button variant="ghost" className="sm:col-span-2" onClick={() => { setEditingTarget(null); setTargetValue(""); setTargetFrom(today()); setTargetTo(""); setTargetWeekdays([]); setTargetRationale(""); }}>Cancel</Button> : null}</div>{targets.data?.targets.filter((target) => isNutritionTarget(target.kind)).length ? <div className="flex flex-wrap gap-2 mt-3">{targets.data.targets.filter((target) => isNutritionTarget(target.kind)).slice(0, 20).map((target) => <span key={target.id} className="inline-flex items-center gap-1 rounded-md border border-muted/25 px-2 py-1 text-xs text-muted-foreground">{nutrientRegistry.data?.nutrients.find((nutrient) => nutrient.nutrientKey === target.kind)?.label || target.kind} · {target.targetValue} {target.unit} · {target.effectiveFrom}{target.effectiveTo ? `–${target.effectiveTo}` : "+"} · {target.weekdays?.length ? target.weekdays.map((day) => ["Su", "M", "Tu", "W", "Th", "F", "Sa"][day]).join("/") : "daily"}{target.rationale ? ` · ${target.rationale}` : ""}<Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Edit ${target.kind} target`} onClick={() => { setEditingTarget(target); setTargetKind(target.kind); setTargetValue(String(target.targetValue)); setTargetFrom(target.effectiveFrom); setTargetTo(target.effectiveTo || ""); setTargetWeekdays(target.weekdays || []); setTargetRationale(target.rationale || ""); }}><Pencil className="h-3 w-3" /></Button><Button variant="ghost" size="icon" className="h-5 w-5" aria-label={`Delete ${target.kind} target`} disabled={removeNutritionTarget.isPending} onClick={() => removeNutritionTarget.mutate(target.id)}><Trash2 className="h-3 w-3" /></Button></span>)}</div> : null}</div>
        {targetRevisions.data?.revisions.some((revision) => isNutritionTarget(revision.snapshot.kind)) ? <details className="rounded-lg border border-muted/20 p-3 lg:col-span-2"><summary className="cursor-pointer text-xs text-muted-foreground">Target change history</summary><div className="mt-2 space-y-1">{targetRevisions.data.revisions.filter((revision) => isNutritionTarget(revision.snapshot.kind)).slice(0, 30).map((revision) => <p className="text-[11px] text-muted-foreground" key={revision.id}>{new Date(revision.createdAt).toLocaleString()} · {revision.snapshot.kind} · {revision.action} · v{revision.revisionNumber} · {revision.snapshot.targetValue} {revision.snapshot.unit}</p>)}</div><p className="mt-2 text-[11px] text-muted-foreground">Edits and deletions add a private history record; they never rewrite earlier versions.</p></details> : null}
        {(createFood.error || logFood.error || createRecipe.error || logRecipe.error || copyPreviousDay.error || saveNutritionTarget.error) && <p className="text-xs text-destructive lg:col-span-2">Could not save your food diary record. Check the values and try again.</p>}
      </div>}
      {deletedEntry ? <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs" role="status"><span>Diary entry deleted. Undo is available for 10 minutes.</span><Button size="sm" variant="outline" disabled={restoreEntry.isPending} onClick={() => restoreEntry.mutate(deletedEntry.receiptId)}>Undo</Button></div> : null}
      {diary.data?.entries.length ? <div className="mt-5 space-y-2">{diary.data.entries.slice(0, 8).map((entry) => <div className="flex items-center justify-between gap-2 rounded-lg border border-muted/20 bg-background/20 px-3 py-2 text-sm" key={entry.id}><span>{entry.foodName} <span className="text-muted-foreground">· {entry.inputQuantity != null ? `${entry.inputQuantity} ${entry.inputUnitLabel || entry.inputUnit || "g"}` : `${entry.servingGrams} g`} · {entry.mealSlot}</span></span><div className="flex items-center gap-1"><span className="font-mono text-primary">{Math.round(entry.nutrients.find((nutrient) => nutrient.nutrientKey === "energy_kcal")?.amountPer100g || 0) * entry.servingGrams / 100} kcal</span><Button variant="ghost" size="icon" aria-label={`Edit ${entry.foodName} diary entry`} onClick={() => { setEditingEntryId(entry.id); setSelectedFoodId(String(entry.foodId)); setServingGrams(String(entry.inputQuantity ?? entry.servingGrams)); setInputUnit(entry.inputUnit || "g"); setInputPortionId(entry.inputPortionId ? String(entry.inputPortionId) : ""); setMealSlot(entry.mealSlot); setExpanded(true); }}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Delete ${entry.foodName} diary entry`} disabled={removeEntry.isPending} onClick={() => removeEntry.mutate(entry.id)}><Trash2 className="h-4 w-4" /></Button></div></div>)}</div> : <p className="text-sm text-muted-foreground mt-5">No foods logged today. Start with one label-based food; external food-data connections will be explicitly sourced and approved.</p>}
      {copyPreviousDay.error && !expanded && <p className="text-xs text-destructive mt-3">Could not copy yesterday. Copy is available only when today is empty and yesterday has entries.</p>}
    </section>
  );
}
