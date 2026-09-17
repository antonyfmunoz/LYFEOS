import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ZodError } from "zod";
import {
  conversationMessages,
  messageAuditEvents,
  messageBridgeCommands,
  messageBridgeDevices,
  messageBridgeImportedMessages,
  messageBridgeThreads,
  messageChannelBindings,
  messageConversationParticipants,
  messageConversations,
} from "@shared/schema";
import {
  bridgeInboundMessageSchema,
  claimMessageBridgeSchema,
  completeMessageBridgeCommandSchema,
  createMessageBridgePairingSchema,
} from "@shared/message-bridge";
import { db } from "../db";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const now = () => new Date();

function bridgeError(res: Response, error: unknown) {
  if (error instanceof ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid bridge request." });
  logger.error("Message bridge request failed", { error: error instanceof Error ? error.message : "unknown" });
  return res.status(500).json({ error: "The private Messages bridge could not complete that request." });
}

function bearerToken(req: Request) {
  const value = req.header("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

async function authenticateBridge(req: Request, res: Response) {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "A bridge device token is required." });
    return null;
  }
  const [device] = await db.select().from(messageBridgeDevices).where(and(
    eq(messageBridgeDevices.accessTokenHash, sha256(token)),
    eq(messageBridgeDevices.status, "active"),
  )).limit(1);
  if (!device) {
    res.status(401).json({ error: "This bridge is disconnected or unavailable." });
    return null;
  }
  return device;
}

function safeDevice(device: typeof messageBridgeDevices.$inferSelect) {
  return {
    id: device.id,
    displayName: device.displayName,
    platform: device.platform,
    status: device.status,
    permissions: device.permissions,
    lastSeenAt: device.lastSeenAt,
    pairedAt: device.pairedAt,
    createdAt: device.createdAt,
  };
}

/** A device-paired relay for personal Messages. Apple credentials never enter LyfeOS. */
export function registerMessageBridgeRoutes(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/message-bridge")) {
      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Vary", "Cookie, Authorization");
    }
    next();
  });

  app.get("/api/message-bridge/status", isAuthenticated, async (req, res) => {
    try {
      const devices = await db.select().from(messageBridgeDevices)
        .where(eq(messageBridgeDevices.userId, req.session.userId!)).orderBy(asc(messageBridgeDevices.createdAt));
      return res.json({ devices: devices.map(safeDevice) });
    } catch (error) { return bridgeError(res, error); }
  });

  app.post("/api/message-bridge/pairings", isAuthenticated, async (req, res) => {
    try {
      const input = createMessageBridgePairingSchema.parse(req.body);
      const pairingCode = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 10 * 60_000);
      const [device] = await db.insert(messageBridgeDevices).values({
        userId: req.session.userId!, displayName: input.displayName, platform: "macos", status: "pairing",
        pairingTokenHash: sha256(pairingCode), pairingExpiresAt: expiresAt, permissions: input.permissions,
      }).returning();
      return res.status(201).json({ device: safeDevice(device), pairingCode, expiresAt });
    } catch (error) { return bridgeError(res, error); }
  });

  app.post("/api/message-bridge/devices/:deviceId/revoke", isAuthenticated, async (req, res) => {
    try {
      const [device] = await db.update(messageBridgeDevices).set({ status: "revoked", accessTokenHash: null, pairingTokenHash: null, revokedAt: now(), updatedAt: now() })
        .where(and(eq(messageBridgeDevices.id, req.params.deviceId), eq(messageBridgeDevices.userId, req.session.userId!))).returning();
      if (!device) return res.status(404).json({ error: "Bridge not found." });
      await db.update(messageChannelBindings).set({ status: "revoked", updatedAt: now() }).where(and(eq(messageChannelBindings.provider, "imessage_bridge"), eq(messageChannelBindings.connectionRef, device.id)));
      return res.json({ device: safeDevice(device) });
    } catch (error) { return bridgeError(res, error); }
  });

  // This endpoint is deliberately unauthenticated: the high-entropy pairing code
  // is single-use, expires in ten minutes, and returns the device token once.
  app.post("/api/message-bridge/claim", async (req, res) => {
    try {
      const input = claimMessageBridgeSchema.parse(req.body);
      const codeHash = sha256(input.pairingCode);
      const [pending] = await db.select().from(messageBridgeDevices).where(and(
        eq(messageBridgeDevices.pairingTokenHash, codeHash),
        eq(messageBridgeDevices.status, "pairing"),
      )).limit(1);
      if (!pending || !pending.pairingExpiresAt || pending.pairingExpiresAt.getTime() <= Date.now()) return res.status(410).json({ error: "This pairing code is invalid or expired." });
      const deviceToken = randomBytes(48).toString("base64url");
      const [device] = await db.update(messageBridgeDevices).set({
        displayName: input.displayName, publicKey: input.publicKey, status: "active", accessTokenHash: sha256(deviceToken),
        pairingTokenHash: null, pairingExpiresAt: null, pairedAt: now(), lastSeenAt: now(), updatedAt: now(),
      }).where(and(eq(messageBridgeDevices.id, pending.id), eq(messageBridgeDevices.status, "pairing"))).returning();
      if (!device) return res.status(409).json({ error: "This bridge was already claimed." });
      return res.status(201).json({ device: safeDevice(device), deviceToken });
    } catch (error) { return bridgeError(res, error); }
  });

  app.get("/api/message-bridge/device", async (req, res) => {
    try {
      const device = await authenticateBridge(req, res); if (!device) return;
      await db.update(messageBridgeDevices).set({ lastSeenAt: now(), updatedAt: now() }).where(eq(messageBridgeDevices.id, device.id));
      return res.json({ device: safeDevice({ ...device, lastSeenAt: now() }) });
    } catch (error) { return bridgeError(res, error); }
  });

  app.post("/api/message-bridge/events", async (req, res) => {
    try {
      const device = await authenticateBridge(req, res); if (!device) return;
      const input = bridgeInboundMessageSchema.parse(req.body);
      const permissions = device.permissions as { read?: boolean };
      if (!permissions.read) return res.status(403).json({ error: "This bridge is not allowed to import Messages." });

      const result = await db.transaction(async (tx) => {
        const [known] = await tx.select().from(messageBridgeImportedMessages).where(and(
          eq(messageBridgeImportedMessages.deviceId, device.id), eq(messageBridgeImportedMessages.providerMessageId, input.providerMessageId),
        )).limit(1);
        if (known) return { messageId: known.messageId, replayed: true };

        let [thread] = await tx.select().from(messageBridgeThreads).where(and(
          eq(messageBridgeThreads.deviceId, device.id), eq(messageBridgeThreads.externalThreadId, input.threadId),
        )).limit(1);
        if (!thread) {
          const [conversation] = await tx.insert(messageConversations).values({
            createdByUserId: device.userId, title: input.title, kind: "direct", status: "open", aiMode: "observe",
          }).returning();
          await tx.insert(messageConversationParticipants).values({ conversationId: conversation.id, userId: device.userId, role: "admin" });
          await tx.insert(messageChannelBindings).values({
            conversationId: conversation.id, provider: "imessage_bridge", connectionRef: device.id, channelKind: "imessage", externalThreadId: input.threadId,
            status: "active", capabilities: { send: Boolean((device.permissions as { send?: boolean }).send), receive: true, receipts: true },
          });
          [thread] = await tx.insert(messageBridgeThreads).values({ deviceId: device.id, externalThreadId: input.threadId, conversationId: conversation.id, title: input.title, recipientHandle: input.recipientHandle }).returning();
        } else if (thread.title !== input.title || thread.recipientHandle !== input.recipientHandle) {
          [thread] = await tx.update(messageBridgeThreads).set({ title: input.title, recipientHandle: input.recipientHandle, updatedAt: now() }).where(eq(messageBridgeThreads.id, thread.id)).returning();
          await tx.update(messageConversations).set({ title: input.title, updatedAt: now() }).where(eq(messageConversations.id, thread.conversationId));
        }

        const occurredAt = new Date(input.occurredAt);
        // AppleScript hands delivery to Messages rather than returning an iMessage
        // GUID. Reconcile that local echo to the queued unified-inbox message so a
        // later chat.db scan does not create a duplicate bubble.
        if (input.direction === "outbound") {
          const [queuedEcho] = await tx.select().from(conversationMessages).where(and(
            eq(conversationMessages.conversationId, thread.conversationId),
            eq(conversationMessages.senderUserId, device.userId),
            eq(conversationMessages.provider, "imessage_bridge"),
            eq(conversationMessages.body, input.body),
            isNull(conversationMessages.providerMessageId),
            inArray(conversationMessages.status, ["queued", "sent"]),
          )).orderBy(desc(conversationMessages.createdAt)).limit(1);
          if (queuedEcho) {
            await tx.update(conversationMessages).set({ providerMessageId: input.providerMessageId, status: input.status, sentAt: occurredAt, updatedAt: occurredAt }).where(eq(conversationMessages.id, queuedEcho.id));
            await tx.insert(messageBridgeImportedMessages).values({ deviceId: device.id, providerMessageId: input.providerMessageId, messageId: queuedEcho.id });
            return { messageId: queuedEcho.id, replayed: false };
          }
        }
        const [message] = await tx.insert(conversationMessages).values({
          conversationId: thread.conversationId, senderUserId: input.direction === "outbound" ? device.userId : null,
          direction: input.direction, provider: "imessage_bridge", body: input.body, status: input.status,
          providerMessageId: input.providerMessageId, idempotencyKey: `imessage:${device.id}:${input.providerMessageId}`,
          sentAt: input.direction === "outbound" ? occurredAt : null, receivedAt: input.direction === "inbound" ? occurredAt : null,
          createdAt: occurredAt, updatedAt: occurredAt,
        }).returning();
        await tx.insert(messageBridgeImportedMessages).values({ deviceId: device.id, providerMessageId: input.providerMessageId, messageId: message.id });
        const [conversation] = await tx.update(messageConversations).set({ lastMessageAt: occurredAt, updatedAt: occurredAt, version: sql`${messageConversations.version} + 1` }).where(eq(messageConversations.id, thread.conversationId)).returning();
        await tx.insert(messageAuditEvents).values({ conversationId: thread.conversationId, messageId: message.id, actorUserId: input.direction === "outbound" ? device.userId : null, eventType: "BridgeMessageImported.v1", aggregateVersion: conversation.version, metadata: { provider: "imessage_bridge", direction: input.direction } });
        return { messageId: message.id, replayed: false };
      });
      await db.update(messageBridgeDevices).set({ lastSeenAt: now(), updatedAt: now() }).where(eq(messageBridgeDevices.id, device.id));
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) { return bridgeError(res, error); }
  });

  app.get("/api/message-bridge/commands", async (req, res) => {
    try {
      const device = await authenticateBridge(req, res); if (!device) return;
      const commands = await db.select().from(messageBridgeCommands).where(and(eq(messageBridgeCommands.deviceId, device.id), inArray(messageBridgeCommands.state, ["pending"]))).orderBy(asc(messageBridgeCommands.createdAt)).limit(25);
      await db.update(messageBridgeDevices).set({ lastSeenAt: now(), updatedAt: now() }).where(eq(messageBridgeDevices.id, device.id));
      return res.json({ commands });
    } catch (error) { return bridgeError(res, error); }
  });

  app.post("/api/message-bridge/commands/:commandId/complete", async (req, res) => {
    try {
      const device = await authenticateBridge(req, res); if (!device) return;
      const input = completeMessageBridgeCommandSchema.parse(req.body);
      const [command] = await db.update(messageBridgeCommands).set({ state: input.state, failureCode: input.failureCode, completedAt: now(), updatedAt: now() })
        .where(and(eq(messageBridgeCommands.id, req.params.commandId), eq(messageBridgeCommands.deviceId, device.id), eq(messageBridgeCommands.state, "pending"))).returning();
      if (!command) return res.status(404).json({ error: "Pending command not found." });
      const status = input.state === "failed" ? "failed" : input.state;
      await db.update(conversationMessages).set({ status, providerMessageId: input.providerMessageId, sentAt: input.state === "failed" ? undefined : now(), updatedAt: now() }).where(eq(conversationMessages.id, command.messageId));
      if (input.providerMessageId) await db.insert(messageBridgeImportedMessages).values({ deviceId: device.id, providerMessageId: input.providerMessageId, messageId: command.messageId }).onConflictDoNothing();
      return res.json({ command: { id: command.id, state: command.state } });
    } catch (error) { return bridgeError(res, error); }
  });
}
