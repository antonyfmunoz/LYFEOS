import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared accessibility shell", () => {
  it("provides a keyboard skip link and a focusable main landmark", () => {
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/layout/RootLayout.tsx"), "utf8");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain("Skip to main content");
    expect(layout).toContain('<main id="main-content"');
    expect(layout).toContain("tabIndex={-1}");
  });

  it("keeps desktop and mobile primary navigation discoverable to assistive technology", () => {
    const mobile = readFileSync(resolve(process.cwd(), "client/src/components/layout/MobileNav.tsx"), "utf8");
    const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
    expect(mobile).toContain('aria-label="Primary navigation"');
    expect(mobile).toContain('aria-label={isOpen ? "Close navigation" : "Open navigation"}');
    expect(mobile).toContain('e.key === "Enter" || e.key === " "');
    expect(sidebar).toContain('aria-label="Primary navigation"');
    expect(sidebar).toContain('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}');
  });

  it("keeps the desktop assistant controls keyboard and screen-reader operable", () => {
    const assistant = readFileSync(resolve(process.cwd(), "client/src/components/ai/AICompanionPanel.tsx"), "utf8");
    expect(assistant).toContain('aria-label={`Chat with ${aiCompanionName}`}');
    expect(assistant).toContain('aria-label="Save assistant name"');
    expect(assistant).toContain('aria-label={`Open chat: ${chat.title}`}');
    expect(assistant).toContain('e.key === "Enter" || e.key === " "');
    expect(assistant).toContain('aria-label="Send message"');
  });

  it("keeps the public waitlist forms and FAQ semantically operable", () => {
    const waitlist = readFileSync(resolve(process.cwd(), "client/src/pages/WaitlistPage.tsx"), "utf8");
    expect(waitlist).toContain("<main>");
    expect(waitlist).toContain('<label htmlFor={id} className="sr-only">Email address</label>');
    expect(waitlist).toContain("aria-invalid={Boolean(error)}");
    expect(waitlist).toContain('role="alert"');
    expect(waitlist).toContain("aria-expanded={open}");
    expect(waitlist).toContain("aria-controls={answerId}");
  });

  it("keeps public launch and registration pages landmark and form accessible", () => {
    const landing = readFileSync(resolve(process.cwd(), "client/src/pages/LandingPage.tsx"), "utf8");
    const register = readFileSync(resolve(process.cwd(), "client/src/pages/RegisterPage.tsx"), "utf8");
    expect(landing).toContain('usePageTitle("Home")');
    expect(landing).toContain("<main>");
    expect(landing).toContain('aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}');
    expect(landing).toContain("aria-expanded={mobileMenuOpen}");
    expect(register).toContain('<main className="flex-1 flex items-center w-full justify-center">');
    expect(register).toContain('id="registration-error" role="alert"');
    expect(register).toContain('autoComplete="email"');
    expect(register).toContain('autoComplete="new-password"');
    expect(register).toContain('aria-describedby={error ? "registration-error" : undefined}');
  });

  it("keeps login and account recovery landmarks, names, and route titles accessible", () => {
    const login = readFileSync(resolve(process.cwd(), "client/src/pages/LoginPage.tsx"), "utf8");
    const forgot = readFileSync(resolve(process.cwd(), "client/src/pages/ForgotPasswordPage.tsx"), "utf8");
    const reset = readFileSync(resolve(process.cwd(), "client/src/pages/ResetPasswordPage.tsx"), "utf8");
    const brandRuntime = readFileSync(resolve(process.cwd(), "client/src/components/InstallationBrandRuntime.tsx"), "utf8");
    expect(login).toContain('<main className="flex-1 flex items-center w-full justify-center">');
    expect(forgot).toContain('<main className="flex-1 flex items-center w-full justify-center">');
    expect(forgot).toContain('usePageTitle("Reset Password")');
    expect(forgot).toContain('<label htmlFor="reset-email"');
    expect(forgot).toContain('id="reset-email"');
    expect(forgot).toContain('autoComplete="email"');
    expect(reset).toContain('<main className="min-h-screen');
    expect(reset).toContain('aria-label="Verification code"');
    expect(reset).toContain('aria-label="New password"');
    expect(reset).toContain('aria-label="Confirm new password"');
    expect(reset).toContain('aria-label={showPassword ? "Hide password" : "Show password"}');
    expect(brandRuntime).toContain('if (document.title === "LYFEOS - Dashboard")');
  });

  it("keeps audited standalone routes and shared controls semantically named", () => {
    const thankYou = readFileSync(resolve(process.cwd(), "client/src/pages/WaitlistThankYouPage.tsx"), "utf8");
    const subscription = readFileSync(resolve(process.cwd(), "client/src/pages/SubscriptionPage.tsx"), "utf8");
    const timeline = readFileSync(resolve(process.cwd(), "client/src/pages/TimelinePage.tsx"), "utf8");
    const rolodex = readFileSync(resolve(process.cwd(), "client/src/pages/RolodexPage.tsx"), "utf8");
    const vault = readFileSync(resolve(process.cwd(), "client/src/pages/DocumentVaultPage.tsx"), "utf8");
    const widget = readFileSync(resolve(process.cwd(), "client/src/components/ui/collapsible-widget.tsx"), "utf8");

    expect(thankYou).toContain('<main className="min-h-[100dvh]');
    expect(subscription).toContain('<main className="min-h-screen');
    expect(timeline).toContain('aria-label="Zoom timeline out"');
    expect(timeline).toContain('aria-label="Zoom timeline in"');
    expect(timeline).toContain('aria-label="Zoom roadmap out"');
    expect(timeline).toContain('aria-label="Zoom roadmap in"');
    expect(rolodex).toContain('aria-label="Search contacts"');
    expect(rolodex).toContain('aria-label={showFilters ? "Hide contact filters" : "Show contact filters"}');
    expect(vault).toContain('aria-label="Search documents and folders"');
    expect(vault).toContain('aria-label={i === 0 ? "Go to vault home" : undefined}');
    expect(widget).toContain('aria-label={`${isOpen ? "Collapse" : "Expand"} ${title}`}');
    expect(widget).toContain("aria-expanded={isOpen}");
  });

  it("keeps automation loading, failure, selection, and schedule state explicit", () => {
    const automations = readFileSync(resolve(process.cwd(), "client/src/pages/AutomationsPage.tsx"), "utf8");
    expect(automations).not.toContain('<main className="space-y-5">');
    expect(automations).toContain('aria-label="Automation rules"');
    expect(automations).toContain("aria-pressed={selectedId === item.id}");
    expect(automations).toContain('role="status" aria-live="polite"');
    expect(automations).toContain('role="alert"');
    expect(automations).toContain("list.refetch()");
    expect(automations).toContain("detail.refetch()");
    expect(automations).toContain('<Button asChild variant="outline"><Link href="/document-vault">Data Vault</Link></Button>');
  });

  it("keeps the canonical Mission proof and evidence controls explicitly named", () => {
    const missions = readFileSync(resolve(process.cwd(), "client/src/pages/QuestsPage.tsx"), "utf8");
    const detail = readFileSync(resolve(process.cwd(), "client/src/pages/MissionDetailPage.tsx"), "utf8");
    const editor = readFileSync(resolve(process.cwd(), "client/src/components/markdown/MarkdownEditor.tsx"), "utf8");
    const toast = readFileSync(resolve(process.cwd(), "client/src/components/ui/toast.tsx"), "utf8");
    expect(missions).toContain('data-testid="mission-create-submit"');
    expect(missions).toContain('aria-label={`${terminatedInfoOpen[quest.id] ? "Hide" : "Show"} archived mission details for ${quest.title}`}');
    expect(missions).toContain('aria-label={`Edit archived mission ${quest.title}`}');
    expect(detail).toContain('data-testid="proof-plan-purpose" aria-label="Mission purpose"');
    expect(detail).toContain('data-testid="proof-plan-output" aria-label="Expected mission output"');
    expect(detail).toContain('data-testid="proof-plan-method" aria-label="Mission method steps"');
    expect(detail).toContain('data-testid="proof-plan-evidence-requirement" aria-label="Required mission evidence"');
    expect(detail).toContain('aria-label="Mission stop condition"');
    expect(detail).toContain('aria-label="Mission escalation path"');
    expect(detail).toContain('data-testid="mission-evidence-reference" aria-label="Evidence source or reference"');
    expect(detail).toContain('data-testid="mission-evidence-summary" aria-label="Mission evidence summary"');
    expect(detail).toContain('aria-label="Reviewer username search"');
    expect(detail).toContain('aria-label="Mission self-review summary"');
    expect(detail).toContain('aria-label="Mission review appeal reason"');
    expect(editor).toContain("aria-label={props.type === 'checkbox' ? 'Mission task item' : props['aria-label']}");
    expect(toast).toContain('aria-label="Dismiss notification"');
  });
});
