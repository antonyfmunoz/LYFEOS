import { afterAll, describe, expect, it } from "vitest";

const BASE_URL = process.env.LYFEOS_TEST_API_URL;
const describeApi = BASE_URL && process.env.LYFEOS_TEST_ENV === "isolated" ? describe : describe.skip;

async function request(method: string, path: string, body?: unknown, cookie?: string, headers: Record<string, string> = {}) {
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

describeApi("Health ownership, export, and deletion API", () => {
  const stamp = Date.now();
  const owner = { email: `health_owner_${stamp}@example.com`, password: "TestPass123!", displayName: `healthowner_${stamp}` };
  const other = { email: `health_other_${stamp}@example.com`, password: "TestPass123!", displayName: `healthother_${stamp}` };
  let ownerCookie = "";
  let otherCookie = "";
  let hydrationId = 0;
  let workoutId = 0;
  let labObservationId = 0;

  afterAll(async () => {
    for (const account of [owner, other]) {
      const login = await request("POST", "/api/auth/login", { identifier: account.displayName, password: account.password });
      if (login.status === 200 && login.cookie) await request("DELETE", "/api/account", { confirmation: "DELETE MY ACCOUNT" }, login.cookie);
    }
  });

  it("creates representative private Health records for one owner", async () => {
    const ownerRegistration = await request("POST", "/api/auth/complete-registration", { ...owner, termsAccepted: true });
    const otherRegistration = await request("POST", "/api/auth/complete-registration", { ...other, termsAccepted: true });
    expect(ownerRegistration.status).toBe(201);
    expect(otherRegistration.status).toBe(201);
    ownerCookie = ownerRegistration.cookie;
    otherCookie = otherRegistration.cookie;

    const occurredAt = new Date().toISOString();
    const hydration = await request("POST", "/api/health-fitness/hydration", { volumeMl: 500, occurredAt, note: "Private owner fixture" }, ownerCookie, { "x-lyfeos-mutation-id": `rights-hydration-${stamp}` });
    expect(hydration.status).toBe(201);
    hydrationId = hydration.data.entry.id;

    const workout = await request("POST", "/api/workouts", {
      activityType: "Strength training", durationMinutes: 30, occurredAt, note: "Private owner fixture",
      exercises: [{ name: "Squat", setRecords: [{ reps: 5, loadValue: 40, loadUnit: "kg", completed: true }] }],
    }, ownerCookie, { "x-lyfeos-mutation-id": `rights-workout-${stamp}` });
    expect(workout.status).toBe(201);
    workoutId = workout.data.workout.id;

    const measurement = await request("POST", "/api/health-fitness/measurements", { metric: "weight", value: 80, unit: "kg", observedAt: occurredAt.slice(0, 10), source: "manual", measurementMethod: "scale" }, ownerCookie, { "x-lyfeos-mutation-id": `rights-measurement-${stamp}` });
    const supplement = await request("POST", "/api/health-fitness/supplements", { name: "User-entered supplement", amount: 1, unit: "capsule", occurredAt }, ownerCookie);
    const connection = await request("POST", "/api/health-connections/intents", { provider: "health_connect", scopes: ["activity"] }, ownerCookie);
    const labObservation = await request("POST", "/api/health-observations", {
      category: "lab", metricKey: "user_entered_marker", displayName: "User-entered marker", value: 42, unit: "unit",
      source: "lab", labName: "User-entered source", specimenType: "blood", collectedAt: occurredAt,
      referenceLow: 10, referenceHigh: 50, referenceUnit: "unit", observedAt: occurredAt, note: "Raw fixture; not interpreted",
    }, ownerCookie, { "x-lyfeos-mutation-id": `rights-lab-${stamp}` });
    expect([measurement.status, supplement.status, connection.status, labObservation.status]).toEqual([201, 201, 201, 201]);
    labObservationId = labObservation.data.observation.id;
  });

  it("prevents another authenticated account from reading, changing, or deleting owner records", async () => {
    const readWorkout = await request("GET", `/api/workouts/${workoutId}`, undefined, otherCookie);
    const changeHydration = await request("PATCH", `/api/health-fitness/hydration/${hydrationId}`, { volumeMl: 999, note: "Unauthorized" }, otherCookie);
    const deleteHydration = await request("DELETE", `/api/health-fitness/hydration/${hydrationId}`, undefined, otherCookie);
    const changeLab = await request("PATCH", `/api/health-observations/${labObservationId}`, {
      category: "lab", metricKey: "user_entered_marker", displayName: "User-entered marker", value: 999, unit: "unit", source: "lab",
      labName: "Unauthorized", specimenType: "blood", collectedAt: new Date().toISOString(), referenceLow: 10, referenceHigh: 50, referenceUnit: "unit",
    }, otherCookie);
    const deleteLab = await request("DELETE", `/api/health-observations/${labObservationId}`, undefined, otherCookie);
    expect([readWorkout.status, changeHydration.status, deleteHydration.status, changeLab.status, deleteLab.status]).toEqual([404, 404, 404, 404, 404]);
    const otherRights = await request("GET", "/api/health-data/rights", undefined, otherCookie);
    expect(otherRights.status).toBe(200);
    expect(Object.values(otherRights.data.recordCounts as Record<string, number>).reduce((sum, count) => sum + count, 0)).toBe(0);
  });

  it("exports the owner's records and omits credential custody fields", async () => {
    const exported = await request("GET", "/api/health-data/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    expect(exported.data.scope).toBe("LyfeOS private health domain");
    expect(exported.data.tables.hydration_entries).toHaveLength(1);
    expect(exported.data.tables.workouts).toHaveLength(1);
    expect(exported.data.tables.workout_exercises).toHaveLength(1);
    expect(exported.data.tables.workout_sets).toHaveLength(1);
    expect(exported.data.tables.body_measurements).toHaveLength(1);
    expect(exported.data.tables.supplement_entries).toHaveLength(1);
    expect(exported.data.tables.health_connections).toHaveLength(1);
    expect(exported.data.tables.health_observations).toHaveLength(1);
    expect(exported.data.tables.health_observations[0]).toMatchObject({
      category: "lab", metric_key: "user_entered_marker", source: "lab", specimen_type: "blood",
      reference_low: 10, reference_high: 50, reference_unit: "unit",
    });
    expect(JSON.stringify(exported.data)).not.toContain("credentialRef");
    expect(JSON.stringify(exported.data)).not.toContain("credential_ref");
  });

  it("requires exact confirmation, deletes the Health domain, and preserves the account plus minimal rights receipt", async () => {
    const refused = await request("DELETE", "/api/health-data", { confirmation: "delete" }, ownerCookie);
    expect(refused.status).toBe(400);
    const deleted = await request("DELETE", "/api/health-data", { confirmation: "DELETE MY HEALTH DATA" }, ownerCookie);
    expect(deleted.status).toBe(200);
    expect(deleted.data.deleted).toBe(true);
    expect(deleted.data.deletedRecordCounts.hydration_entries).toBe(1);
    expect(deleted.data.deletedRecordCounts.workouts).toBe(1);
    expect(deleted.data.deletedRecordCounts.health_observations).toBe(1);

    const rights = await request("GET", "/api/health-data/rights", undefined, ownerCookie);
    expect(rights.status).toBe(200);
    const counts = rights.data.recordCounts as Record<string, number>;
    expect(counts.health_data_rights_audit).toBe(2);
    expect(Object.entries(counts).filter(([table]) => table !== "health_data_rights_audit").reduce((sum, [, count]) => sum + count, 0)).toBe(0);
    const exported = await request("GET", "/api/health-data/export", undefined, ownerCookie);
    expect(exported.status).toBe(200);
    expect(exported.data.tables.health_data_rights_audit.map((receipt: any) => receipt.action)).toEqual(expect.arrayContaining(["exported", "health_data_deleted"]));
    const account = await request("GET", "/api/auth/me", undefined, ownerCookie);
    expect(account.status).toBe(200);
    expect(account.data.user.displayName).toBe(owner.displayName);
  });
});
