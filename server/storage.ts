import { 
  users, type User, type InsertUser, 
  userStats, type UserStats, type InsertUserStats,
  userProfile, type UserProfile, type InsertUserProfile,
  userDailyLogs, type UserDailyLog, type InsertUserDailyLog,
  userIntegrations, type UserIntegration, type InsertUserIntegration,
  quests, type Quest, type InsertQuest,
  aiMessages, type AIMessage, type InsertAIMessage,
  calendarEvents, type CalendarEvent, type InsertCalendarEvent,
  missionPages, type MissionPage, type InsertMissionPage,
  contacts, type Contact, type InsertContact,
  spreadsheets, type Spreadsheet, type InsertSpreadsheet,
  canvases, type Canvas, type InsertCanvas,
  graphs, type Graph, type InsertGraph,
  folders, type Folder, type InsertFolder,
  documents, type Document, type InsertDocument,
  templates, type Template, type InsertTemplate,
  integrations, type Integration, type InsertIntegration,
  kanbanBoards, type KanbanBoard, type InsertKanbanBoard,
  kanbanColumns, type KanbanColumn, type InsertKanbanColumn,
  kanbanTasks, type KanbanTask, type InsertKanbanTask,
  progressTrackers, type ProgressTracker, type InsertProgressTracker,
  mediaItems, type MediaItem, type InsertMediaItem,
  mediaAlbums, type MediaAlbum, type InsertMediaAlbum,
  widgetStates, type WidgetStates
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phoneNumber: string): Promise<User | undefined>;
  getUserByIdentifier(identifier: string): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User>;
  updateUserPassword(id: number, password: string): Promise<User>;
  updateUserFirebaseUid(id: number, firebaseUid: string): Promise<User>;
  
  // Stats methods
  getUserStats(userId: number): Promise<UserStats | undefined>;
  createUserStats(stats: InsertUserStats): Promise<UserStats>;
  updateUserStats(userId: number, stats: Partial<InsertUserStats>): Promise<UserStats>;
  processLoginStreak(userId: number): Promise<{ streakDays: number; isNewDay: boolean }>;
  calculateEfficiency(userId: number): Promise<number>;
  processDailyHealthUpdate(userId: number): Promise<number>;
  
  // User Profile methods
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: number, profile: Partial<InsertUserProfile>): Promise<UserProfile>;
  upsertUserProfile(userId: number, profileData: Partial<InsertUserProfile>): Promise<UserProfile>;
  
  // User Daily Logs methods
  getUserDailyLogs(userId: number): Promise<UserDailyLog[]>;
  getUserDailyLogByDate(userId: number, date: Date): Promise<UserDailyLog | undefined>;
  createUserDailyLog(log: InsertUserDailyLog): Promise<UserDailyLog>;
  updateUserDailyLog(id: number, log: Partial<InsertUserDailyLog>): Promise<UserDailyLog>;
  
  // User Integration methods
  getUserIntegration(userId: number): Promise<UserIntegration | undefined>;
  createUserIntegration(integration: InsertUserIntegration): Promise<UserIntegration>;
  updateUserIntegration(userId: number, integration: Partial<InsertUserIntegration>): Promise<UserIntegration>;
  
  // Quest methods
  getQuests(userId: number): Promise<Quest[]>;
  getQuest(id: number): Promise<Quest | undefined>;
  createQuest(quest: InsertQuest): Promise<Quest>;
  updateQuest(id: number, quest: Partial<InsertQuest>): Promise<Quest>;
  toggleQuestCompletion(id: number): Promise<{ quest: Quest; statsUpdated: boolean; levelUp: boolean }>;
  deleteQuest(id: number): Promise<void>;
  
  // AI Message methods
  getMessages(userId: number): Promise<AIMessage[]>;
  createMessage(message: InsertAIMessage): Promise<AIMessage>;
  
  // Calendar Event methods
  getEvents(userId: number): Promise<CalendarEvent[]>;
  getEvent(id: number): Promise<CalendarEvent | undefined>;
  createEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent>;
  deleteEvent(id: number): Promise<void>;
  
  // Mission Page methods
  getMissionPages(userId: number): Promise<MissionPage[]>;
  getMissionPage(id: number): Promise<MissionPage | undefined>;
  getMissionPageBySlug(slug: string): Promise<MissionPage | undefined>;
  createMissionPage(page: InsertMissionPage): Promise<MissionPage>;
  updateMissionPage(id: number, page: Partial<InsertMissionPage>): Promise<MissionPage>;
  deleteMissionPage(id: number): Promise<void>;
  
  // Contact methods
  getContacts(userId: number): Promise<Contact[]>;
  getContactsByCategory(userId: number, category: string): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;
  toggleFavoriteContact(id: number): Promise<Contact>;
  
  // Spreadsheet methods
  getSpreadsheets(userId: number): Promise<Spreadsheet[]>;
  getSpreadsheetsByCategory(userId: number, category: string): Promise<Spreadsheet[]>;
  getSpreadsheet(id: number): Promise<Spreadsheet | undefined>;
  createSpreadsheet(spreadsheet: InsertSpreadsheet): Promise<Spreadsheet>;
  updateSpreadsheet(id: number, spreadsheet: Partial<InsertSpreadsheet>): Promise<Spreadsheet>;
  deleteSpreadsheet(id: number): Promise<void>;
  toggleFavoriteSpreadsheet(id: number): Promise<Spreadsheet>;
  
  // Canvas methods
  getCanvases(userId: number): Promise<Canvas[]>;
  getCanvasesByCategory(userId: number, category: string): Promise<Canvas[]>;
  getCanvas(id: number): Promise<Canvas | undefined>;
  createCanvas(canvas: InsertCanvas): Promise<Canvas>;
  updateCanvas(id: number, canvas: Partial<InsertCanvas>): Promise<Canvas>;
  deleteCanvas(id: number): Promise<void>;
  toggleFavoriteCanvas(id: number): Promise<Canvas>;
  
  // Graph methods
  getGraphs(userId: number): Promise<Graph[]>;
  getGraphsByCategory(userId: number, category: string): Promise<Graph[]>;
  getGraph(id: number): Promise<Graph | undefined>;
  createGraph(graph: InsertGraph): Promise<Graph>;
  updateGraph(id: number, graph: Partial<InsertGraph>): Promise<Graph>;
  deleteGraph(id: number): Promise<void>;
  toggleFavoriteGraph(id: number): Promise<Graph>;
  
  // Folder methods
  getFolders(userId: number): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  getFolderChildren(folderId: number): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: number, folder: Partial<InsertFolder>): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;
  toggleFavoriteFolder(id: number): Promise<Folder>;
  
  // Document methods
  getDocuments(userId: number): Promise<Document[]>;
  getDocumentsByFolder(folderId: number): Promise<Document[]>;
  getDocument(id: number): Promise<Document | undefined>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: number, document: Partial<InsertDocument>): Promise<Document>;
  deleteDocument(id: number): Promise<void>;
  toggleFavoriteDocument(id: number): Promise<Document>;
  
  // Template methods
  getTemplates(userId: number): Promise<Template[]>;
  getTemplatesByCategory(userId: number, category: string): Promise<Template[]>;
  getTemplate(id: number): Promise<Template | undefined>;
  createTemplate(template: InsertTemplate): Promise<Template>;
  updateTemplate(id: number, template: Partial<InsertTemplate>): Promise<Template>;
  deleteTemplate(id: number): Promise<void>;
  toggleFavoriteTemplate(id: number): Promise<Template>;
  
  // Kanban Board methods
  getKanbanBoards(userId: number): Promise<KanbanBoard[]>;
  getKanbanBoard(id: number): Promise<KanbanBoard | undefined>;
  getDefaultKanbanBoard(userId: number): Promise<KanbanBoard | undefined>;
  createKanbanBoard(board: InsertKanbanBoard): Promise<KanbanBoard>;
  updateKanbanBoard(id: number, board: Partial<InsertKanbanBoard>): Promise<KanbanBoard>;
  deleteKanbanBoard(id: number): Promise<void>;
  
  // Kanban Column methods
  getKanbanColumns(boardId: number): Promise<KanbanColumn[]>;
  getKanbanColumn(id: number): Promise<KanbanColumn | undefined>;
  createKanbanColumn(column: InsertKanbanColumn): Promise<KanbanColumn>;
  updateKanbanColumn(id: number, column: Partial<InsertKanbanColumn>): Promise<KanbanColumn>;
  deleteKanbanColumn(id: number): Promise<void>;
  
  // Kanban Task methods
  getKanbanTasks(boardId: number): Promise<KanbanTask[]>;
  getKanbanTask(id: number): Promise<KanbanTask | undefined>;
  createKanbanTask(task: InsertKanbanTask): Promise<KanbanTask>;
  updateKanbanTask(id: number, task: Partial<InsertKanbanTask>): Promise<KanbanTask>;
  deleteKanbanTask(id: number): Promise<void>;
  
  // Integration methods
  getUserIntegrations(userId: number): Promise<Integration[]>;
  getIntegration(id: number): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<InsertIntegration>): Promise<Integration>;
  deleteIntegration(id: number): Promise<void>;
  
  // Progress Tracker methods
  getProgressTrackersByUserId(userId: number): Promise<ProgressTracker[]>;
  getProgressTrackersByCategory(userId: number, category: string): Promise<ProgressTracker[]>;
  getProgressTracker(id: number): Promise<ProgressTracker | undefined>;
  createProgressTracker(tracker: InsertProgressTracker): Promise<ProgressTracker>;
  updateProgressTracker(id: number, tracker: Partial<InsertProgressTracker>): Promise<ProgressTracker>;
  deleteProgressTracker(id: number): Promise<void>;
  
  // Media methods
  getMediaItemsByUserId(userId: number): Promise<MediaItem[]>;
  getMediaItemsByAlbum(albumId: number): Promise<MediaItem[]>;
  getMediaItem(id: number): Promise<MediaItem | undefined>;
  createMediaItem(item: InsertMediaItem): Promise<MediaItem>;
  updateMediaItem(id: number, item: Partial<InsertMediaItem>): Promise<MediaItem>;
  deleteMediaItem(id: number): Promise<void>;
  toggleFavoriteMediaItem(id: number): Promise<MediaItem>;
  
  // Media Album methods
  getMediaAlbumsByUserId(userId: number): Promise<MediaAlbum[]>;
  getMediaAlbum(id: number): Promise<MediaAlbum | undefined>;
  createMediaAlbum(album: InsertMediaAlbum): Promise<MediaAlbum>;
  updateMediaAlbum(id: number, album: Partial<InsertMediaAlbum>): Promise<MediaAlbum>;
  deleteMediaAlbum(id: number): Promise<void>;
  setAlbumCoverImage(albumId: number, mediaItemId: number): Promise<MediaAlbum>;
  
  getWidgetStates(userId: number): Promise<Record<string, boolean>>;
  setWidgetState(userId: number, widgetId: string, isOpen: boolean): Promise<Record<string, boolean>>;
}

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  
  async getUserByPhone(phoneNumber: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber));
    return user;
  }
  
  async getUserByIdentifier(identifier: string): Promise<User | undefined> {
    // Try to find user by username, email, or phone number
    let user = await this.getUserByUsername(identifier);
    if (user) return user;
    
    user = await this.getUserByEmail(identifier);
    if (user) return user;
    
    user = await this.getUserByPhone(identifier);
    return user;
  }
  
  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    return user;
  }
  
  async updateUserPassword(id: number, password: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ password })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  async updateUserFirebaseUid(id: number, firebaseUid: string): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ firebaseUid })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    
    // Create default stats for the new user
    await this.createUserStats({
      userId: user.id,
      timeTokensCurrent: 10,
      timeTokensMax: 10,
      energyPointsCurrent: 10,
      energyPointsMax: 10,
      healthPointsCurrent: 10,
      healthPointsMax: 10,
      experienceCurrent: 0,
      experienceMax: 1000, // Level 1 threshold is 1000 XP
      level: 1
    });
    
    // Create default user profile
    await db.insert(userProfile).values({
      userId: user.id,
      primaryThemeColor: '#00e0ff',
      onboardingCompleted: false,
      setupMissionStatus: 'not_started'
    });
    
    // Create default user integrations
    await db.insert(userIntegrations).values({
      userId: user.id,
      appleHealthConnected: false,
      googleCalendarConnected: false,
      notionConnected: false
    });
    
    return user;
  }
  
  async updateUser(id: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User> {
    // Check if there's anything to update
    if (Object.keys(userData).length === 0) {
      // If no updates, just return the current user data
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    }
    
    // Otherwise perform the update
    const [updatedUser] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  // Stats methods
  async getUserStats(userId: number): Promise<UserStats | undefined> {
    const [stats] = await db.select().from(userStats)
      .where(eq(userStats.userId, userId))
      .orderBy(desc(userStats.updatedAt))
      .limit(1);
    return stats;
  }
  
  async createUserStats(stats: InsertUserStats): Promise<UserStats> {
    const [newStats] = await db
      .insert(userStats)
      .values(stats)
      .onConflictDoUpdate({
        target: userStats.userId,
        set: { ...stats, updatedAt: new Date() }
      })
      .returning();
    return newStats;
  }
  
  async updateUserStats(userId: number, statsUpdate: Partial<InsertUserStats>): Promise<UserStats> {
    const [updatedStats] = await db
      .update(userStats)
      .set({ ...statsUpdate, updatedAt: new Date() })
      .where(eq(userStats.userId, userId))
      .returning();
    return updatedStats;
  }
  
  async processLoginStreak(userId: number): Promise<{ streakDays: number; isNewDay: boolean }> {
    const stats = await this.getUserStats(userId);
    if (!stats) {
      return { streakDays: 0, isNewDay: false };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const lastActiveDate = stats.lastActiveDate;
    let newStreak = stats.streakDays;
    let isNewDay = false;
    
    if (!lastActiveDate) {
      newStreak = 1;
      isNewDay = true;
    } else {
      const lastDate = new Date(lastActiveDate);
      lastDate.setHours(0, 0, 0, 0);
      const lastDateStr = lastDate.toISOString().split('T')[0];
      
      if (lastDateStr === todayStr) {
        isNewDay = false;
      } else {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastDateStr === yesterdayStr) {
          newStreak = stats.streakDays + 1;
        } else {
          newStreak = 1;
        }
        isNewDay = true;
      }
    }
    
    await this.updateUserStats(userId, {
      streakDays: newStreak,
      lastActiveDate: todayStr
    });
    
    return { streakDays: newStreak, isNewDay };
  }
  
  async calculateEfficiency(userId: number): Promise<number> {
    const allQuests = await this.getQuests(userId);
    if (allQuests.length === 0) {
      return 0;
    }
    
    const completedQuests = allQuests.filter(q => q.completed);
    const efficiency = Math.round((completedQuests.length / allQuests.length) * 100);
    
    await this.updateUserStats(userId, {
      efficiencyScore: efficiency
    });
    
    return efficiency;
  }
  
  async processDailyHealthUpdate(userId: number): Promise<number> {
    const stats = await this.getUserStats(userId);
    if (!stats) {
      return 10;
    }
    
    // Get yesterday's date to fetch energy log scores
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateStr = yesterday.toISOString().split('T')[0];
    
    // Fetch yesterday's energy log
    const [yesterdayLog] = await db.select()
      .from(userDailyLogs)
      .where(and(
        eq(userDailyLogs.userId, userId),
        eq(userDailyLogs.date, yesterdayDateStr)
      ))
      .limit(1);
    
    // Calculate energy log score (average of mental, physical, emotional states)
    let energyLogScore = 5; // Default middle score if no log exists
    if (yesterdayLog) {
      const mental = yesterdayLog.mentalState ?? 5;
      const physical = yesterdayLog.physicalState ?? 5;
      const emotional = yesterdayLog.emotionalState ?? 5;
      energyLogScore = (mental + physical + emotional) / 3;
    }
    
    // Also factor in energy usage from missions
    const previousDayEnergyUsed = stats.previousDayEnergyUsed || 0;
    const energyMax = stats.energyPointsMax;
    const energyUsageRatio = energyMax > 0 ? previousDayEnergyUsed / energyMax : 0;
    
    // Calculate health adjustment based on both energy log scores and mission energy usage
    let healthAdjustment = 0;
    
    // Energy log score impact (1-10 scale): high = gain health, low = lose health
    if (energyLogScore >= 8) {
      healthAdjustment += 2; // Feeling great = +2 health
    } else if (energyLogScore >= 6) {
      healthAdjustment += 1; // Feeling good = +1 health
    } else if (energyLogScore <= 3) {
      healthAdjustment -= 2; // Feeling poor = -2 health
    } else if (energyLogScore <= 4) {
      healthAdjustment -= 1; // Feeling below average = -1 health
    }
    
    // Mission energy usage impact: high usage = lose health (overworked)
    if (energyUsageRatio >= 0.8) {
      healthAdjustment -= 1; // Overworked
    } else if (energyUsageRatio <= 0.2 && previousDayEnergyUsed > 0) {
      healthAdjustment += 1; // Well-rested but productive
    }
    
    const currentHealth = stats.healthPointsCurrent;
    const maxHealth = stats.healthPointsMax;
    const newHealth = Math.max(1, Math.min(maxHealth, currentHealth + healthAdjustment));
    
    await this.updateUserStats(userId, {
      healthPointsCurrent: newHealth,
      previousDayEnergyUsed: 0
    });
    
    return newHealth;
  }
  
  // User Profile methods
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfile)
      .where(eq(userProfile.userId, userId))
      .orderBy(desc(userProfile.id))
      .limit(1);
    return profile;
  }
  
  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    const [newProfile] = await db
      .insert(userProfile)
      .values(profile)
      .returning();
    return newProfile;
  }
  
  async updateUserProfile(userId: number, profileUpdate: Partial<InsertUserProfile>): Promise<UserProfile> {
    const [updatedProfile] = await db
      .update(userProfile)
      .set({ ...profileUpdate })
      .where(eq(userProfile.userId, userId))
      .returning();
    return updatedProfile;
  }
  
  async upsertUserProfile(userId: number, profileData: Partial<InsertUserProfile>): Promise<UserProfile> {
    // Use atomic upsert with ON CONFLICT to prevent race condition duplicates
    const [upsertedProfile] = await db
      .insert(userProfile)
      .values({ ...profileData, userId } as InsertUserProfile)
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: { ...profileData, updatedAt: new Date() }
      })
      .returning();
    return upsertedProfile;
  }
  
  // User Daily Logs methods
  async getUserDailyLogs(userId: number): Promise<UserDailyLog[]> {
    return db.select().from(userDailyLogs).where(eq(userDailyLogs.userId, userId));
  }
  
  async getUserDailyLogByDate(userId: number, date: Date): Promise<UserDailyLog | undefined> {
    const formattedDate = date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD format
    const [log] = await db.select()
      .from(userDailyLogs)
      .where(and(
        eq(userDailyLogs.userId, userId),
        eq(userDailyLogs.date, formattedDate)
      ));
    return log;
  }
  
  async createUserDailyLog(log: InsertUserDailyLog): Promise<UserDailyLog> {
    const [newLog] = await db
      .insert(userDailyLogs)
      .values(log)
      .returning();
    return newLog;
  }
  
  async updateUserDailyLog(id: number, logUpdate: Partial<InsertUserDailyLog>): Promise<UserDailyLog> {
    const [updatedLog] = await db
      .update(userDailyLogs)
      .set({ ...logUpdate })
      .where(eq(userDailyLogs.id, id))
      .returning();
    return updatedLog;
  }
  
  // User Integration methods
  async getUserIntegration(userId: number): Promise<UserIntegration | undefined> {
    const [integration] = await db.select().from(userIntegrations).where(eq(userIntegrations.userId, userId));
    return integration;
  }
  
  async createUserIntegration(integration: InsertUserIntegration): Promise<UserIntegration> {
    const [newIntegration] = await db
      .insert(userIntegrations)
      .values(integration)
      .returning();
    return newIntegration;
  }
  
  async updateUserIntegration(userId: number, integrationUpdate: Partial<InsertUserIntegration>): Promise<UserIntegration> {
    const [updatedIntegration] = await db
      .update(userIntegrations)
      .set({ ...integrationUpdate })
      .where(eq(userIntegrations.userId, userId))
      .returning();
    return updatedIntegration;
  }
  
  // Quest methods
  async getQuests(userId: number): Promise<Quest[]> {
    return db.select().from(quests).where(eq(quests.userId, userId));
  }
  
  async getQuest(id: number): Promise<Quest | undefined> {
    const [quest] = await db.select().from(quests).where(eq(quests.id, id));
    return quest;
  }
  
  async createQuest(quest: InsertQuest): Promise<Quest> {
    const [newQuest] = await db
      .insert(quests)
      .values(quest)
      .returning();
    return newQuest;
  }
  
  async updateQuest(id: number, questUpdate: Partial<InsertQuest>): Promise<Quest> {
    const [updatedQuest] = await db
      .update(quests)
      .set(questUpdate)
      .where(eq(quests.id, id))
      .returning();
    return updatedQuest;
  }
  
  async toggleQuestCompletion(id: number): Promise<{ quest: Quest; statsUpdated: boolean; levelUp: boolean }> {
    // First, get the current state
    const quest = await this.getQuest(id);
    if (!quest) throw new Error("Quest not found");
    
    // Toggle the completed state and set completedAt timestamp
    const isCompleting = !quest.completed;
    const [updatedQuest] = await db
      .update(quests)
      .set({ 
        completed: isCompleting,
        completedAt: isCompleting ? new Date() : null
      })
      .where(eq(quests.id, id))
      .returning();
    
    let statsUpdated = false;
    let levelUp = false;
    
    // Helper function to calculate duration in hours, handling overnight spans
    const calculateDurationHours = (startTime: string | null, endTime: string | null): number => {
      if (!startTime || !endTime) return 1; // Default to 1 hour if times not set
      
      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);
      
      // Validate parsed values
      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        return 1;
      }
      
      let startMinutes = startHour * 60 + startMin;
      let endMinutes = endHour * 60 + endMin;
      
      // Handle overnight spans (e.g., 22:00 to 02:00)
      if (endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours worth of minutes
      }
      
      const durationMins = endMinutes - startMinutes;
      return Math.max(1, Math.ceil(durationMins / 60));
    };
    
    // If quest was just completed, update all user stats
    if (!quest.completed && updatedQuest.completed) {
      const userStats = await this.getUserStats(updatedQuest.userId);
      const userProfileData = await this.getUserProfile(updatedQuest.userId);
      
      if (userStats) {
        const durationHours = calculateDurationHours(quest.startTime, quest.endTime);
        const energyCost = quest.energyCost || 1;
        
        // Calculate new stat values (deduct resources, add XP)
        const newTimeTokens = Math.max(0, userStats.timeTokensCurrent - durationHours);
        const newAttentionTokens = Math.max(0, userStats.attentionTokensCurrent - durationHours);
        const newEnergyPoints = Math.max(0, userStats.energyPointsCurrent - energyCost);
        
        // Difficulty rank XP multipliers: D=1x, C=1.5x, B=2x, A=3x, S=5x
        const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
        const xpMultiplier = difficultyMultipliers[quest.difficulty || 'D'] || 1;
        const adjustedXpReward = Math.floor(quest.experienceReward * xpMultiplier);
        
        // Add experience reward
        let newExperience = userStats.experienceCurrent + adjustedXpReward;
        let newLevel = userStats.level;
        let newExperienceMax = userStats.experienceMax;
        
        // Level up if necessary
        while (newExperience >= newExperienceMax) {
          newExperience -= newExperienceMax;
          newLevel += 1;
          newExperienceMax = Math.floor(newExperienceMax * 1.0372); // Precise scaling to reach 1M XP at level 100
          levelUp = true;
        }
        
        // Track energy used today for health calculation
        const previousDayEnergyUsed = (userStats.previousDayEnergyUsed || 0) + energyCost;
        
        // Update all user stats
        await this.updateUserStats(updatedQuest.userId, {
          timeTokensCurrent: newTimeTokens,
          attentionTokensCurrent: newAttentionTokens,
          energyPointsCurrent: newEnergyPoints,
          experienceCurrent: newExperience,
          level: newLevel,
          experienceMax: newExperienceMax,
          previousDayEnergyUsed: previousDayEnergyUsed
        });
        
        // Also update totalXP in user profile for consistency
        if (userProfileData) {
          const newTotalXP = (userProfileData.totalXP || 0) + quest.experienceReward;
          await this.updateUserProfile(updatedQuest.userId, { totalXP: newTotalXP });
        }
        
        // Recalculate efficiency after completing a quest
        await this.calculateEfficiency(updatedQuest.userId);
        
        statsUpdated = true;
        
        console.log(`Quest completed: duration=${durationHours}h, energyCost=${energyCost}, xp=${quest.experienceReward}`);
        console.log(`Stats updated: time=${newTimeTokens}, attention=${newAttentionTokens}, energy=${newEnergyPoints}, xp=${newExperience}, level=${newLevel}`);
      }
    }
    
    // If quest was uncompleted, refund the resources
    if (quest.completed && !updatedQuest.completed) {
      const userStats = await this.getUserStats(updatedQuest.userId);
      const userProfileData = await this.getUserProfile(updatedQuest.userId);
      
      if (userStats) {
        const durationHours = calculateDurationHours(quest.startTime, quest.endTime);
        const energyCost = quest.energyCost || 1;
        
        // Refund resources (cap at max values)
        const newTimeTokens = Math.min(userStats.timeTokensMax, userStats.timeTokensCurrent + durationHours);
        const newAttentionTokens = Math.min(userStats.attentionTokensMax, userStats.attentionTokensCurrent + durationHours);
        const newEnergyPoints = Math.min(userStats.energyPointsMax, userStats.energyPointsCurrent + energyCost);
        
        // Deduct XP (but don't go below 0 - we don't de-level to keep progression simple)
        const newExperience = Math.max(0, userStats.experienceCurrent - quest.experienceReward);
        
        // Reduce today's tracked energy usage when uncompleting
        const previousDayEnergyUsed = Math.max(0, (userStats.previousDayEnergyUsed || 0) - energyCost);
        
        await this.updateUserStats(updatedQuest.userId, {
          timeTokensCurrent: newTimeTokens,
          attentionTokensCurrent: newAttentionTokens,
          energyPointsCurrent: newEnergyPoints,
          experienceCurrent: newExperience,
          previousDayEnergyUsed: previousDayEnergyUsed
        });
        
        // Also update totalXP in user profile for consistency
        if (userProfileData) {
          const newTotalXP = Math.max(0, (userProfileData.totalXP || 0) - quest.experienceReward);
          await this.updateUserProfile(updatedQuest.userId, { totalXP: newTotalXP });
        }
        
        // Recalculate efficiency after uncompleting a quest
        await this.calculateEfficiency(updatedQuest.userId);
        
        statsUpdated = true;
      }
    }
    
    return { quest: updatedQuest, statsUpdated, levelUp };
  }
  
  async deleteQuest(id: number): Promise<void> {
    await db.delete(quests).where(eq(quests.id, id));
  }
  
  // AI Message methods
  async getMessages(userId: number): Promise<AIMessage[]> {
    return db.select().from(aiMessages).where(eq(aiMessages.userId, userId));
  }
  
  async createMessage(message: InsertAIMessage): Promise<AIMessage> {
    const [newMessage] = await db
      .insert(aiMessages)
      .values(message)
      .returning();
    return newMessage;
  }
  
  // Calendar Event methods
  async getEvents(userId: number): Promise<CalendarEvent[]> {
    return db.select().from(calendarEvents).where(eq(calendarEvents.userId, userId));
  }
  
  async getEvent(id: number): Promise<CalendarEvent | undefined> {
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return event;
  }
  
  async createEvent(event: InsertCalendarEvent): Promise<CalendarEvent> {
    const [newEvent] = await db
      .insert(calendarEvents)
      .values(event)
      .returning();
    return newEvent;
  }
  
  async updateEvent(id: number, eventUpdate: Partial<InsertCalendarEvent>): Promise<CalendarEvent> {
    const [updatedEvent] = await db
      .update(calendarEvents)
      .set(eventUpdate)
      .where(eq(calendarEvents.id, id))
      .returning();
    return updatedEvent;
  }
  
  async deleteEvent(id: number): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }
  
  // Mission Page methods
  async getMissionPages(userId: number): Promise<MissionPage[]> {
    return db.select().from(missionPages).where(eq(missionPages.userId, userId));
  }
  
  async getMissionPage(id: number): Promise<MissionPage | undefined> {
    const [page] = await db.select().from(missionPages).where(eq(missionPages.id, id));
    return page;
  }
  
  async getMissionPageBySlug(slug: string): Promise<MissionPage | undefined> {
    const [page] = await db.select().from(missionPages).where(eq(missionPages.slug, slug));
    return page;
  }
  
  async createMissionPage(page: InsertMissionPage): Promise<MissionPage> {
    const [newPage] = await db
      .insert(missionPages)
      .values(page)
      .returning();
    return newPage;
  }
  
  async updateMissionPage(id: number, pageUpdate: Partial<InsertMissionPage>): Promise<MissionPage> {
    const [updatedPage] = await db
      .update(missionPages)
      .set({ ...pageUpdate, updatedAt: new Date() })
      .where(eq(missionPages.id, id))
      .returning();
    return updatedPage;
  }
  
  async deleteMissionPage(id: number): Promise<void> {
    await db.delete(missionPages).where(eq(missionPages.id, id));
  }
  
  // Contact methods
  async getContacts(userId: number): Promise<Contact[]> {
    return db.select().from(contacts).where(eq(contacts.userId, userId));
  }
  
  async getContactsByCategory(userId: number, category: string): Promise<Contact[]> {
    return db.select()
      .from(contacts)
      .where(and(
        eq(contacts.userId, userId),
        eq(contacts.category, category)
      ));
  }
  
  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }
  
  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db
      .insert(contacts)
      .values(contact)
      .returning();
    return newContact;
  }
  
  async updateContact(id: number, contactUpdate: Partial<InsertContact>): Promise<Contact> {
    const [updatedContact] = await db
      .update(contacts)
      .set({ ...contactUpdate, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    return updatedContact;
  }
  
  async deleteContact(id: number): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }
  
  async toggleFavoriteContact(id: number): Promise<Contact> {
    const contact = await this.getContact(id);
    if (!contact) throw new Error("Contact not found");
    
    const [updatedContact] = await db
      .update(contacts)
      .set({ 
        favorite: !contact.favorite,
        updatedAt: new Date()
      })
      .where(eq(contacts.id, id))
      .returning();
    
    return updatedContact;
  }

  // Spreadsheet methods
  async getSpreadsheets(userId: number): Promise<Spreadsheet[]> {
    return db.select().from(spreadsheets).where(eq(spreadsheets.userId, userId));
  }
  
  async getSpreadsheetsByCategory(userId: number, category: string): Promise<Spreadsheet[]> {
    return db.select()
      .from(spreadsheets)
      .where(and(
        eq(spreadsheets.userId, userId),
        eq(spreadsheets.category, category)
      ));
  }
  
  async getSpreadsheet(id: number): Promise<Spreadsheet | undefined> {
    const [spreadsheet] = await db.select().from(spreadsheets).where(eq(spreadsheets.id, id));
    return spreadsheet;
  }
  
  async createSpreadsheet(spreadsheet: InsertSpreadsheet): Promise<Spreadsheet> {
    const [newSpreadsheet] = await db
      .insert(spreadsheets)
      .values(spreadsheet)
      .returning();
    return newSpreadsheet;
  }
  
  async updateSpreadsheet(id: number, spreadsheetUpdate: Partial<InsertSpreadsheet>): Promise<Spreadsheet> {
    const [updatedSpreadsheet] = await db
      .update(spreadsheets)
      .set({ ...spreadsheetUpdate, updatedAt: new Date() })
      .where(eq(spreadsheets.id, id))
      .returning();
    return updatedSpreadsheet;
  }
  
  async deleteSpreadsheet(id: number): Promise<void> {
    await db.delete(spreadsheets).where(eq(spreadsheets.id, id));
  }
  
  async toggleFavoriteSpreadsheet(id: number): Promise<Spreadsheet> {
    const spreadsheet = await this.getSpreadsheet(id);
    if (!spreadsheet) throw new Error("Spreadsheet not found");
    
    const [updatedSpreadsheet] = await db
      .update(spreadsheets)
      .set({ 
        favorite: !spreadsheet.favorite,
        updatedAt: new Date()
      })
      .where(eq(spreadsheets.id, id))
      .returning();
    
    return updatedSpreadsheet;
  }

  // Canvas methods
  async getCanvases(userId: number): Promise<Canvas[]> {
    return db.select().from(canvases).where(eq(canvases.userId, userId));
  }
  
  async getCanvasesByCategory(userId: number, category: string): Promise<Canvas[]> {
    return db.select()
      .from(canvases)
      .where(and(
        eq(canvases.userId, userId),
        eq(canvases.category, category)
      ));
  }
  
  async getCanvas(id: number): Promise<Canvas | undefined> {
    const [canvas] = await db.select().from(canvases).where(eq(canvases.id, id));
    return canvas;
  }
  
  async createCanvas(canvas: InsertCanvas): Promise<Canvas> {
    const [newCanvas] = await db
      .insert(canvases)
      .values(canvas)
      .returning();
    return newCanvas;
  }
  
  async updateCanvas(id: number, canvasUpdate: Partial<InsertCanvas>): Promise<Canvas> {
    const [updatedCanvas] = await db
      .update(canvases)
      .set({ ...canvasUpdate, updatedAt: new Date() })
      .where(eq(canvases.id, id))
      .returning();
    return updatedCanvas;
  }
  
  async deleteCanvas(id: number): Promise<void> {
    await db.delete(canvases).where(eq(canvases.id, id));
  }
  
  async toggleFavoriteCanvas(id: number): Promise<Canvas> {
    const canvas = await this.getCanvas(id);
    if (!canvas) throw new Error("Canvas not found");
    
    const [updatedCanvas] = await db
      .update(canvases)
      .set({ 
        favorite: !canvas.favorite,
        updatedAt: new Date()
      })
      .where(eq(canvases.id, id))
      .returning();
    
    return updatedCanvas;
  }

  // Graph methods
  async getGraphs(userId: number): Promise<Graph[]> {
    return db.select().from(graphs).where(eq(graphs.userId, userId));
  }
  
  async getGraphsByCategory(userId: number, category: string): Promise<Graph[]> {
    return db.select()
      .from(graphs)
      .where(and(
        eq(graphs.userId, userId),
        eq(graphs.category, category)
      ));
  }
  
  async getGraph(id: number): Promise<Graph | undefined> {
    const [graph] = await db.select().from(graphs).where(eq(graphs.id, id));
    return graph;
  }
  
  async createGraph(graph: InsertGraph): Promise<Graph> {
    const [newGraph] = await db
      .insert(graphs)
      .values(graph)
      .returning();
    return newGraph;
  }
  
  async updateGraph(id: number, graphUpdate: Partial<InsertGraph>): Promise<Graph> {
    const [updatedGraph] = await db
      .update(graphs)
      .set({ ...graphUpdate, updatedAt: new Date() })
      .where(eq(graphs.id, id))
      .returning();
    return updatedGraph;
  }
  
  async deleteGraph(id: number): Promise<void> {
    await db.delete(graphs).where(eq(graphs.id, id));
  }
  
  async toggleFavoriteGraph(id: number): Promise<Graph> {
    const graph = await this.getGraph(id);
    if (!graph) throw new Error("Graph not found");
    
    const [updatedGraph] = await db
      .update(graphs)
      .set({ 
        favorite: !graph.favorite,
        updatedAt: new Date()
      })
      .where(eq(graphs.id, id))
      .returning();
    
    return updatedGraph;
  }

  // Folder methods
  async getFolders(userId: number): Promise<Folder[]> {
    return db.select().from(folders).where(eq(folders.userId, userId));
  }
  
  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }
  
  async getFolderChildren(folderId: number): Promise<Folder[]> {
    return db.select().from(folders).where(eq(folders.parentId, folderId));
  }
  
  async createFolder(folder: InsertFolder): Promise<Folder> {
    const [newFolder] = await db
      .insert(folders)
      .values(folder)
      .returning();
    return newFolder;
  }
  
  async updateFolder(id: number, folderUpdate: Partial<InsertFolder>): Promise<Folder> {
    const [updatedFolder] = await db
      .update(folders)
      .set({ ...folderUpdate, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return updatedFolder;
  }
  
  async deleteFolder(id: number): Promise<void> {
    await db.delete(folders).where(eq(folders.id, id));
  }
  
  async toggleFavoriteFolder(id: number): Promise<Folder> {
    const folder = await this.getFolder(id);
    if (!folder) throw new Error("Folder not found");
    
    const [updatedFolder] = await db
      .update(folders)
      .set({ 
        favorite: !folder.favorite,
        updatedAt: new Date()
      })
      .where(eq(folders.id, id))
      .returning();
    
    return updatedFolder;
  }

  // Document methods
  async getDocuments(userId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.userId, userId));
  }
  
  async getDocumentsByFolder(folderId: number): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.folderId, folderId));
  }
  
  async getDocument(id: number): Promise<Document | undefined> {
    const [document] = await db.select().from(documents).where(eq(documents.id, id));
    return document;
  }
  
  async createDocument(document: InsertDocument): Promise<Document> {
    const [newDocument] = await db
      .insert(documents)
      .values(document)
      .returning();
    return newDocument;
  }
  
  async updateDocument(id: number, documentUpdate: Partial<InsertDocument>): Promise<Document> {
    const [updatedDocument] = await db
      .update(documents)
      .set({ ...documentUpdate, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();
    return updatedDocument;
  }
  
  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }
  
  async toggleFavoriteDocument(id: number): Promise<Document> {
    const document = await this.getDocument(id);
    if (!document) throw new Error("Document not found");
    
    const [updatedDocument] = await db
      .update(documents)
      .set({ 
        favorite: !document.favorite,
        updatedAt: new Date()
      })
      .where(eq(documents.id, id))
      .returning();
    
    return updatedDocument;
  }

  // Template methods
  async getTemplates(userId: number): Promise<Template[]> {
    return db.select().from(templates).where(eq(templates.userId, userId));
  }
  
  async getTemplatesByCategory(userId: number, category: string): Promise<Template[]> {
    return db.select()
      .from(templates)
      .where(and(
        eq(templates.userId, userId),
        eq(templates.category, category)
      ));
  }
  
  async getTemplate(id: number): Promise<Template | undefined> {
    const [template] = await db.select().from(templates).where(eq(templates.id, id));
    return template;
  }
  
  async createTemplate(template: InsertTemplate): Promise<Template> {
    const [newTemplate] = await db
      .insert(templates)
      .values(template)
      .returning();
    return newTemplate;
  }
  
  async updateTemplate(id: number, templateUpdate: Partial<InsertTemplate>): Promise<Template> {
    const [updatedTemplate] = await db
      .update(templates)
      .set({ ...templateUpdate, updatedAt: new Date() })
      .where(eq(templates.id, id))
      .returning();
    return updatedTemplate;
  }
  
  async deleteTemplate(id: number): Promise<void> {
    await db.delete(templates).where(eq(templates.id, id));
  }
  
  async toggleFavoriteTemplate(id: number): Promise<Template> {
    const template = await this.getTemplate(id);
    if (!template) throw new Error("Template not found");
    
    const [updatedTemplate] = await db
      .update(templates)
      .set({ 
        favorite: !template.favorite,
        updatedAt: new Date()
      })
      .where(eq(templates.id, id))
      .returning();
    
    return updatedTemplate;
  }

  // Kanban Board methods
  async getKanbanBoards(userId: number): Promise<KanbanBoard[]> {
    return db.select().from(kanbanBoards).where(eq(kanbanBoards.userId, userId));
  }
  
  async getKanbanBoard(id: number): Promise<KanbanBoard | undefined> {
    const [board] = await db.select().from(kanbanBoards).where(eq(kanbanBoards.id, id));
    return board;
  }
  
  async getDefaultKanbanBoard(userId: number): Promise<KanbanBoard | undefined> {
    const [board] = await db.select()
      .from(kanbanBoards)
      .where(and(
        eq(kanbanBoards.userId, userId),
        eq(kanbanBoards.isDefault, true)
      ));
    return board;
  }
  
  async createKanbanBoard(board: InsertKanbanBoard): Promise<KanbanBoard> {
    // If this is the first board or it's marked as default, ensure it's the only default
    if (board.isDefault) {
      // Remove default status from all other boards for this user
      await db.update(kanbanBoards)
        .set({ isDefault: false })
        .where(and(
          eq(kanbanBoards.userId, board.userId),
          eq(kanbanBoards.isDefault, true)
        ));
    }
    
    // If this is the first board for the user, make it default regardless
    const existingBoards = await this.getKanbanBoards(board.userId);
    if (existingBoards.length === 0) {
      board.isDefault = true;
    }
    
    const [newBoard] = await db
      .insert(kanbanBoards)
      .values(board)
      .returning();
    
    // Create default columns for the new board
    const defaultColumns = [
      { boardId: newBoard.id, title: "Backlog", status: "backlog", order: 0 },
      { boardId: newBoard.id, title: "In Progress", status: "inProgress", order: 1 },
      { boardId: newBoard.id, title: "Review", status: "review", order: 2 },
      { boardId: newBoard.id, title: "Done", status: "done", order: 3 }
    ];
    
    for (const column of defaultColumns) {
      await this.createKanbanColumn(column);
    }
    
    return newBoard;
  }
  
  async updateKanbanBoard(id: number, boardUpdate: Partial<InsertKanbanBoard>): Promise<KanbanBoard> {
    // If setting as default, ensure it's the only default for this user
    if (boardUpdate.isDefault) {
      const board = await this.getKanbanBoard(id);
      if (board) {
        await db.update(kanbanBoards)
          .set({ isDefault: false })
          .where(and(
            eq(kanbanBoards.userId, board.userId),
            eq(kanbanBoards.isDefault, true)
          ));
      }
    }
    
    const [updatedBoard] = await db
      .update(kanbanBoards)
      .set({ ...boardUpdate, updatedAt: new Date() })
      .where(eq(kanbanBoards.id, id))
      .returning();
    return updatedBoard;
  }
  
  async deleteKanbanBoard(id: number): Promise<void> {
    // Get the board to check if it's the default
    const board = await this.getKanbanBoard(id);
    
    // Delete the board (cascade will handle columns and tasks)
    await db.delete(kanbanBoards).where(eq(kanbanBoards.id, id));
    
    // If this was the default board, set a new default if there are any remaining boards
    if (board && board.isDefault) {
      const remainingBoards = await this.getKanbanBoards(board.userId);
      if (remainingBoards.length > 0) {
        await this.updateKanbanBoard(remainingBoards[0].id, { isDefault: true });
      }
    }
  }
  
  // Kanban Column methods
  async getKanbanColumns(boardId: number): Promise<KanbanColumn[]> {
    return db.select()
      .from(kanbanColumns)
      .where(eq(kanbanColumns.boardId, boardId))
      .orderBy(kanbanColumns.order);
  }
  
  async getKanbanColumn(id: number): Promise<KanbanColumn | undefined> {
    const [column] = await db.select().from(kanbanColumns).where(eq(kanbanColumns.id, id));
    return column;
  }
  
  async createKanbanColumn(column: InsertKanbanColumn): Promise<KanbanColumn> {
    const [newColumn] = await db
      .insert(kanbanColumns)
      .values(column)
      .returning();
    return newColumn;
  }
  
  async updateKanbanColumn(id: number, columnUpdate: Partial<InsertKanbanColumn>): Promise<KanbanColumn> {
    const [updatedColumn] = await db
      .update(kanbanColumns)
      .set({ ...columnUpdate, updatedAt: new Date() })
      .where(eq(kanbanColumns.id, id))
      .returning();
    return updatedColumn;
  }
  
  async deleteKanbanColumn(id: number): Promise<void> {
    // First, get the column to get its board ID and order
    const column = await this.getKanbanColumn(id);
    if (!column) return;
    
    // Delete the column
    await db.delete(kanbanColumns).where(eq(kanbanColumns.id, id));
    
    // Reorder remaining columns
    const remainingColumns = await this.getKanbanColumns(column.boardId);
    for (let i = 0; i < remainingColumns.length; i++) {
      if (remainingColumns[i].order !== i) {
        await this.updateKanbanColumn(remainingColumns[i].id, { order: i });
      }
    }
  }
  
  // Kanban Task methods
  async getKanbanTasks(boardId: number): Promise<KanbanTask[]> {
    return db.select()
      .from(kanbanTasks)
      .where(eq(kanbanTasks.boardId, boardId));
  }
  
  async getKanbanTask(id: number): Promise<KanbanTask | undefined> {
    const [task] = await db.select().from(kanbanTasks).where(eq(kanbanTasks.id, id));
    return task;
  }
  
  async createKanbanTask(task: InsertKanbanTask): Promise<KanbanTask> {
    const [newTask] = await db
      .insert(kanbanTasks)
      .values(task)
      .returning();
    return newTask;
  }
  
  async updateKanbanTask(id: number, taskUpdate: Partial<InsertKanbanTask>): Promise<KanbanTask> {
    const [updatedTask] = await db
      .update(kanbanTasks)
      .set({ ...taskUpdate, updatedAt: new Date() })
      .where(eq(kanbanTasks.id, id))
      .returning();
    return updatedTask;
  }
  
  async deleteKanbanTask(id: number): Promise<void> {
    await db.delete(kanbanTasks).where(eq(kanbanTasks.id, id));
  }

  // Integration methods
  async getUserIntegrations(userId: number): Promise<Integration[]> {
    return db.select().from(integrations).where(eq(integrations.userId, userId));
  }

  async getIntegration(id: number): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations).where(eq(integrations.id, id));
    return integration;
  }

  async createIntegration(integration: InsertIntegration): Promise<Integration> {
    const [newIntegration] = await db
      .insert(integrations)
      .values(integration)
      .returning();
    return newIntegration;
  }

  async updateIntegration(id: number, integrationUpdate: Partial<InsertIntegration>): Promise<Integration> {
    const [updatedIntegration] = await db
      .update(integrations)
      .set(integrationUpdate)
      .where(eq(integrations.id, id))
      .returning();
    return updatedIntegration;
  }

  async deleteIntegration(id: number): Promise<void> {
    await db.delete(integrations).where(eq(integrations.id, id));
  }

  // Progress Tracker methods
  async getProgressTrackersByUserId(userId: number): Promise<ProgressTracker[]> {
    return db.select().from(progressTrackers).where(eq(progressTrackers.userId, userId));
  }
  
  async getProgressTrackersByCategory(userId: number, category: string): Promise<ProgressTracker[]> {
    return db.select()
      .from(progressTrackers)
      .where(and(
        eq(progressTrackers.userId, userId),
        eq(progressTrackers.category, category)
      ));
  }
  
  async getProgressTracker(id: number): Promise<ProgressTracker | undefined> {
    const [tracker] = await db.select().from(progressTrackers).where(eq(progressTrackers.id, id));
    return tracker;
  }
  
  async createProgressTracker(tracker: InsertProgressTracker): Promise<ProgressTracker> {
    const [newTracker] = await db
      .insert(progressTrackers)
      .values(tracker)
      .returning();
    return newTracker;
  }
  
  async updateProgressTracker(id: number, trackerUpdate: Partial<InsertProgressTracker>): Promise<ProgressTracker> {
    const [updatedTracker] = await db
      .update(progressTrackers)
      .set({ ...trackerUpdate, updatedAt: new Date() })
      .where(eq(progressTrackers.id, id))
      .returning();
    return updatedTracker;
  }
  
  async deleteProgressTracker(id: number): Promise<void> {
    await db.delete(progressTrackers).where(eq(progressTrackers.id, id));
  }
  
  // Media methods
  async getMediaItemsByUserId(userId: number): Promise<MediaItem[]> {
    return db.select().from(mediaItems).where(eq(mediaItems.userId, userId));
  }
  
  async getMediaItemsByAlbum(albumId: number): Promise<MediaItem[]> {
    return db.select().from(mediaItems).where(eq(mediaItems.albumId, albumId));
  }
  
  async getMediaItem(id: number): Promise<MediaItem | undefined> {
    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id));
    return item;
  }
  
  async createMediaItem(item: InsertMediaItem): Promise<MediaItem> {
    const [newItem] = await db
      .insert(mediaItems)
      .values(item)
      .returning();
    return newItem;
  }
  
  async updateMediaItem(id: number, itemUpdate: Partial<InsertMediaItem>): Promise<MediaItem> {
    const [updatedItem] = await db
      .update(mediaItems)
      .set({ ...itemUpdate, updatedAt: new Date() })
      .where(eq(mediaItems.id, id))
      .returning();
    return updatedItem;
  }
  
  async deleteMediaItem(id: number): Promise<void> {
    await db.delete(mediaItems).where(eq(mediaItems.id, id));
  }
  
  async toggleFavoriteMediaItem(id: number): Promise<MediaItem> {
    const item = await this.getMediaItem(id);
    if (!item) throw new Error("Media item not found");
    
    const [updatedItem] = await db
      .update(mediaItems)
      .set({ 
        isFavorite: !item.isFavorite,
        updatedAt: new Date()
      })
      .where(eq(mediaItems.id, id))
      .returning();
    
    return updatedItem;
  }
  
  // Media Album methods
  async getMediaAlbumsByUserId(userId: number): Promise<MediaAlbum[]> {
    return db.select().from(mediaAlbums).where(eq(mediaAlbums.userId, userId));
  }
  
  async getMediaAlbum(id: number): Promise<MediaAlbum | undefined> {
    const [album] = await db.select().from(mediaAlbums).where(eq(mediaAlbums.id, id));
    return album;
  }
  
  async createMediaAlbum(album: InsertMediaAlbum): Promise<MediaAlbum> {
    const [newAlbum] = await db
      .insert(mediaAlbums)
      .values(album)
      .returning();
    return newAlbum;
  }
  
  async updateMediaAlbum(id: number, albumUpdate: Partial<InsertMediaAlbum>): Promise<MediaAlbum> {
    const [updatedAlbum] = await db
      .update(mediaAlbums)
      .set({ ...albumUpdate, updatedAt: new Date() })
      .where(eq(mediaAlbums.id, id))
      .returning();
    return updatedAlbum;
  }
  
  async deleteMediaAlbum(id: number): Promise<void> {
    // First check if there are media items in this album
    const itemsInAlbum = await this.getMediaItemsByAlbum(id);
    
    // If there are items, update them to have null albumId
    if (itemsInAlbum.length > 0) {
      await db
        .update(mediaItems)
        .set({ albumId: null })
        .where(eq(mediaItems.albumId, id));
    }
    
    // Then delete the album
    await db.delete(mediaAlbums).where(eq(mediaAlbums.id, id));
  }
  
  async setAlbumCoverImage(albumId: number, mediaItemId: number): Promise<MediaAlbum> {
    // Check if album exists
    const album = await this.getMediaAlbum(albumId);
    if (!album) throw new Error("Album not found");
    
    // Check if media item exists
    const mediaItem = await this.getMediaItem(mediaItemId);
    if (!mediaItem) throw new Error("Media item not found");
    
    // Update the album
    const [updatedAlbum] = await db
      .update(mediaAlbums)
      .set({ 
        coverImageId: mediaItemId,
        updatedAt: new Date()
      })
      .where(eq(mediaAlbums.id, albumId))
      .returning();
    
    return updatedAlbum;
  }
  async getWidgetStates(userId: number): Promise<Record<string, boolean>> {
    const [row] = await db.select().from(widgetStates).where(eq(widgetStates.userId, userId));
    return (row?.states as Record<string, boolean>) || {};
  }

  async setWidgetState(userId: number, widgetId: string, isOpen: boolean): Promise<Record<string, boolean>> {
    const [existing] = await db.select().from(widgetStates).where(eq(widgetStates.userId, userId));
    
    if (existing) {
      const currentStates = (existing.states as Record<string, boolean>) || {};
      const newStates = { ...currentStates, [widgetId]: isOpen };
      await db.update(widgetStates).set({ states: newStates }).where(eq(widgetStates.userId, userId));
      return newStates;
    } else {
      const newStates = { [widgetId]: isOpen };
      await db.insert(widgetStates).values({ userId, states: newStates });
      return newStates;
    }
  }
}

export const storage = new DatabaseStorage();