import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { ZodError, z } from "zod";
import {
  conversationMessages,
  documents,
  messageAuditEvents,
  messageAttachments,
  messageChannelBindings,
  messageConversationParticipants,
  messageConversations,
  messageDeliveryReceipts,
  messageEditHistory,
  messageInternalNotes,
  messageReactions,
  users,
} from "@shared/schema";
import {
  addInternalMessageNoteSchema,
  addMessageParticipantsSchema,
  canTransitionMessageConversation,
  createMessageConversationSchema,
  messageConversationStatusSchema,
  queueNativeMessageSchema,
  toggleNativeMessageReactionSchema,
  updateMessageConversationStateSchema,
  updateMessageBlockSchema,
  updateMessageParticipantRoleSchema,
  updateNativeMessageSchema,
  validateMessageConversationState,
} from "@shared/messages";
import { db } from "../db";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

const conversationIdSchema = z.string().uuid();
const messageIdSchema = z.string().uuid();

function snapshotDocument(document: typeof documents.$inferSelect) {
  if (document.fileData) {
    const match = document.fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("ATTACHMENT_DATA_UNAVAILABLE");
    const data = Buffer.from(match[2], "base64");
    return { data, base64: match[2], mimeType: match[1] };
  }
  const data = Buffer.from(document.content || "", "utf8");
  return { data, base64: data.toString("base64"), mimeType: document.format === "markdown" ? "text/markdown" : "text/plain" };
}

function requestError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid request." });
  logger.error("Messages request failed", { error: error instanceof Error ? error.message : "unknown" });
  return res.status(500).json({ error: "Messages request could not be completed." });
}

async function messageMembership(conversationId: string, userId: number) {
  const [membership] = await db.select().from(messageConversationParticipants).where(and(
    eq(messageConversationParticipants.conversationId, conversationId),
    eq(messageConversationParticipants.userId, userId),
    inArray(messageConversationParticipants.status, ["active", "blocked"]),
  )).limit(1);
  return membership;
}

async function conversationParticipants(conversationId: string) {
  return db.select({
    id: users.id,
    participantId: messageConversationParticipants.id,
    userId: messageConversationParticipants.userId,
    role: messageConversationParticipants.role,
    status: messageConversationParticipants.status,
    displayName: users.displayName,
    avatarUrl: users.avatarUrl,
    avatarColor: users.avatarColor,
  }).from(messageConversationParticipants)
    .innerJoin(users, eq(users.id, messageConversationParticipants.userId))
    .where(and(eq(messageConversationParticipants.conversationId, conversationId), eq(messageConversationParticipants.status, "active")))
    .orderBy(asc(messageConversationParticipants.joinedAt));
}

async function summarizeConversation(conversation: typeof messageConversations.$inferSelect, userId: number, membership?: typeof messageConversationParticipants.$inferSelect) {
  const ownMembership = membership ?? await messageMembership(conversation.id, userId);
  if (!ownMembership) return null;
  const [participants, latestRows, unreadResult] = await Promise.all([
    conversationParticipants(conversation.id),
    db.select({ id: conversationMessages.id, body: conversationMessages.body, senderUserId: conversationMessages.senderUserId, createdAt: conversationMessages.createdAt })
      .from(conversationMessages).where(eq(conversationMessages.conversationId, conversation.id)).orderBy(desc(conversationMessages.createdAt)).limit(1),
    db.execute(sql`
      SELECT count(*)::int AS count FROM "conversation_messages"
      WHERE "conversation_id" = ${conversation.id}
        AND "sender_user_id" IS DISTINCT FROM ${userId}
        AND (${ownMembership.lastReadAt}::timestamp IS NULL OR "created_at" > ${ownMembership.lastReadAt})
    `),
  ]);
  const unreadRows = (unreadResult as unknown as { rows?: Array<{ count: number | string }> }).rows || [];
  const unreadCount = Number(unreadRows[0]?.count || 0);
  const latest = latestRows[0] ?? null;
  return {
    ...conversation,
    status: ownMembership.inboxStatus,
    participantStatus: ownMembership.status,
    snoozedUntil: ownMembership.snoozedUntil,
    version: ownMembership.version,
    participants,
    unreadCount,
    latestMessage: latest ? { ...latest, body: latest.body.slice(0, 160), direction: latest.senderUserId === userId ? "outbound" : "inbound" } : null,
  };
}

async function conversationDetail(conversationId: string, userId: number) {
  const membership = await messageMembership(conversationId, userId);
  if (!membership) return null;
  const [conversation] = await db.select().from(messageConversations).where(eq(messageConversations.id, conversationId)).limit(1);
  if (!conversation) return null;
  const [summary, newestMessageRows, receipts, notes, bindings] = await Promise.all([
    summarizeConversation(conversation, userId, membership),
    db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId)).orderBy(desc(conversationMessages.createdAt)).limit(500),
    db.select().from(messageDeliveryReceipts)
      .innerJoin(conversationMessages, eq(conversationMessages.id, messageDeliveryReceipts.messageId))
      .where(eq(conversationMessages.conversationId, conversationId)).orderBy(asc(messageDeliveryReceipts.occurredAt)),
    db.select().from(messageInternalNotes).where(and(eq(messageInternalNotes.conversationId, conversationId), eq(messageInternalNotes.authorUserId, userId))).orderBy(asc(messageInternalNotes.createdAt)).limit(100),
    db.select().from(messageChannelBindings).where(eq(messageChannelBindings.conversationId, conversationId)),
  ]);
  const messageRows = newestMessageRows.reverse();
  const [attachmentRows, reactionRows] = messageRows.length ? await Promise.all([db.select({
    id: messageAttachments.id,
    messageId: messageAttachments.messageId,
    attachmentKind: messageAttachments.attachmentKind,
    filename: messageAttachments.filename,
    mimeType: messageAttachments.mimeType,
    sizeBytes: messageAttachments.sizeBytes,
    contentSha256: messageAttachments.snapshotSha256,
    createdAt: messageAttachments.createdAt,
  }).from(messageAttachments).where(inArray(messageAttachments.messageId, messageRows.map((message) => message.id))),
  db.select({ id: messageReactions.id, messageId: messageReactions.messageId, userId: messageReactions.userId, reaction: messageReactions.reaction })
    .from(messageReactions).where(inArray(messageReactions.messageId, messageRows.map((message) => message.id))),
  ]) : [[], []];
  const attachmentMap = new Map<string, typeof attachmentRows>();
  for (const attachment of attachmentRows) {
    const list = attachmentMap.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentMap.set(attachment.messageId, list);
  }
  const reactionMap = new Map<string, typeof reactionRows>();
  for (const reaction of reactionRows) {
    const list = reactionMap.get(reaction.messageId) ?? [];
    list.push(reaction);
    reactionMap.set(reaction.messageId, list);
  }
  const receiptMap = new Map<string, Array<typeof messageDeliveryReceipts.$inferSelect>>();
  for (const row of receipts) {
    const list = receiptMap.get(row.message_delivery_receipts.messageId) ?? [];
    list.push(row.message_delivery_receipts);
    receiptMap.set(row.message_delivery_receipts.messageId, list);
  }
  const participantCount = summary?.participants.filter((participant) => participant.status === "active").length ?? 1;
  return {
    ...summary,
    bindings,
    notes,
    messages: messageRows.map((message) => {
      const messageReceipts = receiptMap.get(message.id) ?? [];
      const recipientReadCount = new Set(messageReceipts.filter((receipt) => receipt.state === "read" && receipt.recipientUserId !== message.senderUserId).map((receipt) => receipt.recipientUserId)).size;
      return {
        ...message,
        direction: message.senderUserId === userId ? "outbound" : "inbound",
        status: message.senderUserId === userId && recipientReadCount >= Math.max(1, participantCount - 1) ? "read" : message.status,
        receipts: message.senderUserId === userId ? messageReceipts.map(({ evidence: _evidence, failureDetail: _failureDetail, ...receipt }) => receipt) : [],
        attachments: attachmentMap.get(message.id) ?? [],
        reactions: reactionMap.get(message.id) ?? [],
      };
    }),
  };
}

/** CreatorOS-compatible native inbox semantics with LyfeOS-private context boundaries. */
export function registerMessageRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/message-hub")) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Cookie");
    }
    next();
  });

  app.get("/api/message-hub/users", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = z.string().trim().min(2).max(80).safeParse(req.query.q);
    if (!parsed.success) return res.status(400).json({ error: "Search with at least two characters." });
    const escaped = parsed.data.replace(/[\\%_]/g, "\\$&");
    try {
      const matches = await db.select({ id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl, avatarColor: users.avatarColor })
        .from(users).where(and(ne(users.id, req.session.userId!), sql`${users.displayName} ILIKE ${`${escaped}%`} ESCAPE '\\'`)).orderBy(asc(users.displayName)).limit(12);
      return res.json({ users: matches.filter((user) => Boolean(user.displayName)) });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/message-hub/attachment-options", isAuthenticated, async (req: Request, res: Response) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const escaped = query.replace(/[\\%_]/g, "\\$&");
    try {
      const options = await db.select({ id: documents.id, title: documents.title, fileType: documents.fileType, mimeType: documents.mimeType, fileSize: documents.fileSize, format: documents.format, updatedAt: documents.updatedAt })
        .from(documents).where(and(eq(documents.userId, req.session.userId!), isNull(documents.deletedAt), query ? sql`${documents.title} ILIKE ${`%${escaped}%`} ESCAPE '\\'` : undefined))
        .orderBy(desc(documents.updatedAt)).limit(50);
      return res.json({ documents: options });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/message-hub/conversations", isAuthenticated, async (req: Request, res: Response) => {
    const status = req.query.status ? messageConversationStatusSchema.safeParse(req.query.status) : null;
    if (status && !status.success) return res.status(400).json({ error: "Invalid conversation state." });
    try {
      const memberships = await db.select({ participant: messageConversationParticipants, conversation: messageConversations })
        .from(messageConversationParticipants)
        .innerJoin(messageConversations, eq(messageConversations.id, messageConversationParticipants.conversationId))
        .where(and(
          eq(messageConversationParticipants.userId, req.session.userId!),
          inArray(messageConversationParticipants.status, ["active", "blocked"]),
          status?.success ? eq(messageConversationParticipants.inboxStatus, status.data) : undefined,
        )).orderBy(desc(messageConversations.updatedAt)).limit(100);
      const conversations = (await Promise.all(memberships.map(({ participant, conversation }) => summarizeConversation(conversation, req.session.userId!, participant)))).filter(Boolean);
      return res.json({ conversations });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const input = createMessageConversationSchema.parse(req.body);
      const userId = req.session.userId!;
      const participantUserIds = Array.from(new Set([userId, ...input.participantUserIds.filter((id) => id !== userId)]));
      if (participantUserIds.length < 2) return res.status(400).json({ error: "Choose at least one other LyfeOS user." });
      if (participantUserIds.length > 20) return res.status(400).json({ error: "A conversation can include up to 20 people." });
      const participantUsers = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(inArray(users.id, participantUserIds));
      if (participantUsers.length !== participantUserIds.length) return res.status(400).json({ error: "One or more participants are unavailable." });
      const kind = participantUserIds.length === 2 ? "direct" : "group";
      const sorted = [...participantUserIds].sort((a, b) => a - b);
      const created = await db.transaction(async (tx) => {
        if (kind === "direct") {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`lyfeos-native-message:${sorted.join(":")}`}, 0))`);
          const existingResult = await tx.execute(sql`
            SELECT c."id" FROM "message_conversations" c
            JOIN "message_conversation_participants" p ON p."conversation_id" = c."id" AND p."status" IN ('active', 'blocked')
            WHERE c."kind" = 'direct'
            GROUP BY c."id"
            HAVING count(*) = 2 AND array_agg(p."user_id" ORDER BY p."user_id") = ARRAY[${sorted[0]}, ${sorted[1]}]::integer[]
            LIMIT 1
          `);
          const existingId = (existingResult as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id;
          if (existingId) return { id: existingId, replayed: true };
        }
        const otherNames = participantUsers.filter((user) => user.id !== userId).map((user) => user.displayName || "LyfeOS user");
        const [conversation] = await tx.insert(messageConversations).values({
          createdByUserId: userId,
          title: input.title || (kind === "direct" ? otherNames[0] : otherNames.join(", ").slice(0, 160)),
          kind,
          status: "open",
          aiMode: "observe",
        }).returning();
        const participantValues = participantUserIds.map((participantUserId) => ({
          conversationId: conversation.id,
          userId: participantUserId,
          role: participantUserId === userId ? "admin" : "member",
        }));
        await tx.insert(messageConversationParticipants).values(participantValues);
        await tx.insert(messageChannelBindings).values({ conversationId: conversation.id, provider: "native", channelKind: "native", status: "active" });
        await tx.insert(messageAuditEvents).values({ conversationId: conversation.id, actorUserId: userId, eventType: "ConversationCreated.v1", aggregateVersion: 1, metadata: { participantCount: participantUserIds.length, channel: "native" } });
        return { id: conversation.id, replayed: false };
      });
      const detail = await conversationDetail(created.id, userId);
      return res.status(created.replayed ? 200 : 201).json({ conversation: detail, replayed: created.replayed });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/message-hub/conversations/:conversationId", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = conversationIdSchema.safeParse(req.params.conversationId);
    if (!parsed.success) return res.status(400).json({ error: "Invalid conversation ID." });
    try {
      const detail = await conversationDetail(parsed.data, req.session.userId!);
      if (!detail) return res.status(404).json({ error: "Conversation not found." });
      return res.json({ conversation: detail });
    } catch (error) { return requestError(res, error); }
  });

  app.get("/api/message-hub/attachments/:attachmentId/file", isAuthenticated, async (req: Request, res: Response) => {
    const attachmentId = z.string().uuid().safeParse(req.params.attachmentId);
    if (!attachmentId.success) return res.status(400).json({ error: "Invalid attachment ID." });
    try {
      const [row] = await db.select({ attachment: messageAttachments, conversationId: conversationMessages.conversationId, messageDeletedAt: conversationMessages.deletedAt, document: documents })
        .from(messageAttachments)
        .innerJoin(conversationMessages, eq(conversationMessages.id, messageAttachments.messageId))
        .leftJoin(documents, eq(documents.id, messageAttachments.documentId))
        .where(eq(messageAttachments.id, attachmentId.data)).limit(1);
      if (!row || row.messageDeletedAt || !(await messageMembership(row.conversationId, req.session.userId!))) return res.status(404).json({ error: "Attachment not found." });
      const filename = (row.attachment.filename || row.document?.title || "attachment").replace(/[\r\n"\\]/g, "_").slice(0, 180);
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Vary", "Cookie");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      if (row.attachment.snapshotData) {
        const buffer = Buffer.from(row.attachment.snapshotData, "base64");
        res.setHeader("Content-Type", row.attachment.mimeType || "application/octet-stream");
        res.setHeader("Content-Length", String(buffer.length));
        if (row.attachment.snapshotSha256) res.setHeader("X-Content-SHA256", row.attachment.snapshotSha256);
        return res.send(buffer);
      }
      if (row.document?.fileData) {
        const match = row.document.fileData.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return res.status(409).json({ error: "Attachment file data is unavailable." });
        const buffer = Buffer.from(match[2], "base64");
        res.setHeader("Content-Type", match[1]);
        res.setHeader("Content-Length", String(buffer.length));
        return res.send(buffer);
      }
      if (!row.document || row.document.deletedAt) return res.status(404).json({ error: "Attachment not found." });
      const body = row.document.content || "";
      res.setHeader("Content-Type", row.document.format === "markdown" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8");
      return res.send(body);
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const input = queueNativeMessageSchema.parse(req.body);
      const userId = req.session.userId!;
      const membership = await messageMembership(conversationId, userId);
      if (!membership) return res.status(404).json({ error: "Conversation not found." });
      if (membership.status === "blocked") return res.status(409).json({ error: "Unblock this conversation before replying." });
      if (!["open", "pending"].includes(membership.inboxStatus)) return res.status(409).json({ error: "Reopen this conversation before replying." });
      const [binding] = await db.select().from(messageChannelBindings).where(and(eq(messageChannelBindings.conversationId, conversationId), eq(messageChannelBindings.provider, "native"), eq(messageChannelBindings.status, "active"))).limit(1);
      if (!binding) return res.status(409).json({ error: "No active native channel is available." });
      if (input.replyToMessageId) {
        const [replyTarget] = await db.select({ conversationId: conversationMessages.conversationId }).from(conversationMessages).where(eq(conversationMessages.id, input.replyToMessageId)).limit(1);
        if (!replyTarget || replyTarget.conversationId !== conversationId) return res.status(400).json({ error: "Reply target is outside this conversation." });
      }
      const participants = await db.select().from(messageConversationParticipants).where(eq(messageConversationParticipants.conversationId, conversationId));
      const recipients = participants.filter((participant) => participant.userId !== userId && participant.status === "active");
      if (!recipients.length) return res.status(409).json({ error: "This conversation has no available recipient." });
      const attachedDocuments = input.documentIds.length ? await db.select().from(documents).where(and(eq(documents.userId, userId), inArray(documents.id, input.documentIds), isNull(documents.deletedAt))) : [];
      if (attachedDocuments.length !== input.documentIds.length) return res.status(400).json({ error: "One or more attached documents are unavailable." });
      const snapshots = attachedDocuments.map((document) => ({ document, snapshot: snapshotDocument(document) }));
      if (snapshots.some(({ snapshot }) => snapshot.data.length > 10 * 1024 * 1024)) return res.status(413).json({ error: "Each attachment must be 10 MB or smaller." });
      if (snapshots.reduce((total, { snapshot }) => total + snapshot.data.length, 0) > 20 * 1024 * 1024) return res.status(413).json({ error: "Attachments may total up to 20 MB per message." });
      const result = await db.transaction(async (tx) => {
        const [queued] = await tx.insert(conversationMessages).values({
          conversationId,
          senderUserId: userId,
          senderParticipantRef: membership.id,
          body: input.body,
          replyToMessageId: input.replyToMessageId,
          idempotencyKey: input.idempotencyKey,
          status: "queued",
          provider: "native",
          direction: "outbound",
        }).onConflictDoNothing({ target: [conversationMessages.senderUserId, conversationMessages.idempotencyKey] }).returning();
        if (!queued) {
          const [existing] = await tx.select().from(conversationMessages).where(and(eq(conversationMessages.senderUserId, userId), eq(conversationMessages.idempotencyKey, input.idempotencyKey))).limit(1);
          if (!existing || existing.conversationId !== conversationId) throw new Error("MESSAGE_IDEMPOTENCY_CONFLICT");
          const existingAttachments = await tx.select({ documentId: messageAttachments.documentId }).from(messageAttachments).where(eq(messageAttachments.messageId, existing.id));
          const existingDocumentIds = existingAttachments.map((attachment) => attachment.documentId).filter((id): id is number => id != null).sort((a, b) => a - b);
          const requestedDocumentIds = [...input.documentIds].sort((a, b) => a - b);
          if (existing.body !== input.body || existing.replyToMessageId !== input.replyToMessageId || existingDocumentIds.length !== requestedDocumentIds.length || existingDocumentIds.some((id, index) => id !== requestedDocumentIds[index])) throw new Error("MESSAGE_IDEMPOTENCY_CONFLICT");
          return { message: existing, replayed: true };
        }
        const now = new Date();
        const [conversation] = await tx.update(messageConversations).set({ lastMessageAt: now, updatedAt: now, version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        const [delivered] = await tx.update(conversationMessages).set({ status: "delivered", sentAt: now, receivedAt: now, updatedAt: now }).where(eq(conversationMessages.id, queued.id)).returning();
        if (snapshots.length) await tx.insert(messageAttachments).values(snapshots.map(({ document, snapshot }) => ({
          messageId: queued.id,
          documentId: document.id,
          attachmentKind: document.fileData ? "file_ref" : "document_ref",
          filename: document.title,
          mimeType: document.mimeType || snapshot.mimeType,
          sizeBytes: snapshot.data.length,
          snapshotData: snapshot.base64,
          snapshotSha256: createHash("sha256").update(snapshot.data).digest("hex"),
          snapshotAt: now,
          metadata: { source: "lyfeos_document", explicitShare: true, immutableSnapshot: true },
        })));
        await tx.insert(messageDeliveryReceipts).values(recipients.flatMap((recipient) => [
          { messageId: queued.id, recipientUserId: recipient.userId, provider: "native", state: "accepted", occurredAt: now, evidence: { assertion: "local_transaction_commit" } },
          { messageId: queued.id, recipientUserId: recipient.userId, provider: "native", state: "sent", occurredAt: now, evidence: { assertion: "local_transaction_commit" } },
          { messageId: queued.id, recipientUserId: recipient.userId, provider: "native", state: "delivered", occurredAt: now, evidence: { assertion: "recipient_inbox_committed" } },
        ]));
        await tx.insert(messageAuditEvents).values([
          { conversationId, messageId: queued.id, actorUserId: userId, eventType: "MessageQueued.v1", aggregateVersion: conversation.version, metadata: { provider: "native" } },
          { conversationId, messageId: queued.id, actorUserId: userId, eventType: "MessageSent.v1", aggregateVersion: conversation.version, metadata: { provider: "native" } },
          { conversationId, messageId: queued.id, actorUserId: userId, eventType: "MessageDelivered.v1", aggregateVersion: conversation.version, metadata: { provider: "native", recipientCount: recipients.length, attachmentCount: snapshots.length } },
        ]);
        return { message: delivered, replayed: false };
      });
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "MESSAGE_IDEMPOTENCY_CONFLICT") return res.status(409).json({ error: "That retry key belongs to another message." });
      if (error instanceof Error && error.message === "ATTACHMENT_DATA_UNAVAILABLE") return res.status(409).json({ error: "One or more attachment files could not be read." });
      return requestError(res, error);
    }
  });

  app.patch("/api/message-hub/messages/:messageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = messageIdSchema.parse(req.params.messageId);
      const input = updateNativeMessageSchema.parse(req.body);
      const userId = req.session.userId!;
      const [existing] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, messageId)).limit(1);
      if (!existing || existing.deletedAt) return res.status(404).json({ error: "Message not found." });
      if (existing.senderUserId !== userId) return res.status(403).json({ error: "You can only edit your own message." });
      const membership = await messageMembership(existing.conversationId, userId);
      if (!membership) return res.status(404).json({ error: "Message not found." });
      if (membership.status !== "active") return res.status(409).json({ error: "Unblock this conversation before editing a message." });
      if (existing.version !== input.expectedVersion) return res.status(409).json({ error: "This message changed in another session. Refresh before editing it." });
      if (existing.body === input.body) return res.json({ message: existing });
      const updated = await db.transaction(async (tx) => {
        const now = new Date();
        const [message] = await tx.update(conversationMessages).set({ body: input.body, editedAt: now, updatedAt: now, version: input.expectedVersion + 1 })
          .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.version, input.expectedVersion), isNull(conversationMessages.deletedAt))).returning();
        if (!message) return null;
        await tx.insert(messageEditHistory).values({ messageId, editorUserId: userId, priorBody: existing.body, replacementBody: input.body, priorVersion: existing.version, editedAt: now });
        const [conversation] = await tx.update(messageConversations).set({ updatedAt: now, version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, existing.conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId: existing.conversationId, messageId, actorUserId: userId, eventType: "MessageEdited.v1", aggregateVersion: conversation.version, metadata: { priorVersion: existing.version, version: message.version } });
        return message;
      });
      if (!updated) return res.status(409).json({ error: "This message changed in another session. Refresh before editing it." });
      return res.json({ message: updated });
    } catch (error) { return requestError(res, error); }
  });

  app.delete("/api/message-hub/messages/:messageId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = messageIdSchema.parse(req.params.messageId);
      const expectedVersion = z.coerce.number().int().positive().parse(req.query.expectedVersion);
      const userId = req.session.userId!;
      const [existing] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, messageId)).limit(1);
      if (!existing || existing.deletedAt) return res.status(404).json({ error: "Message not found." });
      if (existing.senderUserId !== userId) return res.status(403).json({ error: "You can only delete your own message." });
      const membership = await messageMembership(existing.conversationId, userId);
      if (!membership) return res.status(404).json({ error: "Message not found." });
      if (membership.status !== "active") return res.status(409).json({ error: "Unblock this conversation before deleting a message." });
      const deleted = await db.transaction(async (tx) => {
        const now = new Date();
        const [message] = await tx.update(conversationMessages).set({ body: "[deleted]", deletedAt: now, updatedAt: now, version: expectedVersion + 1 })
          .where(and(eq(conversationMessages.id, messageId), eq(conversationMessages.version, expectedVersion), isNull(conversationMessages.deletedAt))).returning();
        if (!message) return null;
        await tx.delete(messageAttachments).where(eq(messageAttachments.messageId, messageId));
        await tx.delete(messageReactions).where(eq(messageReactions.messageId, messageId));
        const [conversation] = await tx.update(messageConversations).set({ updatedAt: now, version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, existing.conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId: existing.conversationId, messageId, actorUserId: userId, eventType: "MessageDeleted.v1", aggregateVersion: conversation.version, metadata: { priorVersion: existing.version, version: message.version, attachmentsRevoked: true } });
        return message;
      });
      if (!deleted) return res.status(409).json({ error: "This message changed in another session. Refresh before deleting it." });
      return res.json({ message: deleted });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/messages/:messageId/reaction", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageId = messageIdSchema.parse(req.params.messageId);
      const input = toggleNativeMessageReactionSchema.parse(req.body);
      const userId = req.session.userId!;
      const [message] = await db.select().from(conversationMessages).where(eq(conversationMessages.id, messageId)).limit(1);
      if (!message || message.deletedAt) return res.status(404).json({ error: "Message not found." });
      const membership = await messageMembership(message.conversationId, userId);
      if (!membership) return res.status(404).json({ error: "Message not found." });
      if (membership.status !== "active") return res.status(409).json({ error: "Unblock this conversation before reacting." });
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(messageReactions).where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId))).limit(1);
        let active = true;
        if (existing?.reaction === input.reaction) {
          await tx.delete(messageReactions).where(eq(messageReactions.id, existing.id));
          active = false;
        } else {
          await tx.insert(messageReactions).values({ messageId, userId, reaction: input.reaction }).onConflictDoUpdate({
            target: [messageReactions.messageId, messageReactions.userId],
            set: { reaction: input.reaction, updatedAt: new Date() },
          });
        }
        const [conversation] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, message.conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId: message.conversationId, messageId, actorUserId: userId, eventType: "MessageReactionChanged.v1", aggregateVersion: conversation.version, metadata: { reaction: input.reaction, active } });
        return { active };
      });
      return res.json(result);
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/read", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = conversationIdSchema.safeParse(req.params.conversationId);
    if (!parsed.success) return res.status(400).json({ error: "Invalid conversation ID." });
    try {
      const userId = req.session.userId!;
      const membership = await messageMembership(parsed.data, userId);
      if (!membership) return res.status(404).json({ error: "Conversation not found." });
      const incoming = await db.select().from(conversationMessages).where(and(eq(conversationMessages.conversationId, parsed.data), or(ne(conversationMessages.senderUserId, userId), sql`${conversationMessages.senderUserId} IS NULL`))).orderBy(desc(conversationMessages.createdAt)).limit(500);
      const latest = incoming[0];
      if (!latest) return res.json({ read: 0 });
      await db.transaction(async (tx) => {
        const now = new Date();
        await tx.update(messageConversationParticipants).set({ lastReadMessageId: latest.id, lastReadAt: now }).where(eq(messageConversationParticipants.id, membership.id));
        await tx.insert(messageDeliveryReceipts).values(incoming.map((message) => ({ messageId: message.id, recipientUserId: userId, provider: "native", state: "read", occurredAt: now, evidence: { assertion: "participant_opened_conversation" } }))).onConflictDoNothing();
        await tx.insert(messageAuditEvents).values({ conversationId: parsed.data, messageId: latest.id, actorUserId: userId, eventType: "MessageRead.v1", aggregateVersion: membership.version, metadata: { readCount: incoming.length } });
      });
      return res.json({ read: incoming.length, lastReadMessageId: latest.id });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/state", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const input = updateMessageConversationStateSchema.parse(req.body);
      const validation = validateMessageConversationState(input);
      if (validation) return res.status(400).json({ error: validation });
      const membership = await messageMembership(conversationId, req.session.userId!);
      if (!membership) return res.status(404).json({ error: "Conversation not found." });
      if (membership.status === "blocked") return res.status(409).json({ error: "Unblock this conversation before changing its inbox state." });
      const from = messageConversationStatusSchema.parse(membership.inboxStatus);
      if (!canTransitionMessageConversation(from, input.status)) return res.status(409).json({ error: `Conversation cannot move from ${from} to ${input.status}.` });
      if (input.status === from && membership.version === input.expectedVersion) return res.json({ conversation: await conversationDetail(conversationId, req.session.userId!) });
      const updated = await db.transaction(async (tx) => {
        const [participant] = await tx.update(messageConversationParticipants).set({
          inboxStatus: input.status,
          snoozedUntil: input.status === "snoozed" ? new Date(input.snoozedUntil!) : null,
          version: input.expectedVersion + 1,
        }).where(and(eq(messageConversationParticipants.id, membership.id), eq(messageConversationParticipants.version, input.expectedVersion))).returning();
        if (!participant) return null;
        const [conversation] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        const eventType = input.status === "snoozed" ? "ConversationSnoozed.v1" : input.status === "open" && ["closed", "spam"].includes(from) ? "ConversationReopened.v1" : "ConversationStateChanged.v1";
        await tx.insert(messageAuditEvents).values({ conversationId, actorUserId: req.session.userId!, eventType, aggregateVersion: conversation.version, metadata: { from, to: input.status } });
        return participant;
      });
      if (!updated) return res.status(409).json({ error: "Conversation changed in another session. Refresh before updating it." });
      return res.json({ conversation: await conversationDetail(conversationId, req.session.userId!) });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/notes", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const input = addInternalMessageNoteSchema.parse(req.body);
      const membership = await messageMembership(conversationId, req.session.userId!);
      if (!membership) return res.status(404).json({ error: "Conversation not found." });
      const note = await db.transaction(async (tx) => {
        const [created] = await tx.insert(messageInternalNotes).values({ conversationId, authorUserId: req.session.userId!, body: input.body, visibility: "author_only" }).returning();
        const [conversation] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId, actorUserId: req.session.userId!, eventType: "InternalNoteAdded.v1", aggregateVersion: conversation.version, metadata: { visibility: "author_only" } });
        return created;
      });
      return res.status(201).json({ note });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/participants", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const input = addMessageParticipantsSchema.parse(req.body);
      const userId = req.session.userId!;
      const membership = await messageMembership(conversationId, userId);
      const [conversation] = await db.select().from(messageConversations).where(eq(messageConversations.id, conversationId)).limit(1);
      if (!membership || !conversation) return res.status(404).json({ error: "Conversation not found." });
      if (conversation.kind !== "group") return res.status(409).json({ error: "Participants can only be managed in group conversations." });
      if (membership.status !== "active" || membership.role !== "admin") return res.status(403).json({ error: "Only an active group admin can add participants." });
      const targetIds = input.userIds.filter((id) => id !== userId);
      if (!targetIds.length) return res.status(400).json({ error: "Choose another LyfeOS user." });
      const [targetUsers, participants] = await Promise.all([
        db.select({ id: users.id }).from(users).where(inArray(users.id, targetIds)),
        db.select().from(messageConversationParticipants).where(eq(messageConversationParticipants.conversationId, conversationId)),
      ]);
      if (targetUsers.length !== targetIds.length) return res.status(400).json({ error: "One or more participants are unavailable." });
      const existingByUser = new Map(participants.map((participant) => [participant.userId, participant]));
      if (targetIds.some((id) => existingByUser.get(id)?.status === "blocked")) return res.status(409).json({ error: "A blocked participant cannot be re-added by a group admin." });
      const additions = targetIds.filter((id) => existingByUser.get(id)?.status !== "active");
      if (participants.filter((participant) => participant.status === "active").length + additions.length > 20) return res.status(409).json({ error: "A conversation can include up to 20 active people." });
      if (additions.length) await db.transaction(async (tx) => {
        for (const targetId of additions) {
          const prior = existingByUser.get(targetId);
          if (prior) await tx.update(messageConversationParticipants).set({ status: "active", role: "member", inboxStatus: "open", snoozedUntil: null, leftAt: null, version: sql`${messageConversationParticipants.version} + 1` }).where(eq(messageConversationParticipants.id, prior.id));
          else await tx.insert(messageConversationParticipants).values({ conversationId, userId: targetId, role: "member", status: "active", inboxStatus: "open" });
        }
        const [updated] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId, actorUserId: userId, eventType: "ConversationParticipantsAdded.v1", aggregateVersion: updated.version, metadata: { participantCount: additions.length } });
      });
      return res.json({ conversation: await conversationDetail(conversationId, userId) });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/participants/:participantUserId/role", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const targetUserId = z.coerce.number().int().positive().parse(req.params.participantUserId);
      const input = updateMessageParticipantRoleSchema.parse(req.body);
      const userId = req.session.userId!;
      const membership = await messageMembership(conversationId, userId);
      const [conversation] = await db.select().from(messageConversations).where(eq(messageConversations.id, conversationId)).limit(1);
      if (!membership || !conversation) return res.status(404).json({ error: "Conversation not found." });
      if (conversation.kind !== "group" || membership.status !== "active" || membership.role !== "admin") return res.status(403).json({ error: "Only an active group admin can change roles." });
      const participants = await db.select().from(messageConversationParticipants).where(and(eq(messageConversationParticipants.conversationId, conversationId), eq(messageConversationParticipants.status, "active")));
      const target = participants.find((participant) => participant.userId === targetUserId);
      if (!target) return res.status(404).json({ error: "Participant not found." });
      if (target.role === input.role) return res.json({ conversation: await conversationDetail(conversationId, userId) });
      if (target.role === "admin" && input.role === "member" && participants.filter((participant) => participant.role === "admin").length === 1) return res.status(409).json({ error: "Promote another admin before removing the final admin." });
      await db.transaction(async (tx) => {
        await tx.update(messageConversationParticipants).set({ role: input.role, version: sql`${messageConversationParticipants.version} + 1` }).where(eq(messageConversationParticipants.id, target.id));
        const [updated] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId, actorUserId: userId, eventType: "ConversationParticipantRoleChanged.v1", aggregateVersion: updated.version, metadata: { participantUserId: targetUserId, from: target.role, to: input.role } });
      });
      return res.json({ conversation: await conversationDetail(conversationId, userId) });
    } catch (error) { return requestError(res, error); }
  });

  app.delete("/api/message-hub/conversations/:conversationId/participants/:participantUserId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const targetUserId = z.coerce.number().int().positive().parse(req.params.participantUserId);
      const userId = req.session.userId!;
      if (targetUserId === userId) return res.status(409).json({ error: "Use Leave group to remove yourself." });
      const membership = await messageMembership(conversationId, userId);
      const [conversation] = await db.select().from(messageConversations).where(eq(messageConversations.id, conversationId)).limit(1);
      if (!membership || !conversation) return res.status(404).json({ error: "Conversation not found." });
      if (conversation.kind !== "group" || membership.status !== "active" || membership.role !== "admin") return res.status(403).json({ error: "Only an active group admin can remove participants." });
      const participants = await db.select().from(messageConversationParticipants).where(and(eq(messageConversationParticipants.conversationId, conversationId), eq(messageConversationParticipants.status, "active")));
      const target = participants.find((participant) => participant.userId === targetUserId);
      if (!target) return res.status(404).json({ error: "Participant not found." });
      if (target.role === "admin" && participants.filter((participant) => participant.role === "admin").length === 1) return res.status(409).json({ error: "Promote another admin before removing the final admin." });
      await db.transaction(async (tx) => {
        await tx.update(messageConversationParticipants).set({ status: "left", inboxStatus: "closed", snoozedUntil: null, leftAt: new Date(), version: sql`${messageConversationParticipants.version} + 1` }).where(eq(messageConversationParticipants.id, target.id));
        const [updated] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId, actorUserId: userId, eventType: "ConversationParticipantRemoved.v1", aggregateVersion: updated.version, metadata: { participantUserId: targetUserId } });
      });
      return res.json({ conversation: await conversationDetail(conversationId, userId) });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/leave", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const userId = req.session.userId!;
      const membership = await messageMembership(conversationId, userId);
      const [conversation] = await db.select().from(messageConversations).where(eq(messageConversations.id, conversationId)).limit(1);
      if (!membership || !conversation) return res.status(404).json({ error: "Conversation not found." });
      if (conversation.kind !== "group") return res.status(409).json({ error: "Direct conversations can be blocked or closed, not left." });
      if (membership.status !== "active") return res.status(409).json({ error: "This group is not active for your account." });
      const participants = await db.select().from(messageConversationParticipants).where(and(eq(messageConversationParticipants.conversationId, conversationId), eq(messageConversationParticipants.status, "active")));
      if (membership.role === "admin" && participants.length > 1 && participants.filter((participant) => participant.role === "admin").length === 1) return res.status(409).json({ error: "Promote another admin before leaving the group." });
      await db.transaction(async (tx) => {
        await tx.update(messageConversationParticipants).set({ status: "left", inboxStatus: "closed", snoozedUntil: null, leftAt: new Date(), version: sql`${messageConversationParticipants.version} + 1` }).where(eq(messageConversationParticipants.id, membership.id));
        const [updated] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId, actorUserId: userId, eventType: "ConversationParticipantLeft.v1", aggregateVersion: updated.version, metadata: { participantUserId: userId } });
      });
      return res.json({ left: true });
    } catch (error) { return requestError(res, error); }
  });

  app.post("/api/message-hub/conversations/:conversationId/block", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = conversationIdSchema.parse(req.params.conversationId);
      const input = updateMessageBlockSchema.parse(req.body);
      const membership = await messageMembership(conversationId, req.session.userId!);
      if (!membership) return res.status(404).json({ error: "Conversation not found." });
      if ((membership.status === "blocked") === input.blocked) return res.json({ conversation: await conversationDetail(conversationId, req.session.userId!) });
      await db.transaction(async (tx) => {
        const nextVersion = membership.version + 1;
        await tx.update(messageConversationParticipants).set({
          status: input.blocked ? "blocked" : "active",
          inboxStatus: input.blocked ? "spam" : "open",
          snoozedUntil: null,
          version: nextVersion,
        }).where(eq(messageConversationParticipants.id, membership.id));
        const [conversation] = await tx.update(messageConversations).set({ updatedAt: new Date(), version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, conversationId)).returning();
        await tx.insert(messageAuditEvents).values({
          conversationId,
          actorUserId: req.session.userId!,
          eventType: "ConsentChanged.v1",
          aggregateVersion: conversation.version,
          metadata: { channel: "native", state: input.blocked ? "blocked" : "active" },
        });
      });
      return res.json({ conversation: await conversationDetail(conversationId, req.session.userId!) });
    } catch (error) { return requestError(res, error); }
  });
}
