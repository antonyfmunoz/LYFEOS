import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Clerk server bootstrap", () => {
  it("fails startup without both server-side Clerk inputs", () => {
    const source = fs.readFileSync(path.resolve("server/index.ts"), "utf8");
    expect(source).toContain("if (!process.env.CLERK_SECRET_KEY)");
    expect(source).toContain("if (!process.env.VITE_CLERK_PUBLISHABLE_KEY)");
  });

  it("passes the publishable and secret keys into Clerk middleware", () => {
    const source = fs.readFileSync(path.resolve("server/routes/auth.ts"), "utf8");
    expect(source).toContain("publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY");
    expect(source).toContain("secretKey: process.env.CLERK_SECRET_KEY");
  });

  it("keeps fake-provider middleware out of the explicitly isolated local-session environment", () => {
    const source = fs.readFileSync(path.resolve("server/routes/auth.ts"), "utf8");
    expect(source).toContain('if (process.env.LYFEOS_TEST_ENV !== "isolated")');
    expect(source).toContain("app.use(clerkMiddleware({");
    expect(source).toContain("app.use(bindAuthenticatedPrincipal);");
  });
});
