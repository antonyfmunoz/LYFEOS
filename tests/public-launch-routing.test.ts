import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public launch routing", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

  it("keeps registration and account recovery publicly reachable", () => {
    expect(app).toContain('<Route path="/register" component={RegisterPage} />');
    expect(app).toContain('<Route path="/privacy" component={TrustDisclosurePage} />');
    expect(app).toContain('<Route path="/terms" component={TrustDisclosurePage} />');
    expect(app).toContain("'/privacy', '/terms'");
    expect(app).toContain('<Route path="/forgot-password" component={ForgotPasswordPage} />');
    expect(app).toContain('<Route path="/reset-password" component={ResetPasswordPage} />');
    expect(app).toContain("'/forgot-password', '/reset-password'");
  });

  it("does not make registration depend on missing or falsely finalized legal pages", () => {
    const registration = readFileSync(resolve(process.cwd(), "client/src/pages/RegisterPage.tsx"), "utf8");
    const onboarding = readFileSync(resolve(process.cwd(), "client/src/pages/OnboardingPage.tsx"), "utf8");
    const authRoutes = readFileSync(resolve(process.cwd(), "server/routes/auth.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "migrations/0141_registration_disclosure_provenance.sql"), "utf8");
    const disclosure = readFileSync(resolve(process.cwd(), "client/src/pages/TrustDisclosurePage.tsx"), "utf8");
    expect(registration).toContain("These are not finalized legal terms.");
    expect(registration).not.toContain("I agree to the");
    expect(registration).toContain("REGISTRATION_DISCLOSURE_VERSION");
    expect(onboarding).toContain("registrationDisclosureVersion: REGISTRATION_DISCLOSURE_VERSION");
    expect(authRoutes).toContain('registrationDisclosureVersion: acknowledgedVersion');
    expect(authRoutes).toContain('termsAccepted: termsAccepted === true');
    expect(migration).toContain('"registration_disclosure_acknowledged_at" timestamp');
    expect(disclosure).toContain("does not currently publish approved consumer Terms of Service");
    expect(disclosure).toContain("factual summary of current product behavior");
  });

  it("renders the landing page at the public root while preserving the explicit waitlist", () => {
    expect(app).toContain("Public visitor at root, keeping the landing page");
    expect(app).toContain(") : <LandingPage />}");
    expect(app).toContain('<Route path="/waitlist" component={WaitlistPage} />');
  });

  it("does not reinstate the obsolete client-side beta access gate", () => {
    expect(app).not.toContain("lyfeos_access");
    expect(app).not.toContain("access=beta");
    expect(app).not.toContain("navigate('/waitlist'");
  });

  it("continues to protect authenticated product routes", () => {
    expect(app).toContain('<Route path="/dashboard">');
    expect(app).toContain("<ProtectedRoute>");
    expect(app).toContain("Unauthorized access attempt to protected path:");
    expect(app).toContain("navigate('/login', { replace: true })");
  });
});
