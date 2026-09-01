import fs from "node:fs";
import { describe, expect, it } from "vitest";

const main = fs.readFileSync("client/src/main.tsx", "utf8");
const clerkPackage = JSON.parse(fs.readFileSync("node_modules/@clerk/clerk-react/package.json", "utf8"));

describe("Clerk client bootstrap reliability", () => {
  it("pins ClerkJS while retaining UI support for secure reverification", () => {
    expect(clerkPackage.version).toMatch(/^5\./);
    expect(main).toContain('const CLERK_JS_VERSION = "5.127.2"');
    expect(main).toContain("clerkJSVersion={CLERK_JS_VERSION}");
    expect(main).not.toContain('clerkJSVariant="headless"');
    expect(main).not.toContain("clerkJSUrl=");
  });
});
