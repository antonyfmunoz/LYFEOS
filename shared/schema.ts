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

// Spreadsheets table
export const spreadsheets = pgTable("spreadsheets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull(), // Store spreadsheet data as JSON
  favorite: boolean("favorite").notNull().default(false),
  category: text("category").notNull().default("general"),
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
  spreadsheets: many(spreadsheets),
  templates: many(templates),
  kanbanBoards: many(kanbanBoards),
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

export const spreadsheetsRelations = relations(spreadsheets, ({ one }) => ({
  user: one(users, {
    fields: [spreadsheets.userId],
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

export const insertSpreadsheetSchema = createInsertSchema(spreadsheets).pick({
  userId: true,
  title: true,
  description: true,
  content: true,
  favorite: true,
  category: true,
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

export type Spreadsheet = typeof spreadsheets.$inferSelect;
export type InsertSpreadsheet = z.infer<typeof insertSpreadsheetSchema>;

// Canvas table
export const canvases = pgTable("canvases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull().default({}), // Stores canvas elements like shapes, connections, text
  favorite: boolean("favorite").default(false).notNull(),
  category: text("category").default("general").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Canvas relations
export const canvasRelations = relations(canvases, ({ one }) => ({
  user: one(users, {
    fields: [canvases.userId],
    references: [users.id],
  }),
}));

// Insert schema for Canvas
export const insertCanvasSchema = createInsertSchema(canvases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Graph table
export const graphs = pgTable("graphs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  content: jsonb("content").notNull().default({}), // Stores nodes, edges, and styling
  favorite: boolean("favorite").default(false).notNull(),
  category: text("category").default("general").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Graph relations
export const graphRelations = relations(graphs, ({ one }) => ({
  user: one(users, {
    fields: [graphs.userId],
    references: [users.id],
  }),
}));

// Insert schema for Graph
export const insertGraphSchema = createInsertSchema(graphs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Folders table
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  parentId: integer("parent_id"), // null for root folders
  favorite: boolean("favorite").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Documents table
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  folderId: integer("folder_id").references(() => folders.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  description: text("description"),
  format: text("format").default("markdown").notNull(), // markdown, text, etc.
  favorite: boolean("favorite").default(false).notNull(),
  tags: text("tags").array(), // Array of tags
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Folder relations
export const folderRelations = relations(folders, ({ one, many }) => ({
  user: one(users, {
    fields: [folders.userId],
    references: [users.id],
  }),
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
  }),
  children: many(folders),
  documents: many(documents),
}));

// Document relations
export const documentRelations = relations(documents, ({ one }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  folder: one(folders, {
    fields: [documents.folderId],
    references: [folders.id],
  }),
}));

// Insert schema for Folder
export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Insert schema for Document
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Canvas = typeof canvases.$inferSelect;
export type InsertCanvas = z.infer<typeof insertCanvasSchema>;

export type Graph = typeof graphs.$inferSelect;
export type InsertGraph = z.infer<typeof insertGraphSchema>;

export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

// Document Templates
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  content: text("content").notNull(),
  format: text("format").default("markdown").notNull(),
  category: text("category").default("general").notNull(),
  tags: text("tags").array(),
  favorite: boolean("favorite").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template relations
export const templateRelations = relations(templates, ({ one }) => ({
  user: one(users, {
    fields: [templates.userId],
    references: [users.id],
  }),
}));

// Insert schema for Template
export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

// Kanban Board table
export const kanbanBoards = pgTable("kanban_boards", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Kanban Column table
export const kanbanColumns = pgTable("kanban_columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status").notNull(), // unique identifier for the column
  order: integer("order").notNull(), // position in the board
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Kanban Task table
export const kanbanTasks = pgTable("kanban_tasks", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").notNull().references(() => kanbanBoards.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull(), // Matches column status
  priority: text("priority").notNull().default("medium"), // low, medium, high
  startDate: text("start_date"),
  dueDate: text("due_date"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Board relations
export const kanbanBoardRelations = relations(kanbanBoards, ({ one, many }) => ({
  user: one(users, {
    fields: [kanbanBoards.userId],
    references: [users.id],
  }),
  columns: many(kanbanColumns),
  tasks: many(kanbanTasks),
}));

// Column relations
export const kanbanColumnRelations = relations(kanbanColumns, ({ one }) => ({
  board: one(kanbanBoards, {
    fields: [kanbanColumns.boardId],
    references: [kanbanBoards.id],
  }),
}));

// Task relations
export const kanbanTaskRelations = relations(kanbanTasks, ({ one }) => ({
  board: one(kanbanBoards, {
    fields: [kanbanTasks.boardId],
    references: [kanbanBoards.id],
  }),
}));

// Insert schemas
export const insertKanbanBoardSchema = createInsertSchema(kanbanBoards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKanbanColumnSchema = createInsertSchema(kanbanColumns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKanbanTaskSchema = createInsertSchema(kanbanTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type KanbanBoard = typeof kanbanBoards.$inferSelect;
export type InsertKanbanBoard = z.infer<typeof insertKanbanBoardSchema>;

export type KanbanColumn = typeof kanbanColumns.$inferSelect;
export type InsertKanbanColumn = z.infer<typeof insertKanbanColumnSchema>;

export type KanbanTask = typeof kanbanTasks.$inferSelect;
export type InsertKanbanTask = z.infer<typeof insertKanbanTaskSchema>;
