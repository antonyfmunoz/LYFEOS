import { pgTable, text, serial, integer, boolean, timestamp, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarColor: text("avatar_color").default("#00e0ff"), // Default primary cyan color
  title: text("title").default("COMMANDER"),
  profilePicture: text("profile_picture"), // Base64 encoded image or URL
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User Stats table
export const userStats = pgTable("user_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  timeTokensCurrent: integer("time_tokens_current").notNull().default(10),
  timeTokensMax: integer("time_tokens_max").notNull().default(100),
  energyPointsCurrent: integer("energy_points_current").notNull().default(10),
  energyPointsMax: integer("energy_points_max").notNull().default(100),
  healthPointsCurrent: integer("health_points_current").notNull().default(10),
  healthPointsMax: integer("health_points_max").notNull().default(100),
  attentionTokensCurrent: integer("attention_tokens_current").notNull().default(10),
  attentionTokensMax: integer("attention_tokens_max").notNull().default(100),
  experienceCurrent: integer("experience_current").notNull().default(0),
  experienceMax: integer("experience_max").notNull().default(100),
  level: integer("level").notNull().default(1),
  streakDays: integer("streak_days").notNull().default(0),
  efficiencyScore: integer("efficiency_score").notNull().default(0),
  aiAssistantName: text("ai_assistant_name").default("NOVA").notNull(),
  // System settings
  notificationsEnabled: boolean("notifications_enabled").default(false).notNull(),
  darkThemeEnabled: boolean("dark_theme_enabled").default(true).notNull(),
  autoSyncEnabled: boolean("auto_sync_enabled").default(true).notNull(),
  aiAssistantEnabled: boolean("ai_assistant_enabled").default(true).notNull(),
  primaryColor: text("primary_color").default("#00e0ff").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Quests table
export const quests = pgTable("quests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  completed: boolean("completed").notNull().default(false),
  energyCost: integer("energy_cost").notNull().default(1),
  experienceReward: integer("experience_reward").notNull().default(10),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// AI Messages table
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  sender: text("sender").notNull(), // 'ai' or 'user'
  content: text("content").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Calendar Events table
export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  startTime: text("start_time").notNull(), // format: "HH:MM"
  duration: text("duration").notNull(),
  category: text("category").notNull(), // 'work', 'personal', or 'health'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Mission Pages table
export const missionPages = pgTable("mission_pages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  completed: boolean("completed").notNull().default(false),
  xpValue: integer("xp_value").notNull().default(5),
  tags: text("tags").array(),
  eventId: integer("event_id").references(() => calendarEvents.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contacts table
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  jobTitle: text("job_title"),
  category: text("category").notNull().default("personal"),
  notes: text("notes"),
  favorite: boolean("favorite").notNull().default(false),
  lastContacted: timestamp("last_contacted", { mode: "date" }),
  birthday: date("birthday"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relationships
export const usersRelations = relations(users, ({ one, many }) => ({
  stats: one(userStats, {
    fields: [users.id],
    references: [userStats.userId],
  }),
  quests: many(quests),
  messages: many(aiMessages),
  events: many(calendarEvents),
  missionPages: many(missionPages),
  contacts: many(contacts),
}));

export const userStatsRelations = relations(userStats, ({ one }) => ({
  user: one(users, {
    fields: [userStats.userId],
    references: [users.id],
  }),
}));

export const questsRelations = relations(quests, ({ one }) => ({
  user: one(users, {
    fields: [quests.userId],
    references: [users.id],
  }),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  user: one(users, {
    fields: [aiMessages.userId],
    references: [users.id],
  }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  user: one(users, {
    fields: [calendarEvents.userId],
    references: [users.id],
  }),
  missionPages: many(missionPages),
}));

export const missionPagesRelations = relations(missionPages, ({ one }) => ({
  user: one(users, {
    fields: [missionPages.userId],
    references: [users.id],
  }),
  event: one(calendarEvents, {
    fields: [missionPages.eventId],
    references: [calendarEvents.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  user: one(users, {
    fields: [contacts.userId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  displayName: true,
  bio: true,
  avatarColor: true,
  title: true,
  profilePicture: true,
});

export const insertUserStatsSchema = createInsertSchema(userStats).pick({
  userId: true,
  timeTokensCurrent: true,
  timeTokensMax: true,
  energyPointsCurrent: true,
  energyPointsMax: true,
  healthPointsCurrent: true,
  healthPointsMax: true,
  attentionTokensCurrent: true,
  attentionTokensMax: true,
  experienceCurrent: true,
  experienceMax: true,
  level: true,
  streakDays: true,
  efficiencyScore: true,
  aiAssistantName: true,
  notificationsEnabled: true,
  darkThemeEnabled: true,
  autoSyncEnabled: true,
  aiAssistantEnabled: true,
  primaryColor: true,
});

export const insertQuestSchema = createInsertSchema(quests).pick({
  userId: true,
  title: true,
  description: true,
  completed: true,
  energyCost: true,
  experienceReward: true,
});

export const insertAIMessageSchema = createInsertSchema(aiMessages).pick({
  userId: true,
  sender: true,
  content: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).pick({
  userId: true,
  title: true,
  description: true,
  startTime: true,
  duration: true,
  category: true,
});

export const insertMissionPageSchema = createInsertSchema(missionPages).pick({
  userId: true,
  title: true,
  slug: true,
  content: true,
  completed: true,
  xpValue: true,
  tags: true,
  eventId: true,
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  userId: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  jobTitle: true,
  category: true,
  notes: true,
  favorite: true,
  lastContacted: true,
  birthday: true,
  address: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;

export type Quest = typeof quests.$inferSelect;
export type InsertQuest = z.infer<typeof insertQuestSchema>;

export type AIMessage = typeof aiMessages.$inferSelect;
export type InsertAIMessage = z.infer<typeof insertAIMessageSchema>;

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

export type MissionPage = typeof missionPages.$inferSelect;
export type InsertMissionPage = z.infer<typeof insertMissionPageSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
