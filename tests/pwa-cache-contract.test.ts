import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA cache contract", () => {
  it("preserves the service worker's active cache during startup cleanup", () => {
    const worker = readFileSync(resolve(process.cwd(), "client/public/sw.js"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "client/src/main.tsx"), "utf8");
    const cacheName = worker.match(/const CACHE_NAME = '([^']+)'/)?.[1];

    expect(cacheName).toBeTruthy();
    expect(main).toContain(`name !== '${cacheName}'`);
  });
});
