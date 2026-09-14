import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("global notification viewport", () => {
  it("keeps confirmations out of the center of a working surface", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/ui/toast.tsx"), "utf8");

    expect(source).toContain('fixed inset-x-0 top-0');
    expect(source).toContain('sm:bottom-0 sm:right-0 sm:top-auto');
    expect(source).not.toContain('top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2');
  });
});
