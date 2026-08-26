import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  collaborationAuditEvents,
  collaborationMemberships,
  collaborationVisibilityGrants,
  collaborationWorkspaces,
  quests,
  transformationThreads,
  users,
} from "@shared/schema";
import { db } from "../db";
import { logger } from "../utils";
import { isAuthenticated } from "./middleware";

const idSchema = z.string().uuid();
const workspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  purpose: z.string().trim().min(3).max(280),
}).strict();
const invitationSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["coach", "collaborator"]),
  purpose: z.string().trim().min(3).max(280),
}).strict();
const decisionSchema = z.object({ decision: z.enum(["accept", "decline"]) }).strict();
const grantSchema = z.object({
  granteeUserId: z.number().int().positive(),
  subjectType: z.enum(["mission", "thread"]),
  subjectId: z.number().int().positive(),
  scopes: z.array(z.enum(["summary", "status"])).min(1).max(2).transform((scopes) => Array.from(new Set(scopes))),
  purpose: z.string().trim().min(3).max(280),
  expiresAt: z.string().datetime(),
}).strict();

function privateHeaders(res: Response) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie");
}

function routeError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || "Invalid collaboration request." });
  logger.error("Collaboration request failed", { error: error instanceof Error ? error.message : "unknown" });
  return res.status(500).json({ error: "Collaboration request could not be completed." });
}

async function ownedWorkspace(workspaceId: string, userId: number) {
  const [workspace] = await db.select().from(collaborationWorkspaces).where(and(
    eq(collaborationWorkspaces.id, workspaceId),
    eq(collaborationWorkspaces.ownerUserId, userId),
    eq(collaborationWorkspaces.status, "active"),
  )).limit(1);
  return workspace;
}

async function stateForUser(userId: number) {
  const memberships = await db.select({
    membership: collaborationMemberships,
    workspace: collaborationWorkspaces,
    ownerDisplayName: users.displayName,
  }).from(collaborationMemberships)
    .innerJoin(collaborationWorkspaces, eq(collaborationWorkspaces.id, collaborationMemberships.workspaceId))
    .innerJoin(users, eq(users.id, collaborationWorkspaces.ownerUserId))
    .where(eq(collaborationMemberships.userId, userId))
    .orderBy(desc(collaborationMemberships.updatedAt));
  const visible = memberships.filter(({ membership }) => ["invited", "active"].includes(membership.status));
  const workspaceIds = visible.map(({ workspace }) => workspace.id);
  const memberRows = workspaceIds.length ? await db.select({
    id: collaborationMemberships.id,
    workspaceId: collaborationMemberships.workspaceId,
    userId: collaborationMemberships.userId,
    displayName: users.displayName,
    role: collaborationMemberships.role,
    status: collaborationMemberships.status,
    invitationPurpose: collaborationMemberships.invitationPurpose,
    acceptedAt: collaborationMemberships.acceptedAt,
    createdAt: collaborationMemberships.createdAt,
  }).from(collaborationMemberships)
    .innerJoin(users, eq(users.id, collaborationMemberships.userId))
    .where(inArray(collaborationMemberships.workspaceId, workspaceIds))
    .orderBy(asc(collaborationMemberships.createdAt)) : [];
  const issued = await db.select().from(collaborationVisibilityGrants)
    .where(eq(collaborationVisibilityGrants.ownerUserId, userId)).orderBy(desc(collaborationVisibilityGrants.createdAt)).limit(100);
  return {
    authorityBoundary: "membership_grants_no_personal_record_access",
    prohibitedDomains: ["health", "finance", "relationships", "journal", "messages", "ai_memory", "evidence"],
    workspaces: visible.map(({ membership, workspace, ownerDisplayName }) => ({
      ...workspace,
      ownerDisplayName,
      myMembership: membership,
      members: membership.status === "active" ? memberRows.filter((member) => member.workspaceId === workspace.id) : [],
    })),
    issuedGrants: issued,
  };
}

async function sharedProjectionForUser(userId: number) {
  const grants = await db.select({ grant: collaborationVisibilityGrants, ownerDisplayName: users.displayName, workspaceName: collaborationWorkspaces.name })
    .from(collaborationVisibilityGrants)
    .innerJoin(users, eq(users.id, collaborationVisibilityGrants.ownerUserId))
    .innerJoin(collaborationWorkspaces, eq(collaborationWorkspaces.id, collaborationVisibilityGrants.workspaceId))
    .innerJoin(collaborationMemberships, and(
      eq(collaborationMemberships.workspaceId, collaborationVisibilityGrants.workspaceId),
      eq(collaborationMemberships.userId, collaborationVisibilityGrants.granteeUserId),
      eq(collaborationMemberships.status, "active"),
    ))
    .where(and(
      eq(collaborationVisibilityGrants.granteeUserId, userId),
      eq(collaborationVisibilityGrants.status, "active"),
      gt(collaborationVisibilityGrants.expiresAt, new Date()),
    )).orderBy(desc(collaborationVisibilityGrants.createdAt)).limit(100);
  const missionIds = grants.filter(({ grant }) => grant.subjectType === "mission").map(({ grant }) => grant.subjectId);
  const threadIds = grants.filter(({ grant }) => grant.subjectType === "thread").map(({ grant }) => grant.subjectId);
  const [missions, threads] = await Promise.all([
    missionIds.length ? db.select({ id: quests.id, userId: quests.userId, title: quests.title, category: quests.category, completed: quests.completed, dueDate: quests.dueDate, missionStatus: quests.missionStatus, updatedAt: quests.updatedAt }).from(quests).where(inArray(quests.id, missionIds)) : [],
    threadIds.length ? db.select({ id: transformationThreads.id, userId: transformationThreads.userId, title: transformationThreads.title, focus: transformationThreads.focus, status: transformationThreads.status, activatedAt: transformationThreads.activatedAt, completedAt: transformationThreads.completedAt, updatedAt: transformationThreads.updatedAt }).from(transformationThreads).where(inArray(transformationThreads.id, threadIds)) : [],
  ]);
  const missionMap = new Map(missions.map((row) => [`${row.userId}:${row.id}`, row]));
  const threadMap = new Map(threads.map((row) => [`${row.userId}:${row.id}`, row]));
  return grants.flatMap(({ grant, ownerDisplayName, workspaceName }) => {
    const scopes = new Set(Array.isArray(grant.scopes) ? grant.scopes.filter((scope): scope is string => typeof scope === "string") : []);
    const source = grant.subjectType === "mission" ? missionMap.get(`${grant.ownerUserId}:${grant.subjectId}`) : threadMap.get(`${grant.ownerUserId}:${grant.subjectId}`);
    if (!source) return [];
    const projection: Record<string, unknown> = { id: source.id };
    if (grant.subjectType === "mission") {
      const mission = source as (typeof missions)[number];
      if (scopes.has("summary")) Object.assign(projection, { title: mission.title, category: mission.category });
      if (scopes.has("status")) Object.assign(projection, { completed: mission.completed, dueDate: mission.dueDate, missionStatus: mission.missionStatus, updatedAt: mission.updatedAt });
    } else {
      const thread = source as (typeof threads)[number];
      if (scopes.has("summary")) Object.assign(projection, { title: thread.title, focus: thread.focus });
      if (scopes.has("status")) Object.assign(projection, { status: thread.status, activatedAt: thread.activatedAt, completedAt: thread.completedAt, updatedAt: thread.updatedAt });
    }
    return [{ grant: { id: grant.id, workspaceId: grant.workspaceId, subjectType: grant.subjectType, scopes: grant.scopes, purpose: grant.purpose, expiresAt: grant.expiresAt }, workspaceName, ownerDisplayName, projection }];
  });
}

export function registerCollaborationRoutes(app: Express): void {
  app.use("/api/collaboration", (_req, res, next) => { privateHeaders(res); next(); });

  app.get("/api/collaboration", isAuthenticated, async (req, res) => {
    try { return res.json(await stateForUser(req.session.userId!)); } catch (error) { return routeError(res, error); }
  });

  app.get("/api/collaboration/share-options", isAuthenticated, async (req, res) => {
    try {
      const [missions, threads] = await Promise.all([
        db.select({ id: quests.id, title: quests.title, completed: quests.completed }).from(quests).where(and(eq(quests.userId, req.session.userId!), isNull(quests.deletedAt))).orderBy(desc(quests.updatedAt)).limit(100),
        db.select({ id: transformationThreads.id, title: transformationThreads.title, status: transformationThreads.status }).from(transformationThreads).where(eq(transformationThreads.userId, req.session.userId!)).orderBy(desc(transformationThreads.updatedAt)).limit(100),
      ]);
      return res.json({ missions, threads });
    } catch (error) { return routeError(res, error); }
  });

  app.get("/api/collaboration/shared-with-me", isAuthenticated, async (req, res) => {
    try { return res.json({ items: await sharedProjectionForUser(req.session.userId!) }); } catch (error) { return routeError(res, error); }
  });

  app.post("/api/collaboration/workspaces", isAuthenticated, async (req, res) => {
    try {
      const input = workspaceSchema.parse(req.body); const userId = req.session.userId!;
      const workspace = await db.transaction(async (tx) => {
        const [created] = await tx.insert(collaborationWorkspaces).values({ ownerUserId: userId, ...input }).returning();
        await tx.insert(collaborationMemberships).values({ workspaceId: created.id, userId, invitedByUserId: userId, role: "owner", status: "active", invitationPurpose: input.purpose, acceptedAt: new Date() });
        await tx.insert(collaborationAuditEvents).values({ workspaceId: created.id, actorUserId: userId, subjectUserId: userId, action: "workspace_created", subjectType: "workspace", subjectId: created.id, metadata: { role: "owner" } });
        return created;
      });
      return res.status(201).json({ workspace, authorityBoundary: "coordination_only" });
    } catch (error) { return routeError(res, error); }
  });

  app.post("/api/collaboration/workspaces/:workspaceId/invitations", isAuthenticated, async (req, res) => {
    try {
      const workspaceId = idSchema.parse(req.params.workspaceId); const input = invitationSchema.parse(req.body); const userId = req.session.userId!;
      const workspace = await ownedWorkspace(workspaceId, userId); if (!workspace) return res.status(404).json({ error: "Active owned workspace not found." });
      if (input.userId === userId) return res.status(400).json({ error: "The workspace owner is already a member." });
      const [invitee] = await db.select({ id: users.id, displayName: users.displayName }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!invitee) return res.status(400).json({ error: "That LyfeOS user is unavailable." });
      const membership = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT "id" FROM "collaboration_workspaces" WHERE "id" = ${workspaceId} AND "owner_user_id" = ${userId} FOR UPDATE`);
        const [existing] = await tx.select().from(collaborationMemberships).where(and(eq(collaborationMemberships.workspaceId, workspaceId), eq(collaborationMemberships.userId, input.userId))).limit(1);
        if (existing?.status === "active" || existing?.status === "invited") throw new Error("MEMBERSHIP_EXISTS");
        const now = new Date();
        const [row] = existing
          ? await tx.update(collaborationMemberships).set({ role: input.role, status: "invited", invitationPurpose: input.purpose, invitedByUserId: userId, acceptedAt: null, revokedAt: null, updatedAt: now }).where(eq(collaborationMemberships.id, existing.id)).returning()
          : await tx.insert(collaborationMemberships).values({ workspaceId, userId: input.userId, invitedByUserId: userId, role: input.role, status: "invited", invitationPurpose: input.purpose }).returning();
        await tx.update(collaborationWorkspaces).set({ revision: workspace.revision + 1, updatedAt: now }).where(eq(collaborationWorkspaces.id, workspaceId));
        await tx.insert(collaborationAuditEvents).values({ workspaceId, actorUserId: userId, subjectUserId: input.userId, action: "member_invited", subjectType: "membership", subjectId: String(row.id), metadata: { role: input.role } });
        return row;
      });
      return res.status(201).json({ membership: { ...membership, displayName: invitee.displayName }, disclosure: "Membership does not expose personal records. The owner must create a separate visibility grant." });
    } catch (error) {
      if (error instanceof Error && error.message === "MEMBERSHIP_EXISTS") return res.status(409).json({ error: "That person already has an active or pending membership." });
      return routeError(res, error);
    }
  });

  app.post("/api/collaboration/memberships/:membershipId/decision", isAuthenticated, async (req, res) => {
    try {
      const membershipId = z.coerce.number().int().positive().parse(req.params.membershipId); const { decision } = decisionSchema.parse(req.body); const userId = req.session.userId!;
      const result = await db.transaction(async (tx) => {
        const [membership] = await tx.select().from(collaborationMemberships).where(and(eq(collaborationMemberships.id, membershipId), eq(collaborationMemberships.userId, userId))).limit(1);
        if (!membership || membership.status !== "invited") return null;
        const now = new Date(); const status = decision === "accept" ? "active" : "declined";
        const [updated] = await tx.update(collaborationMemberships).set({ status, acceptedAt: decision === "accept" ? now : null, revokedAt: null, updatedAt: now }).where(and(eq(collaborationMemberships.id, membershipId), eq(collaborationMemberships.status, "invited"))).returning();
        if (!updated) return null;
        await tx.insert(collaborationAuditEvents).values({ workspaceId: membership.workspaceId, actorUserId: userId, subjectUserId: userId, action: decision === "accept" ? "membership_accepted" : "membership_declined", subjectType: "membership", subjectId: String(membershipId) });
        return updated;
      });
      if (!result) return res.status(409).json({ error: "This invitation is no longer pending." });
      return res.json({ membership: result, authorityBoundary: "membership_grants_no_personal_record_access" });
    } catch (error) { return routeError(res, error); }
  });

  app.delete("/api/collaboration/memberships/:membershipId", isAuthenticated, async (req, res) => {
    try {
      const membershipId = z.coerce.number().int().positive().parse(req.params.membershipId); const userId = req.session.userId!;
      const outcome = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT "id" FROM "collaboration_memberships" WHERE "id" = ${membershipId} FOR UPDATE`);
        const [membership] = await tx.select().from(collaborationMemberships).where(eq(collaborationMemberships.id, membershipId)).limit(1);
        if (!membership || membership.role === "owner" || !["invited", "active"].includes(membership.status)) return null;
        const [workspace] = await tx.select().from(collaborationWorkspaces).where(and(eq(collaborationWorkspaces.id, membership.workspaceId), eq(collaborationWorkspaces.ownerUserId, userId), eq(collaborationWorkspaces.status, "active"))).limit(1);
        const selfLeave = membership.userId === userId;
        if (!workspace && !selfLeave) return null;
        const now = new Date(); const status = selfLeave ? "left" : "revoked";
        await tx.update(collaborationMemberships).set({ status, revokedAt: now, updatedAt: now }).where(eq(collaborationMemberships.id, membershipId));
        await tx.update(collaborationVisibilityGrants).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(and(eq(collaborationVisibilityGrants.workspaceId, membership.workspaceId), eq(collaborationVisibilityGrants.granteeUserId, membership.userId), eq(collaborationVisibilityGrants.status, "active")));
        await tx.insert(collaborationAuditEvents).values({ workspaceId: membership.workspaceId, actorUserId: userId, subjectUserId: membership.userId, action: selfLeave ? "membership_left" : "membership_revoked", subjectType: "membership", subjectId: String(membershipId) });
        return true;
      });
      if (!outcome) return res.status(404).json({ error: "Revocable membership not found." });
      return res.json({ revoked: true, grantsRevoked: true });
    } catch (error) { return routeError(res, error); }
  });

  app.post("/api/collaboration/workspaces/:workspaceId/grants", isAuthenticated, async (req, res) => {
    try {
      const workspaceId = idSchema.parse(req.params.workspaceId); const input = grantSchema.parse(req.body); const userId = req.session.userId!;
      if (input.granteeUserId === userId) return res.status(400).json({ error: "Choose another active workspace member." });
      const expiresAt = new Date(input.expiresAt); const maxExpiry = Date.now() + 366 * 24 * 60 * 60 * 1000;
      if (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > maxExpiry) return res.status(400).json({ error: "Expiry must be in the future and no more than one year away." });
      const grant = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT "id" FROM "collaboration_memberships" WHERE "workspace_id" = ${workspaceId} AND "user_id" IN (${userId}, ${input.granteeUserId}) ORDER BY "user_id" FOR UPDATE`);
        const active = await tx.select({ userId: collaborationMemberships.userId }).from(collaborationMemberships).where(and(eq(collaborationMemberships.workspaceId, workspaceId), inArray(collaborationMemberships.userId, [userId, input.granteeUserId]), eq(collaborationMemberships.status, "active")));
        if (active.length !== 2) throw new Error("MEMBERSHIP_INACTIVE");
        const [subject] = input.subjectType === "mission"
          ? await tx.select({ id: quests.id }).from(quests).where(and(eq(quests.id, input.subjectId), eq(quests.userId, userId))).limit(1)
          : await tx.select({ id: transformationThreads.id }).from(transformationThreads).where(and(eq(transformationThreads.id, input.subjectId), eq(transformationThreads.userId, userId))).limit(1);
        if (!subject) throw new Error("SUBJECT_NOT_FOUND");
        const [existing] = await tx.select({ id: collaborationVisibilityGrants.id }).from(collaborationVisibilityGrants).where(and(eq(collaborationVisibilityGrants.workspaceId, workspaceId), eq(collaborationVisibilityGrants.ownerUserId, userId), eq(collaborationVisibilityGrants.granteeUserId, input.granteeUserId), eq(collaborationVisibilityGrants.subjectType, input.subjectType), eq(collaborationVisibilityGrants.subjectId, input.subjectId), eq(collaborationVisibilityGrants.status, "active"))).limit(1);
        if (existing) throw new Error("GRANT_EXISTS");
        const [created] = await tx.insert(collaborationVisibilityGrants).values({ workspaceId, ownerUserId: userId, granteeUserId: input.granteeUserId, subjectType: input.subjectType, subjectId: input.subjectId, scopes: input.scopes, purpose: input.purpose, expiresAt }).returning();
        await tx.insert(collaborationAuditEvents).values({ workspaceId, actorUserId: userId, subjectUserId: input.granteeUserId, action: "visibility_granted", subjectType: input.subjectType, subjectId: String(input.subjectId), metadata: { scopes: input.scopes, expiresAt: input.expiresAt } });
        return created;
      });
      return res.status(201).json({ grant, disclosure: "Only the selected summary/status projection is visible. Source records and all other domains remain private." });
    } catch (error) {
      if (error instanceof Error && error.message === "MEMBERSHIP_INACTIVE") return res.status(400).json({ error: "Both people must be active workspace members." });
      if (error instanceof Error && error.message === "SUBJECT_NOT_FOUND") return res.status(404).json({ error: "Owned share subject not found." });
      if (error instanceof Error && error.message === "GRANT_EXISTS") return res.status(409).json({ error: "An active grant already exists for that person and item. Revoke it before replacing it." });
      return routeError(res, error);
    }
  });

  app.delete("/api/collaboration/grants/:grantId", isAuthenticated, async (req, res) => {
    try {
      const grantId = idSchema.parse(req.params.grantId); const userId = req.session.userId!; const now = new Date();
      const [grant] = await db.update(collaborationVisibilityGrants).set({ status: "revoked", revokedAt: now, updatedAt: now }).where(and(eq(collaborationVisibilityGrants.id, grantId), eq(collaborationVisibilityGrants.ownerUserId, userId), eq(collaborationVisibilityGrants.status, "active"))).returning();
      if (!grant) return res.status(404).json({ error: "Active owned grant not found." });
      await db.insert(collaborationAuditEvents).values({ workspaceId: grant.workspaceId, actorUserId: userId, subjectUserId: grant.granteeUserId, action: "visibility_revoked", subjectType: grant.subjectType, subjectId: String(grant.subjectId) });
      return res.json({ revoked: true });
    } catch (error) { return routeError(res, error); }
  });
}
