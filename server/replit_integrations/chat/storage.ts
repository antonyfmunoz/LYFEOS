import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc, and, isNull, sql } from "drizzle-orm";

export interface IChatStorage {
  getConversation(id: number): Promise<typeof conversations.$inferSelect | undefined>;
  getConversationsByUser(userId: number): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(userId: number, title: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  getAllMessagesByUser(userId: number): Promise<{ id: number; conversationId: number; role: string; content: string; createdAt: Date; conversationTitle: string }[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  },

  async getConversationsByUser(userId: number) {
    return db.select().from(conversations).where(and(eq(conversations.userId, userId), isNull(conversations.deletedAt))).orderBy(desc(conversations.createdAt));
  },

  async createConversation(userId: number, title: string) {
    const [conversation] = await db.insert(conversations).values({ userId, title }).returning();
    return conversation;
  },

  async deleteConversation(id: number) {
    await db.update(conversations).set({ deletedAt: new Date() }).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  },

  async getAllMessagesByUser(userId: number) {
    const results = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
        conversationTitle: conversations.title,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(eq(conversations.userId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(200);
    return results.reverse();
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  },
};
