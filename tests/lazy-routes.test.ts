import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("route loading boundary", () => {
  it("defers feature pages behind a suspense boundary instead of eagerly importing the whole product", () => {
    const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
    expect(app).toContain('lazyRoute(() => import("./pages/DashboardPage"))');
    expect(app).toContain('lazyRoute(() => import("./pages/ProfilePage"))');
    expect(app).toContain('lazyRoute(() => import("./pages/AnalyticsPage"))');
    expect(app).toContain('lazyRoute(() => import("./pages/DocumentVaultPage"))');
    expect(app).toContain("React.lazy(() => withChunkLoadTimeout(loader))");
    expect(app).toContain('<Suspense fallback={<RouteLoadingScreen />}>');
    expect(app).not.toContain('import DashboardPage from "./pages/DashboardPage"');
  });

  it("progressively loads below-the-fold Health modules without changing their order", () => {
    const health = readFileSync(resolve(process.cwd(), "client/src/pages/HealthDetailPage.tsx"), "utf8");
    const nutrition = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionDiary.tsx"), "utf8");
    const nutritionReports = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionReportsPanel.tsx"), "utf8");
    const nutritionChart = readFileSync(resolve(process.cwd(), "client/src/components/health/NutritionTrendChart.tsx"), "utf8");
    const deferredFeature = readFileSync(resolve(process.cwd(), "client/src/components/DeferredFeature.tsx"), "utf8");
    expect(health).toContain('lazyHealthFeature(() => import("@/components/health/NutritionDiary"))');
    expect(health).toContain('lazyHealthFeature(() => import("@/components/health/WorkoutLog"))');
    expect(health).toContain('lazyHealthFeature(() => import("@/components/health/HealthConnections"))');
    expect(health).toContain("return lazy(() => withChunkLoadTimeout(loader))");
    expect(health).toContain("<DeferredFeatureChunkBoundary fallback=");
    expect(health).toContain("Other Health workspaces remain available.");
    expect(health).toContain('lazyHealthFeature(() => import("@/components/health/HealthTrendWorkbench"))');
    expect(health).toContain('rootMargin: "600px 0px"');
    expect(health).toContain('<DeferredHealthSection label="nutrition diary" targetId="health-section-nutrition"><NutritionDiary /></DeferredHealthSection>');
    expect(health).toContain('id={targetId} className="scroll-mt-6"');
    expect(health).not.toContain('import NutritionDiary from "@/components/health/NutritionDiary"');
    expect(nutrition).toContain('const loadNutritionReportsPanel = () => import("./NutritionReportsPanel")');
    expect(nutrition).toContain('const loadFoodCatalogSearch = () => import("./FoodCatalogSearch")');
    expect(nutrition).toContain("useDeferredFeature(loadFoodCatalogSearch)");
    expect(nutrition).toContain("Manual foods and the rest of the diary remain available.");
    expect(nutrition).toContain("useDeferredFeature(loadNutritionReportsPanel)");
    expect(nutrition).toContain("<DeferredFeatureChunkBoundary key={nutritionReportsAttempt}");
    expect(nutrition).toContain("Diary logging is still available.");
    expect(nutrition).not.toContain('from "recharts"');
    expect(nutritionReports).toContain('const loadNutritionTrendChart = () => import("./NutritionTrendChart")');
    expect(nutritionReports).toContain("useDeferredFeature(loadNutritionTrendChart)");
    expect(nutritionReports).toContain("<DeferredFeatureChunkBoundary key={nutritionChartAttempt}");
    expect(nutritionReports).toContain("The accessible history table remains available below.");
    expect(nutritionReports).toContain("View accessible nutrition history table");
    expect(nutritionChart).toContain('from "recharts"');
    expect(nutritionChart).toContain('connectNulls={false}');
    expect(deferredFeature).toContain("lazy(() => withChunkLoadTimeout(load))");
    expect(deferredFeature).toContain("if (!isChunkLoadError(this.state.error)) throw this.state.error");
    expect(deferredFeature).toContain("setAttempt((current) => current + 1)");
    const budget = readFileSync(resolve(process.cwd(), "scripts/check-bundle-budget.mjs"), "utf8");
    expect(budget).toContain('{ label: "Health route chunk"');
    expect(budget).toContain("limit: 100_000");
    expect(budget).toContain('{ label: "deferred Health feature chunk"');
    expect(budget).toContain("limit: 50_000");
  });
});
