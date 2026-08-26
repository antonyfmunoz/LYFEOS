import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("release identity contract", () => {
  it("exposes only non-sensitive source, image, environment, and migration identity", () => {
    const routes = source("server/routes.ts");
    const server = source("server/index.ts");
    expect(routes).toContain('app.get("/api/release"');
    expect(routes).toContain('res.setHeader("Cache-Control", "no-store, max-age=0")');
    expect(routes).toContain("process.env.LYFEOS_RELEASE");
    expect(routes).toContain("process.env.SENTRY_RELEASE");
    expect(routes).toContain("process.env.FLY_IMAGE_REF");
    expect(routes).toContain('FROM "lyfeos_schema_migrations"');
    expect(routes).toContain('service: "lyfeos"');
    expect(routes).not.toContain("CLERK_SECRET_KEY?.trim()");
    expect(routes).not.toContain("DATABASE_URL?.trim()");
    expect(server).toContain("process.env.LYFEOS_RELEASE?.trim() || process.env.SENTRY_RELEASE?.trim()");
    expect(server).toContain("sentryRelease,");
  });

  it("bakes an explicit source revision into the production image", () => {
    const dockerfile = source("Dockerfile");
    expect(dockerfile).toContain('ARG LYFEOS_RELEASE=""');
    expect(dockerfile).toContain("ENV LYFEOS_RELEASE=${LYFEOS_RELEASE}");
    expect(dockerfile).toContain("LABEL org.opencontainers.image.revision=${LYFEOS_RELEASE}");
  });
});
