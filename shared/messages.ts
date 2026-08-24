import { z } from "zod";

export const messageConversationStatuses = ["open", "pending", "snoozed", "closed", "spam"] as const;
export const messageConversationStatusSchema = z.enum(messageConversationStatuses);
export type MessageConversationStatus = z.infer<typeof messageConversationStatusSchema>;

export const messageAiModes = ["observe", "suggest", "approval", "delegated"] as const;
export const messageAiModeSchema = z.enum(messageAiModes);

const participantIdsSchema = z.array(z.number().int().positive()).min(1).max(20)
  .transform((ids) => Array.from(new Set(ids)));

export const createMessageConversationSchema = z.object({
  participantUserIds: participantIdsSchema,
  title: z.string().trim().min(1).max(160).nullable().default(null),
}).strict();

export const queueNativeMessageSchema = z.object({
  body: z.string().trim().max(10_000).default(""),
  idempotencyKey: z.string().trim().min(8).max(128),
  replyToMessageId: z.string().uuid().nullable().default(null),
  documentIds: z.array(z.number().int().positive()).max(5).transform((ids) => Array.from(new Set(ids))).default([]),
}).strict().refine((input) => input.body.length > 0 || input.documentIds.length > 0, { message: "Add a message or attachment." });

export const updateMessageBlockSchema = z.object({ blocked: z.boolean() }).strict();

export const addMessageParticipantsSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1).max(19).transform((ids) => Array.from(new Set(ids))),
}).strict();

export const updateMessageParticipantRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
}).strict();

export const updateNativeMessageSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  expectedVersion: z.number().int().positive(),
}).strict();

export const nativeMessageReactions = ["❤️", "👍", "🎉", "💪", "🔥"] as const;
export const toggleNativeMessageReactionSchema = z.object({
  reaction: z.enum(nativeMessageReactions),
}).strict();

export const updateMessageConversationStateSchema = z.object({
  status: messageConversationStatusSchema,
  expectedVersion: z.number().int().positive(),
  snoozedUntil: z.string().datetime().nullable().default(null),
}).strict();

export const addInternalMessageNoteSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
}).strict();

const conversationTransitions: Record<MessageConversationStatus, readonly MessageConversationStatus[]> = {
  open: ["pending", "snoozed", "closed", "spam"],
  pending: ["open", "snoozed", "closed", "spam"],
  snoozed: ["open", "pending", "closed", "spam"],
  closed: ["open"],
  spam: ["open"],
};

export function canTransitionMessageConversation(from: MessageConversationStatus, to: MessageConversationStatus): boolean {
  return from === to || conversationTransitions[from].includes(to);
}

export function validateMessageConversationState(input: z.infer<typeof updateMessageConversationStateSchema>, now = new Date()): string | null {
  if (input.status === "snoozed") {
    if (!input.snoozedUntil) return "Choose when this conversation should return.";
    if (new Date(input.snoozedUntil).getTime() <= now.getTime()) return "Snooze time must be in the future.";
  } else if (input.snoozedUntil) {
    return "Only a snoozed conversation can have a snooze time.";
  }
  return null;
}
