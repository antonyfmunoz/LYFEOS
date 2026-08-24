import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    data: await response.json().catch(() => ({})) as any,
    cookie: response.headers.get("set-cookie") || "",
  };
}

describeApi("Health write concurrency API", () => {
  const stamp = Date.now();
  const user = { email: `health_concurrency_${stamp}@example.com`, password: "TestPass123!", displayName: `healthconcurrency_${stamp}` };
  let cookie = "";
  let workoutId = 0;
  let templateId = 0;
  let foodId = 0;
  let recipeId = 0;

  afterAll(async () => {
    const login = await request("POST", "/api/auth/login", { identifier: user.displayName, password: user.password });
    if (login.status === 200 && login.cookie) {
      await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, login.cookie);
    }
  });

  it("creates exactly one workout for simultaneous identical mutation replays", async () => {
    const registration = await request("POST", "/api/auth/complete-registration", { ...user, termsAccepted: true });
    expect(registration.status).toBe(201);
    cookie = registration.cookie;

    const workout = {
      activityType: "Strength training",
      durationMinutes: 35,
      occurredAt: new Date().toISOString(),
      note: "Initial factual workout",
      exercises: [{ name: "Goblet squat", setRecords: [{ reps: 8, loadValue: 20, loadUnit: "kg", completed: true }] }],
    };
    const mutationId = `workout-${stamp}-same`;
    const creations = await Promise.all([
      request("POST", "/api/workouts", workout, cookie, { "x-lyfeos-mutation-id": mutationId }),
      request("POST", "/api/workouts", workout, cookie, { "x-lyfeos-mutation-id": mutationId }),
    ]);
    expect(creations.map((result) => result.status).sort()).toEqual([200, 201]);
    expect(new Set(creations.map((result) => result.data.workout.id)).size).toBe(1);
    expect(creations.filter((result) => result.data.replayed === true)).toHaveLength(1);
    workoutId = creations[0].data.workout.id;

    const conflict = await request("POST", "/api/workouts", { ...workout, note: "Different payload" }, cookie, { "x-lyfeos-mutation-id": mutationId });
    expect(conflict.status).toBe(409);
  });

  it("allows exactly one simultaneous workout correction to append revision two", async () => {
    const base = {
      activityType: "Strength training",
      durationMinutes: 35,
      occurredAt: new Date().toISOString(),
      exercises: [{ name: "Goblet squat", setRecords: [{ reps: 8, loadValue: 20, loadUnit: "kg", completed: true }] }],
    };
    const corrections = await Promise.all([
      request("PUT", `/api/workouts/${workoutId}`, { ...base, note: "Correction alpha" }, cookie, { "x-lyfeos-expected-revision": "1" }),
      request("PUT", `/api/workouts/${workoutId}`, { ...base, note: "Correction beta" }, cookie, { "x-lyfeos-expected-revision": "1" }),
    ]);
    expect(corrections.filter((result) => result.status === 200)).toHaveLength(1);
    expect(corrections.filter((result) => result.status === 409)).toHaveLength(1);
    expect(corrections.find((result) => result.status === 409)?.data.currentRevision).toBe(2);

    const current = await request("GET", `/api/workouts/${workoutId}`, undefined, cookie);
    const revisions = await request("GET", `/api/workouts/${workoutId}/revisions`, undefined, cookie);
    expect(current.data.workout.currentRevision).toBe(2);
    expect(["Correction alpha", "Correction beta"]).toContain(current.data.workout.note);
    expect(revisions.data.revisions.map((revision: any) => revision.revisionNumber)).toEqual([2, 1]);
  });

  it("allows exactly one simultaneous workout-template writer", async () => {
    const template = {
      name: "Strength A",
      activityType: "Strength training",
      folder: "Current",
      exercises: [{ name: "Goblet squat", setRecords: [{ reps: 8, loadValue: 20, loadUnit: "kg" }] }],
    };
    const created = await request("POST", "/api/workout-templates", template, cookie);
    expect(created.status).toBe(201);
    templateId = created.data.template.id;

    const updates = await Promise.all([
      request("PATCH", `/api/workout-templates/${templateId}`, { ...template, name: "Strength A alpha" }, cookie, { "x-lyfeos-expected-revision": "1" }),
      request("PATCH", `/api/workout-templates/${templateId}`, { ...template, name: "Strength A beta" }, cookie, { "x-lyfeos-expected-revision": "1" }),
    ]);
    expect(updates.filter((result) => result.status === 200)).toHaveLength(1);
    expect(updates.filter((result) => result.status === 409)).toHaveLength(1);
    expect(updates.find((result) => result.status === 409)?.data.currentRevision).toBe(2);
    const revisions = await request("GET", `/api/workout-templates/${templateId}/revisions`, undefined, cookie);
    expect(revisions.data.revisions.map((revision: any) => revision.revisionNumber)).toEqual([2, 1]);
  });

  it("allows exactly one simultaneous recipe writer and preserves one composition revision", async () => {
    const food = await request("POST", "/api/nutrition/foods", {
      name: "Private test oats", servingSizeGrams: 100,
      nutrients: [{ nutrientKey: "energy_kcal", amountPer100g: 380 }],
    }, cookie);
    expect(food.status).toBe(201);
    foodId = food.data.food.id;

    const recipe = { name: "Oats", servings: 2, folder: "Breakfast", ingredients: [{ foodId, grams: 100 }] };
    const created = await request("POST", "/api/nutrition/recipes", recipe, cookie);
    expect(created.status).toBe(201);
    recipeId = created.data.recipe.id;

    const updates = await Promise.all([
      request("PATCH", `/api/nutrition/recipes/${recipeId}`, { ...recipe, name: "Oats alpha", ingredients: [{ foodId, grams: 120 }] }, cookie, { "x-lyfeos-expected-revision": "1" }),
      request("PATCH", `/api/nutrition/recipes/${recipeId}`, { ...recipe, name: "Oats beta", ingredients: [{ foodId, grams: 140 }] }, cookie, { "x-lyfeos-expected-revision": "1" }),
    ]);
    expect(updates.filter((result) => result.status === 200)).toHaveLength(1);
    expect(updates.filter((result) => result.status === 409)).toHaveLength(1);
    expect(updates.find((result) => result.status === 409)?.data.currentRevision).toBe(2);
    const revisions = await request("GET", `/api/nutrition/recipes/${recipeId}/revisions`, undefined, cookie);
    expect(revisions.data.revisions.map((revision: any) => revision.revisionNumber)).toEqual([2, 1]);
  });

  it("reparses one simultaneous label correction and reuses it only from private history", async () => {
    const created = await request("POST", "/api/ingredient-scans", {
      captureMethod: "manual_label",
      productName: "Private cereal",
      barcode: `TEST-${stamp}`,
      rawIngredientsText: "Oats, sugar, sea salt",
    }, cookie);
    expect(created.status).toBe(201);
    const scanId = created.data.scan.id;
    expect(created.data.scan.items.map((item: any) => item.normalizedKey)).toEqual(["oats", "sugar", "sea_salt"]);

    const corrections = await Promise.all([
      request("PATCH", `/api/ingredient-scans/${scanId}`, {
        captureMethod: "manual_label", productName: "Private cereal alpha", barcode: `TEST-${stamp}`, rawIngredientsText: "Oats, cinnamon",
      }, cookie, { "x-lyfeos-expected-revision": "1" }),
      request("PATCH", `/api/ingredient-scans/${scanId}`, {
        captureMethod: "manual_label", productName: "Private cereal beta", barcode: `TEST-${stamp}`, rawIngredientsText: "Oats, cacao",
      }, cookie, { "x-lyfeos-expected-revision": "1" }),
    ]);
    expect(corrections.filter((result) => result.status === 200)).toHaveLength(1);
    expect(corrections.filter((result) => result.status === 409)).toHaveLength(1);
    expect(corrections.find((result) => result.status === 409)?.data.currentRevision).toBe(2);

    const lookup = await request("GET", `/api/ingredient-scans/lookup?barcode=${encodeURIComponent(`TEST-${stamp}`)}`, undefined, cookie);
    expect(lookup.status).toBe(200);
    expect(lookup.data.source).toBe("your_private_history");
    expect(lookup.data.scan.id).toBe(scanId);
    expect(lookup.data.scan.revision).toBe(2);
    expect(lookup.data.disclosure).toContain("No licensed or external product catalog was queried");
  });
});
