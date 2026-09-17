import { z } from "zod";

export const bridgePermissionsSchema = z.object({ read: z.boolean(), send: z.boolean() }).strict();

export const createMessageBridgePairingSchema = z.object({
  displayName: z.string().trim().min(1).max(80).default("My Mac"),
  permissions: bridgePermissionsSchema.refine((value) => value.read || value.send, { message: "Choose at least one bridge capability." }),
}).strict();

// iMessage addresses are either a phone number or an Apple Account email.
// Keep this intentionally narrow: a bridge must never be used as a generic
// AppleScript command surface.
export const createBridgeConversationSchema = z.object({
  deviceId: z.string().uuid(),
  recipientHandle: z.string().trim().min(3).max(320).regex(/^[+()\-\s\dA-Za-z@._]+$/, "Enter an iMessage phone number or email address."),
  // When provided, a new channel belongs to this existing person-level
  // conversation rather than creating a second chat for the same person.
  conversationId: z.string().uuid().nullable().default(null),
}).strict();

export const claimMessageBridgeSchema = z.object({
  pairingCode: z.string().trim().min(32).max(256),
  displayName: z.string().trim().min(1).max(80),
  publicKey: z.string().trim().min(32).max(4096).nullable().default(null),
}).strict();

export const bridgeInboundMessageSchema = z.object({
  threadId: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(160),
  recipientHandle: z.string().trim().min(1).max(320).nullable().default(null),
  providerMessageId: z.string().trim().min(1).max(500),
  direction: z.enum(["inbound", "outbound"]),
  body: z.string().max(10_000),
  occurredAt: z.string().datetime(),
  status: z.enum(["sent", "delivered", "read", "received", "failed"]).default("received"),
}).strict();

export const completeMessageBridgeCommandSchema = z.object({
  state: z.enum(["sent", "delivered", "failed"]),
  providerMessageId: z.string().trim().min(1).max(500).nullable().default(null),
  failureCode: z.string().trim().min(1).max(120).nullable().default(null),
}).strict();
