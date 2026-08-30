import fs from "node:fs";
import { describe, expect, it } from "vitest";

const main = fs.readFileSync("client/src/main.tsx", "utf8");
const clerkPackage = JSON.parse(fs.readFileSync("node_modules/@clerk/clerk-react/package.json", "utf8"));

describe("Clerk client bootstrap reliability", () => {
  it("uses the supported headless runtime without an unpinned major-version redirect", () => {
    expect(clerkPackage.version).toMatch(/^5\./);
    expect(main).toContain('const CLERK_JS_VERSION = "5.127.2"');
    expect(main).toContain('clerkJSVariant="headless"');
    expect(main).toContain("clerkJSVersion={CLERK_JS_VERSION}");
    expect(main).not.toContain("clerkJSUrl=");
  });
});
