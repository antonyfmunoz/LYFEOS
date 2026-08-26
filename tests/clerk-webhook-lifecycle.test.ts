import { describe, expect, it, vi } from "vitest";
import {
  applyClerkUserLifecycleEvent,
  type ClerkLifecycleDependencies,
  type ClerkLifecycleUser,
} from "../server/clerk-webhook-lifecycle";

function dependencies(seed: ClerkLifecycleUser[] = []): ClerkLifecycleDependencies & { users: ClerkLifecycleUser[] } {
  const users = seed.map((user) => ({ ...user }));
  return {
    users,
    getUserByClerkId: async (clerkId) => users.find((user) => user.clerkId === clerkId),
    getUserByEmail: async (email) => users.find((user) => user.email === email),
    provisionUser: vi.fn(async (input) => {
      const user = { id: users.length + 1, authProvider: "clerk", password: null, ...input };
      users.push(user);
      return user;
    }),
    updateUser: vi.fn(async (id, patch) => {
      const user = users.find((candidate) => candidate.id === id);
      if (!user) throw new Error("missing user");
      Object.assign(user, patch);
      return user;
    }),
    deleteLocalAccountData: vi.fn(async (id) => {
      const index = users.findIndex((candidate) => candidate.id === id);
      if (index >= 0) users.splice(index, 1);
    }),
  };
}

const clerkPayload = {
  id: "user_clerk_1",
  primary_email_address_id: "primary",
  email_addresses: [
    { id: "secondary", email_address: "secondary@example.com" },
    { id: "primary", email_address: "Primary@Example.com" },
  ],
  first_name: "  First ",
  last_name: " Last ",
};

describe("Clerk webhook user lifecycle", () => {
  it("provisions from the provider's primary email address", async () => {
    const deps = dependencies();
    const result = await applyClerkUserLifecycleEvent("user.created", clerkPayload, deps);
    expect(result).toEqual({ status: 200, body: { success: true, action: "created" } });
    expect(deps.users[0]).toMatchObject({
      clerkId: "user_clerk_1",
      email: "primary@example.com",
      firstName: "First",
      lastName: "Last",
    });
  });

  it("syncs provider-owned fields for a Clerk-owned account", async () => {
    const deps = dependencies([{ id: 7, clerkId: "user_clerk_1", authProvider: "clerk", email: "old@example.com" }]);
    const result = await applyClerkUserLifecycleEvent("user.updated", clerkPayload, deps);
    expect(result.body.action).toBe("updated");
    expect(deps.users[0]).toMatchObject({ email: "primary@example.com", firstName: "First", lastName: "Last" });
  });

  it("does not overwrite local credentials or profile fields on a linked local account", async () => {
    const deps = dependencies([{
      id: 3,
      clerkId: "user_clerk_1",
      authProvider: "email",
      password: "hash",
      email: "local@example.com",
      firstName: "Local",
    }]);
    const result = await applyClerkUserLifecycleEvent("user.updated", clerkPayload, deps);
    expect(result.body.action).toBe("updated");
    expect(deps.users[0]).toMatchObject({ email: "local@example.com", firstName: "Local" });
  });

  it("deletes a provider-only account after Clerk deletion", async () => {
    const deps = dependencies([{ id: 8, clerkId: "user_clerk_1", authProvider: "clerk", password: null }]);
    const result = await applyClerkUserLifecycleEvent("user.deleted", { id: "user_clerk_1", deleted: true }, deps);
    expect(result.body.action).toBe("deleted");
    expect(deps.users).toHaveLength(0);
  });

  it("only unlinks Clerk when the user retains local authentication", async () => {
    const deps = dependencies([{ id: 9, clerkId: "user_clerk_1", authProvider: "email", password: "hash" }]);
    const result = await applyClerkUserLifecycleEvent("user.deleted", { id: "user_clerk_1", deleted: true }, deps);
    expect(result.body.action).toBe("unlinked");
    expect(deps.users[0].clerkId).toBeNull();
  });

  it("rejects an email collision for an existing Clerk account", async () => {
    const deps = dependencies([
      { id: 10, clerkId: "user_clerk_1", authProvider: "clerk", email: "old@example.com" },
      { id: 11, authProvider: "email", email: "primary@example.com" },
    ]);
    const result = await applyClerkUserLifecycleEvent("user.updated", clerkPayload, deps);
    expect(result).toEqual({ status: 409, body: { error: "Webhook email conflicts with another account" } });
  });

  it("acknowledges unrelated event types without mutation", async () => {
    const deps = dependencies();
    const result = await applyClerkUserLifecycleEvent("session.created", {}, deps);
    expect(result.body.action).toBe("ignored");
    expect(deps.users).toHaveLength(0);
  });
});
