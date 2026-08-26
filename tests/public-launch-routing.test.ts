import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public launch routing", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

  it("keeps registration and account recovery publicly reachable", () => {
    expect(app).toContain('<Route path="/register" component={RegisterPage} />');
    expect(app).toContain('<Route path="/forgot-password" component={ForgotPasswordPage} />');
    expect(app).toContain('<Route path="/reset-password" component={ResetPasswordPage} />');
    expect(app).toContain("'/forgot-password', '/reset-password'");
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
