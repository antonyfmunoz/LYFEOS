import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("password recovery session handoff", () => {
  it("continues a completed Clerk reset through the authenticated transition", () => {
    const reset = readFileSync(resolve(process.cwd(), "client/src/pages/ResetPasswordPage.tsx"), "utf8");

    expect(reset).toContain("resetResult.createdSessionId");
    expect(reset).toContain('await setActive({ session: resetResult.createdSessionId })');
    expect(reset).toContain('navigate("/login-success", { replace: true })');
    expect(reset).not.toContain("You can now log in with your new password.");
  });

  it("does not create a second Clerk sign-in for an existing session", () => {
    const login = readFileSync(resolve(process.cwd(), "client/src/pages/LoginPage.tsx"), "utf8");
    const authContext = readFileSync(resolve(process.cwd(), "client/src/lib/authContext.tsx"), "utf8");

    expect(login).toContain("if (user || isSignedIn)");
    expect(login).toContain('navigate("/dashboard", { replace: true })');
    expect(authContext).toContain("if (isSignedIn)");
    expect(authContext).toContain('response = await fetch("/api/auth/me", { credentials: "include" })');
    expect(authContext).toContain('Clerk correctly rejects with "You\'re already signed in."');
  });
});
