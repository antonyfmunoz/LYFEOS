import { describe, expect, it } from "vitest";
import {
  isDisplayNameUniqueViolation,
  oauthDisplayNameCandidate,
} from "../server/oauth-display-name";

const seed = {
  clerkId: "user_collision_test",
  email: "person@example.com",
  firstName: "Person",
  lastName: "Example",
};

describe("OAuth display-name allocation", () => {
  it("preserves the provider name when it is available", () => {
    expect(oauthDisplayNameCandidate(seed, 0)).toBe("Person Example");
  });

  it("uses a stable collision-safe fallback without changing the provider name fields", () => {
    const fallback = oauthDisplayNameCandidate(seed, 1);
    expect(fallback).toMatch(/^Person Example-[a-f0-9]{6}$/);
    expect(oauthDisplayNameCandidate(seed, 1)).toBe(fallback);
    expect(oauthDisplayNameCandidate(seed, 2)).toBe(`${fallback}-2`);
  });

  it("recognizes the wrapped Postgres display-name constraint", () => {
    expect(isDisplayNameUniqueViolation({ cause: { code: "23505", constraint: "users_display_name_lower_unique" } })).toBe(true);
    expect(isDisplayNameUniqueViolation({ cause: { code: "23505", constraint: "users_clerk_id_unique" } })).toBe(false);
  });
});
