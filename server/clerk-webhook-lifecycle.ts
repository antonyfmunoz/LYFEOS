type ClerkWebhookData = Record<string, any>;

export interface ClerkLifecycleUser {
  id: number;
  password?: string | null;
  authProvider?: string | null;
  clerkId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface ClerkLifecycleDependencies {
  getUserByClerkId(clerkId: string): Promise<ClerkLifecycleUser | undefined>;
  getUserByEmail(email: string): Promise<ClerkLifecycleUser | undefined>;
  provisionUser(seed: { clerkId: string; email: string; firstName?: string | null; lastName?: string | null }): Promise<ClerkLifecycleUser>;
  updateUser(id: number, patch: { clerkId?: string | null; email?: string; firstName?: string | null; lastName?: string | null }): Promise<ClerkLifecycleUser>;
  deleteLocalAccountData(userId: number): Promise<void>;
}

export interface ClerkLifecycleResult {
  status: number;
  body: { success?: true; action?: "created" | "updated" | "deleted" | "unlinked" | "ignored"; error?: string };
}

function primaryEmail(data: ClerkWebhookData): string | undefined {
  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : [];
  const primary = addresses.find((candidate: any) => candidate?.id === data.primary_email_address_id);
  const value = primary?.email_address ?? addresses[0]?.email_address;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}

function clerkIdentity(data: ClerkWebhookData): string | undefined {
  return typeof data.id === "string" && data.id.trim() ? data.id.trim() : undefined;
}

function names(data: ClerkWebhookData): { firstName: string | null; lastName: string | null } {
  return {
    firstName: typeof data.first_name === "string" && data.first_name.trim() ? data.first_name.trim() : null,
    lastName: typeof data.last_name === "string" && data.last_name.trim() ? data.last_name.trim() : null,
  };
}

export async function applyClerkUserLifecycleEvent(
  type: string,
  data: ClerkWebhookData,
  dependencies: ClerkLifecycleDependencies,
): Promise<ClerkLifecycleResult> {
  if (!["user.created", "user.updated", "user.deleted"].includes(type)) {
    return { status: 200, body: { success: true, action: "ignored" } };
  }

  const clerkId = clerkIdentity(data);
  if (!clerkId) return { status: 400, body: { error: "Webhook user identity is missing" } };

  if (type === "user.deleted") {
    const user = await dependencies.getUserByClerkId(clerkId);
    if (!user) return { status: 200, body: { success: true, action: "ignored" } };

    // A local-password account can be linked to Clerk without making Clerk its
    // sole identity authority. Provider deletion must not destroy that account.
    if (user.password || user.authProvider !== "clerk") {
      await dependencies.updateUser(user.id, { clerkId: null });
      return { status: 200, body: { success: true, action: "unlinked" } };
    }

    await dependencies.deleteLocalAccountData(user.id);
    return { status: 200, body: { success: true, action: "deleted" } };
  }

  const email = primaryEmail(data);
  if (!email) return { status: 400, body: { error: "Webhook user email is missing" } };
  const { firstName, lastName } = names(data);
  let user = await dependencies.getUserByClerkId(clerkId);

  if (!user) {
    user = await dependencies.provisionUser({ clerkId, email, firstName, lastName });
    if (type === "user.created") return { status: 200, body: { success: true, action: "created" } };
  }

  // Clerk is authoritative only for accounts provisioned by Clerk. For a
  // locally authenticated account that is merely linked, preserve the user's
  // locally managed email and profile fields.
  if (user.authProvider === "clerk") {
    const emailOwner = await dependencies.getUserByEmail(email);
    if (emailOwner && emailOwner.id !== user.id) {
      return { status: 409, body: { error: "Webhook email conflicts with another account" } };
    }
    await dependencies.updateUser(user.id, { email, firstName, lastName });
  }

  return { status: 200, body: { success: true, action: "updated" } };
}
