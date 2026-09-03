import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA cache contract", () => {
  it("lets the newly activated service worker retire old caches atomically", () => {
    const worker = readFileSync(resolve(process.cwd(), "client/public/sw.js"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "client/src/main.tsx"), "utf8");
    const cacheName = worker.match(/const CACHE_NAME = '([^']+)'/)?.[1];

    expect(cacheName).toBeTruthy();
    expect(worker).toContain(".filter((name) => name !== CACHE_NAME)");
    expect(main).not.toContain("caches.keys()");
    expect(main).not.toContain("caches.delete(");
  });

  it("primes only a bounded same-origin app shell and never caches API responses", () => {
    const worker = readFileSync(resolve(process.cwd(), "client/public/sw.js"), "utf8");
    const main = readFileSync(resolve(process.cwd(), "client/src/main.tsx"), "utf8");

    expect(worker).toContain("const MAX_APP_SHELL_URLS = 64");
    expect(worker).toContain("const APP_SHELL_CACHE_CONCURRENCY = 8");
    expect(worker).toContain("pendingAppShellUrls.size >= MAX_APP_SHELL_URLS");
    expect(worker).toContain("appShellCacheInFlight = drainAppShellCacheQueue()");
    expect(worker).toContain("index += APP_SHELL_CACHE_CONCURRENCY");
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).toContain("url.pathname.startsWith('/api/')");
    expect(worker).toContain("private|no-store");
    expect(worker).toContain("event.data?.type !== 'CACHE_CURRENT_APP_SHELL'");
    expect(main).toContain("performance.getEntriesByType('resource')");
    expect(main).toContain("CACHE_CURRENT_APP_SHELL");
    expect(main).toContain("CURRENT_APP_SHELL_CACHED");
  });

  it("coalesces overlapping app-shell requests instead of creating a reload storm", () => {
    const worker = readFileSync(resolve(process.cwd(), "client/public/sw.js"), "utf8");

    expect(worker).toContain("let appShellCacheInFlight = null");
    expect(worker).toContain("if (!appShellCacheInFlight)");
    expect(worker).toContain("for (const url of urls) pendingAppShellUrls.delete(url)");
    expect(worker).toContain("requestCurrentAppShellCache(event.data.urls)");
    expect(worker).not.toContain("cacheCurrentAppShell(event.data.urls)");
    expect(worker).not.toContain("pendingAppShellUrls.clear()");
  });
});
