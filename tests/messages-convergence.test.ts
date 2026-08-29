import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canTransitionMessageConversation,
  addMessageParticipantsSchema,
  createMessageConversationSchema,
  nativeMessageReactions,
  queueNativeMessageSchema,
  toggleNativeMessageReactionSchema,
  updateMessageConversationStateSchema,
  updateNativeMessageSchema,
  validateMessageConversationState,
} from "../shared/messages";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("LyfeOS native Messages convergence", () => {
  it("uses the canonical conversation state machine and validates snooze evidence", () => {
    expect(canTransitionMessageConversation("open", "pending")).toBe(true);
    expect(canTransitionMessageConversation("closed", "pending")).toBe(false);
    expect(canTransitionMessageConversation("closed", "open")).toBe(true);
    const missingSnooze = updateMessageConversationStateSchema.parse({ status: "snoozed", expectedVersion: 1, snoozedUntil: null });
    expect(validateMessageConversationState(missingSnooze)).toContain("Choose when");
    expect(validateMessageConversationState({ status: "open", expectedVersion: 1, snoozedUntil: new Date(Date.now() + 10_000).toISOString() })).toContain("Only a snoozed");
  });

  it("bounds participants, content, reply targets, and retry identity", () => {
    expect(createMessageConversationSchema.safeParse({ participantUserIds: [2, 2], title: null }).success).toBe(true);
    expect(createMessageConversationSchema.parse({ participantUserIds: [2, 2], title: null }).participantUserIds).toEqual([2]);
    expect(createMessageConversationSchema.safeParse({ participantUserIds: [], title: null }).success).toBe(false);
    expect(queueNativeMessageSchema.safeParse({ body: "Hello", idempotencyKey: "retry-key-123", replyToMessageId: null }).success).toBe(true);
    expect(queueNativeMessageSchema.safeParse({ body: "", idempotencyKey: "short", replyToMessageId: null }).success).toBe(false);
    expect(queueNativeMessageSchema.safeParse({ body: "", idempotencyKey: "attachment-only-123", replyToMessageId: null, documentIds: [9] }).success).toBe(true);
    expect(queueNativeMessageSchema.safeParse({ body: "", idempotencyKey: "empty-message-123", replyToMessageId: null, documentIds: [] }).success).toBe(false);
    expect(updateNativeMessageSchema.safeParse({ body: "Updated", expectedVersion: 2 }).success).toBe(true);
    expect(updateNativeMessageSchema.safeParse({ body: "", expectedVersion: 2 }).success).toBe(false);
    expect(toggleNativeMessageReactionSchema.safeParse({ reaction: nativeMessageReactions[0] }).success).toBe(true);
    expect(toggleNativeMessageReactionSchema.safeParse({ reaction: "custom" }).success).toBe(false);
    expect(addMessageParticipantsSchema.parse({ userIds: [3, 3, 4] }).userIds).toEqual([3, 4]);
  });

  it("creates a separate canonical transport instead of overloading AI chat history", () => {
    const schema = source("shared/schema.ts");
    expect(schema).toContain('pgTable("message_conversations"');
    expect(schema).toContain('pgTable("conversation_messages"');
    expect(schema).toContain('pgTable("message_delivery_receipts"');
    expect(schema).toContain('pgTable("message_internal_notes"');
    expect(schema).toContain('pgTable("message_reactions"');
    expect(schema).toContain('pgTable("message_edit_history"');
    expect(schema).toContain("historical conversations/messages");
    expect(schema).toContain('export const conversations = pgTable("conversations"');
  });

  it("keeps the API participant-scoped, private, idempotent, and native-only", () => {
    const routes = source("server/routes/messages.ts");
    expect(routes).toContain('app.get("/api/message-hub/conversations", isAuthenticated');
    expect(routes).toContain("eq(messageConversationParticipants.userId, req.session.userId!)");
    expect(routes).toContain('res.setHeader("Cache-Control", "private, no-store, max-age=0")');
    expect(routes).toContain("pg_advisory_xact_lock");
    expect(routes).toContain("onConflictDoNothing");
    expect(routes).toContain('eventType: "MessageQueued.v1"');
    expect(routes).toContain('eventType: "MessageDelivered.v1"');
    expect(routes).toContain('eventType: "MessageRead.v1"');
    expect(routes).toContain('visibility: "author_only"');
    expect(routes).toContain('app.get("/api/message-hub/attachments/:attachmentId/file", isAuthenticated');
    expect(routes).toContain('app.post("/api/message-hub/conversations/:conversationId/block", isAuthenticated');
    expect(routes).toContain('eventType: "ConsentChanged.v1"');
    expect(routes).toContain('membership.status === "blocked"');
    expect(routes).toContain('explicitShare: true');
    expect(routes).toContain("immutableSnapshot: true");
    expect(routes).toContain('res.setHeader("X-Content-SHA256"');
    expect(routes).toContain("Attachments may total up to 20 MB per message");
    expect(routes).toContain('app.patch("/api/message-hub/messages/:messageId", isAuthenticated');
    expect(routes).toContain('app.delete("/api/message-hub/messages/:messageId", isAuthenticated');
    expect(routes).toContain('app.post("/api/message-hub/messages/:messageId/reaction", isAuthenticated');
    expect(routes).toContain('eventType: "MessageEdited.v1"');
    expect(routes).toContain('eventType: "MessageDeleted.v1"');
    expect(routes).toContain('eventType: "MessageReactionChanged.v1"');
    expect(routes).toContain('app.post("/api/message-hub/conversations/:conversationId/participants", isAuthenticated');
    expect(routes).toContain('app.post("/api/message-hub/conversations/:conversationId/leave", isAuthenticated');
    expect(routes).toContain('eventType: "ConversationParticipantRoleChanged.v1"');
    expect(routes).toContain("Promote another admin before leaving the group");
    expect(routes).toContain("eq(conversationMessages.version, input.expectedVersion)");
    expect(routes).toContain("existingDocumentIds.some");
    expect(routes).toContain("id: users.id");
    expect(routes).toContain("participantId: messageConversationParticipants.id");
    expect(routes).not.toContain("privateContext");
    expect(routes).not.toContain("healthProfiles");
    expect(routes).not.toContain("aiContextPreferences");
  });

  it("ships the migration through both ledgers with account rights coverage", () => {
    const migration = source("migrations/0098_native_messages.sql");
    const release = source("server/release-migrate.ts");
    const profile = source("server/routes/profile.ts");
    for (const table of ["message_conversations", "message_conversation_participants", "message_channel_bindings", "conversation_messages", "message_delivery_receipts", "message_internal_notes", "message_audit_events"]) {
      expect(migration).toContain(`\"${table}\"`);
      expect(release).toContain(`\"${table}\"`);
    }
    expect(release).toContain('id: "0098_native_messages"');
    expect(release).toContain('id: "0099_native_message_interactions"');
    expect(source("migrations/0099_native_message_interactions.sql")).toContain('"message_edit_history"');
    expect(source("migrations/0099_native_message_interactions.sql")).toContain('"snapshot_sha256"');
    expect(profile).toContain("message_reactions");
    expect(profile).toContain("message_edit_history");
    expect(profile).toContain("selectMessageHubRows");
    expect(profile).toContain('DELETE FROM "conversation_messages" WHERE "sender_user_id"');
    expect(profile).toContain('DELETE FROM "message_conversation_participants" WHERE "user_id"');
  });

  it("exposes a protected CreatorOS-style inbox without adding primary navigation clutter", () => {
    const app = source("client/src/App.tsx");
    const page = source("client/src/pages/MessagesPage.tsx");
    const rolodex = source("client/src/pages/RolodexPage.tsx");
    const sidebar = source("client/src/components/layout/Sidebar.tsx");
    expect(app).toContain('lazyRoute(() => import("./pages/MessagesPage"))');
    expect(app).toContain('<Route path="/messages">');
    expect(page).toContain("Native private communication");
    expect(page).toContain("Private note · only you");
    expect(page).toContain("idempotencyKey: crypto.randomUUID()");
    expect(page).toContain("Attach from Data Vault");
    expect(page).toContain("Conversation blocked");
    expect(page).toContain('aria-label="Edit message"');
    expect(page).toContain('aria-label="Delete message"');
    expect(page).toContain("nativeMessageReactions.map");
    expect(page).toContain("Group participants");
    expect(page).toContain("Leave group");
    expect(rolodex).toContain("navigate('/messages')");
    expect(sidebar).not.toContain('{ id: "messages"');
  });

  it("requires ownership for ordinary vault files and membership for shared attachment access", () => {
    const documents = source("server/routes/documents.ts");
    const legacyDocuments = source("server/routes/content.ts");
    const messages = source("server/routes/messages.ts");
    expect(documents).toContain('app.get("/api/documents/:id/file", isAuthenticated');
    expect(documents).toContain("doc.userId !== req.session.userId!");
    expect(documents).toContain("private, no-store, max-age=0");
    expect(documents).not.toContain("Cache-Control', 'public, max-age=86400");
    expect(legacyDocuments).toContain('return res.status(404).json({ error: "Document not found" })');
    expect(messages).toContain("await messageMembership(row.conversationId, req.session.userId!)");
    expect(messages).toContain("inArray(documents.id, input.documentIds)");
    expect(messages).toContain("Each attachment must be 10 MB or smaller");
  });

  it("requires the isolated PostgreSQL-backed Messages journey in CI", () => {
    const workflow = source(".github/workflows/verify.yml");
    expect(workflow).toContain("messages-integration:");
    expect(workflow).toContain("image: postgres:16-alpine");
    expect(workflow).toContain("Apply the complete raw migration history");
    expect(workflow).toContain("node dist/release-migrate.js");
    expect(workflow).toContain('second_pass="$(node dist/release-migrate.js)"');
    expect(workflow).toContain("LYFEOS_TEST_ENV: isolated");
    const server = source("server/index.ts");
    expect(server).toContain('process.env.LYFEOS_TEST_ENV === "isolated" && !process.env.FLY_APP_NAME');
    expect(server).toContain("qualificationRequestLimit(100)");
    expect(server).toContain('const principal = authenticated ? `user:${req.session.userId}` : `ip:${ip}`');
    expect(server).toContain("qualificationRequestLimit(5)");
    expect(workflow).toContain("npx vitest run tests/api-messages-convergence.test.ts tests/api-transformation-intelligence.test.ts");
  });
});
