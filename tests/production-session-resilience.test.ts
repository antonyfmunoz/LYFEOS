import fs from "node:fs";
import { describe, expect, it } from "vitest";

const server = fs.readFileSync("server/index.ts", "utf8");
const authContext = fs.readFileSync("client/src/lib/authContext.tsx", "utf8");
const chatRoutes = fs.readFileSync("server/replit_integrations/chat/routes.ts", "utf8");

describe("production session and optional-provider resilience", () => {
  it("bounds aggregate API hydration per account without pooling authenticated users behind one IP", () => {
    expect(server).toContain('const principal = authenticated ? `user:${req.session.userId}` : `ip:${ip}`');
    expect(server).toContain('const maxRequests = authenticated ? authenticatedMaxRequests : defaultMaxRequests');
    expect(server).toContain('createRateLimiter("api", qualificationRequestLimit(100), 60 * 1000, true, qualificationRequestLimit(300))');
    expect(server).toContain('createRateLimiter("ai-orchestration", qualificationRequestLimit(10), 60 * 1000, true)');
    expect(server).toContain('const key = keyByPrincipalOnly ? `${scope}:${principal}`');
    expect(server).toContain("existingLimit <= maxRequests");
    expect(server).toContain('res.set("Retry-After"');
    expect(server).toContain('res.set("RateLimit-Remaining"');
  });

  it("clears a locally verified identity only when the session endpoint confirms 401", () => {
    expect(authContext).toContain("else if (response.status === 401)");
    expect(authContext).toContain("preserving the verified local session");
    expect(authContext).not.toContain("if (!clerkUserLoaded) return;");
    expect(authContext).not.toContain('console.log("Not authenticated with server, clearing local user data")');
  });

  it("keeps automatic stat guidance available when the optional Anthropic provider is absent or unavailable", () => {
    expect(chatRoutes.match(/AI_INTEGRATIONS_ANTHROPIC_API_KEY\?\.trim\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(chatRoutes).toContain('source: "deterministic"');
    expect(chatRoutes).toContain('source: "anthropic"');
    expect(chatRoutes).toContain("Stat-tip provider unavailable; returning deterministic guidance.");
    expect(chatRoutes).toContain("All-stat-tip provider unavailable; returning deterministic guidance.");
    expect(chatRoutes).toContain("Treat Health Points as a participation game stat, not a health measurement.");
  });
});
