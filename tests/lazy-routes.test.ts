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
    expect(health).toContain('lazy(() => import("@/components/health/NutritionDiary"))');
    expect(health).toContain('lazy(() => import("@/components/health/WorkoutLog"))');
    expect(health).toContain('lazy(() => import("@/components/health/HealthConnections"))');
    expect(health).toContain('lazy(() => import("@/components/health/HealthTrendWorkbench"))');
    expect(health).toContain('rootMargin: "600px 0px"');
    expect(health).toContain('<DeferredHealthSection label="nutrition diary" targetId="health-section-nutrition"><NutritionDiary /></DeferredHealthSection>');
    expect(health).toContain('id={targetId} className="scroll-mt-6"');
    expect(health).not.toContain('import NutritionDiary from "@/components/health/NutritionDiary"');
    const budget = readFileSync(resolve(process.cwd(), "scripts/check-bundle-budget.mjs"), "utf8");
    expect(budget).toContain('{ label: "Health route chunk"');
    expect(budget).toContain("limit: 100_000");
    expect(budget).toContain('{ label: "deferred Health feature chunk"');
    expect(budget).toContain("limit: 50_000");
  });
});
