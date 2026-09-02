import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("independent Google productivity integrations", () => {
  it("keeps Calendar, Tasks, and Drive as separate provider records and grants", () => {
    const google = source("server/routes/google.ts");

    expect(google).toContain('provider: "google_calendar"');
    expect(google).toContain('provider: "google_tasks"');
    expect(google).toContain('provider: "google_drive"');
    expect(google).toContain('scope: [GOOGLE_SERVICE_CONFIG[service].scope]');
    expect(google).toContain('app.get("/api/google/:service/auth-url"');
    expect(google).toContain('app.post("/api/google/:service/disconnect"');
    expect(google).toContain('app.patch("/api/google/:service/permissions"');
    expect(google).toContain('app.patch("/api/google/preferences"');
    expect(google).toContain('app.patch("/api/google/approvals/:id"');
    expect(google).toContain('app.get("/api/google/action-receipts"');
    expect(google).toContain("requireGoogleCapability");
    expect(google).toContain("requireGoogleActionApproval");
    expect(google).not.toContain("scope: SCOPES");
  });

  it("uses an event-only Calendar permission and binds the selected service to OAuth state", () => {
    const google = source("server/routes/google.ts");

    expect(google).toContain('const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"');
    expect(google).not.toContain('const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";');
    expect(google).toContain("req.session.googleOAuthService = service");
    expect(google).toContain("req.session.googleOAuthService !== service");
    expect(google).toContain('app.get("/api/google/:service/callback"');
  });

  it("gives Google Tasks the same opt-in writeback lifecycle as the other connected apps", () => {
    const google = source("server/routes/google.ts");
    const permissions = source("shared/google-integration-permissions.ts");
    const profile = source("client/src/pages/ProfilePage.tsx");
    const quests = source("client/src/pages/QuestsPage.tsx");
    const schema = source("shared/schema.ts");
    const migration = source("migrations/0145_mission_external_links.sql");

    expect(google).toContain('const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks"');
    expect(google).toContain('app.post("/api/google/tasks/push"');
    expect(google).toContain('app.delete("/api/google/tasks/push"');
    expect(google).toContain("tasks.tasks.insert");
    expect(google).toContain("tasks.tasks.patch");
    expect(google).toContain(".tasks.delete");
    expect(google).toContain("GOOGLE_ACTIONS.tasksPush");
    expect(google).toContain("GOOGLE_ACTIONS.tasksDelete");
    expect(permissions).toContain('tasks: ["read", "import", "write"]');
    expect(profile).toContain("Create, update, or remove linked Google Tasks.");
    expect(profile).toContain("read only — reconnect to permit task changes");
    expect(quests).toContain('data-testid={`mission-edit-sync-google-tasks-${editingQuest.id}`}');
    expect(quests).toContain('data-testid={`mission-edit-remove-google-tasks-${editingQuest.id}`}');
    expect(quests).toContain('withGoogleMissionLink(current, result.externalSource, result.externalId)');
    expect(google).toContain('externalSource: "google_tasks"');
    expect(schema).toContain('pgTable("mission_external_links"');
    expect(migration).toContain('UNIQUE ("quest_id", "provider")');
    expect(quests).toContain('function googleMissionLink');
    expect(google).not.toContain('Remove that app link before linking it to Google Tasks.');
    expect(google).not.toContain('Remove that app link before linking it to Google Calendar.');
  });

  it("renders three independently controlled profile integrations", () => {
    const profile = source("client/src/pages/ProfilePage.tsx");

    expect(profile).toContain('name: "Google Calendar"');
    expect(profile).toContain('name: "Google Tasks"');
    expect(profile).toContain('name: "Google Drive"');
    expect(profile).toContain("`/api/google/${service}/auth-url`");
    expect(profile).toContain("`/api/google/${service}/disconnect`");
    expect(profile).toContain("Manage permissions");
    expect(profile).toContain("Full authority");
    expect(profile).toContain("Action approval");
    expect(profile).toContain("Account-wide defaults");
    expect(profile).toContain("New actions added later");
    expect(profile).toContain("Recent connected-app activity");
    expect(profile).not.toContain("<span className=\"text-sm\">Google</span>");
  });

  it("uses request-bound approval cards instead of client-side confirmation shortcuts", () => {
    const provider = source("client/src/components/IntegrationActionApprovalProvider.tsx");
    const theme = source("client/src/index.css");
    const quests = source("client/src/pages/QuestsPage.tsx");
    const vault = source("client/src/pages/DocumentVaultPage.tsx");
    const approvals = source("server/integration-action-approvals.ts");
    const migration = source("migrations/0144_integration_action_governance.sql");
    const release = source("server/release-migrate.ts");

    expect(provider).toContain("Allow once");
    expect(provider).toContain("Always allow");
    expect(provider).toContain('variant="secondary"');
    expect(theme).toContain('--secondary: var(--primary-hsl, 188 100% 50%) !important;');
    expect(theme).toContain('--secondary: var(--primary-hsl, 188 95% 40%) !important;');
    expect(theme).not.toContain('--secondary: 188 80% 35% !important;');
    expect(theme).not.toContain('--secondary: 188 75% 30% !important;');
    expect(provider).toContain("IntegrationActionDeniedError");
    expect(quests).not.toContain("approvalConfirmed");
    expect(vault).not.toContain("approvalConfirmed");
    expect(approvals).toContain("request_fingerprint = $6");
    expect(approvals).toContain("state = 'approved'");
    expect(approvals).toContain("FOR UPDATE");
    expect(approvals).toContain("approvalPolicyOverride: \"never\"");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "integration_action_receipts"');
    expect(release).toContain('id: "0144_integration_action_governance"');
  });

  it("documents distinct production credentials and callbacks", () => {
    const environment = source(".env.tpl");

    for (const service of ["CALENDAR", "TASKS", "DRIVE"]) {
      expect(environment).toContain(`GOOGLE_${service}_OAUTH_CLIENT_ID=`);
      expect(environment).toContain(`GOOGLE_${service}_OAUTH_CLIENT_SECRET=`);
      expect(environment).toContain(`GOOGLE_${service}_OAUTH_REDIRECT_URI=`);
    }
    expect(environment).toContain("https://lyfeos.net/api/google/calendar/callback");
    expect(environment).toContain("https://lyfeos.net/api/google/tasks/callback");
    expect(environment).toContain("https://lyfeos.net/api/google/drive/callback");
  });
});
