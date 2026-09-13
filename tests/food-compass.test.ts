import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Food Compass contract", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("stores source and verification boundaries for private local sources", () => {
    const migration = read("migrations/0159_food_compass.sql");
    const schema = read("shared/schema.ts");
    expect(migration).toContain('CREATE TABLE "food_compass_places"');
    expect(migration).toContain('CREATE TABLE "food_compass_offers"');
    expect(migration).toContain('CREATE TABLE "food_compass_correction_reports"');
    expect(migration).toContain('"food_compass_offers_availability_valid"');
    expect(migration).toContain('"food_compass_places_latitude_valid"');
    expect(schema).toContain("Food Compass is a private, owner-curated local-food action layer");
    expect(schema).toContain('externalActionUrl: text("external_action_url")');
    expect(schema).toContain('verifiedOn: date("verified_on")');
  });

  it("keeps every local-source route owner-scoped and supports the action loop", () => {
    const routes = read("server/routes/food-compass.ts");
    const appRoutes = read("server/routes.ts");
    expect(routes).toContain('app.get("/api/food-compass/overview", isAuthenticated');
    expect(routes).toContain('app.post("/api/food-compass/discover", isAuthenticated');
    expect(routes).toContain('app.post("/api/food-compass/places", isAuthenticated');
    expect(routes).toContain('app.post("/api/food-compass/offers", isAuthenticated');
    expect(routes).toContain('offers/:id/add-to-shopping", isAuthenticated');
    expect(routes).toContain('app.post("/api/food-compass/correction-reports", isAuthenticated');
    expect(routes).toContain("not a LyfeOS inventory guarantee or checkout service");
    expect(routes).toContain("Update coordinates together");
    expect(routes).toContain("radius from 1 to 25 km");
    expect(routes).toContain("OpenStreetMap via Overpass");
    expect(routes).toContain("not saved to your account, verified by LyfeOS");
    expect(appRoutes).toContain('"/api/food-compass"');
    expect(appRoutes).toContain("registerFoodCompassRoutes(app)");
  });

  it("includes Food Compass records and linked local-list actions in Health data rights", () => {
    const rightsRoutes = read("server/routes/health-insights.ts");
    for (const table of ["food_compass_places", "food_compass_offers", "food_compass_correction_reports", "grocery_shopping_items"]) {
      expect(rightsRoutes).toContain(`"${table}"`);
    }
    expect(rightsRoutes).toContain('"food_compass_correction_reports", "food_compass_offers", "food_compass_places", "grocery_shopping_items"');
  });

  it("presents map/list discovery, source-bound offers, link-outs, and correction controls", () => {
    const component = read("client/src/components/health/FoodCompass.tsx");
    const healthPage = read("client/src/pages/HealthDetailPage.tsx");
    expect(component).toContain("Coordinate map");
    expect(component).toContain("Optional distance search uses the coordinates you enter");
    expect(component).toContain("Explore USDA local food directories");
    expect(component).toContain("Discover mapped food sources");
    expect(component).toContain("Search public map");
    expect(component).toContain("© OpenStreetMap contributors");
    expect(component).toContain("Save source");
    expect(component).toContain("Results are not imported or represented as verified LyfeOS listings");
    expect(component).toContain("LyfeOS does not infer your location or invent coordinates.");
    expect(component).toContain("Open seller");
    expect(component).toContain("Add to list");
    expect(component).toContain("Report stale or incorrect local information");
    expect(component).toContain('aria-label="Search saved local food sources"');
    expect(component).toContain('aria-label="Offer fulfillment mode"');
    expect(healthPage).toContain('case "food-compass": return <DeferredHealthSection label="Food Compass local discovery" targetId="health-section-food-compass"><FoodCompass /></DeferredHealthSection>');
    expect(healthPage).toContain('targetId="health-section-food-compass"');
    expect(healthPage).toContain('window.location.hash === `#${targetId}`');
  });
});
