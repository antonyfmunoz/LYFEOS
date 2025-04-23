import { 
  users, type User, type InsertUser, 
  userStats, type UserStats, type InsertUserStats,
  quests, type Quest, type InsertQuest,
  aiMessages, type AIMessage, type InsertAIMessage,
  calendarEvents, type CalendarEvent, type InsertCalendarEvent,
  missionPages, type MissionPage, type InsertMissionPage,
  contacts, type Contact, type InsertContact,
  spreadsheets, type Spreadsheet, type InsertSpreadsheet,
  canvases, type Canvas, type InsertCanvas,
  graphs, type Graph, type InsertGraph,
  folders, type Folder, type InsertFolder,
  documents, type Document, type InsertDocument
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User>;
  
  // Stats methods
  getUserStats(userId: number): Promise<UserStats | undefined>;
  createUserStats(stats: InsertUserStats): Promise<UserStats>;
  updateUserStats(userId: number, stats: Partial<InsertUserStats>): Promise<UserStats>;
  
  // Quest methods
  getQuests(userId: number): Promise<Quest[]>;
  getQuest(id: number): Promise<Quest | undefined>;
  createQuest(quest: InsertQuest): Promise<Quest>;
  updateQuest(id: number, quest: Partial<InsertQuest>): Promise<Quest>;
  toggleQuestCompletion(id: number): Promise<Quest>;
  
  // AI Message methods
  getMessages(userId: number): Promise<AIMessage[]>;
  createMessage(message: InsertAIMessage): Promise<AIMessage>;
  
  // Calendar Event methods
  getEvents(userId: number): Promise<CalendarEvent[]>;
  getEvent(id: number): Promise<CalendarEvent | undefined>;
  createEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateEvent(id: number, event: Partial<InsertCalendarEvent>): Promise<CalendarEvent>;
  
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
      experienceMax: 100,
      level: 1
    });
    
    return user;
  }
  
  async updateUser(id: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set(userData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }
  
  // Stats methods
  async getUserStats(userId: number): Promise<UserStats | undefined> {
    const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    return stats;
  }
  
  async createUserStats(stats: InsertUserStats): Promise<UserStats> {
    const [newStats] = await db
      .insert(userStats)
      .values(stats)
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
  
  async toggleQuestCompletion(id: number): Promise<Quest> {
    // First, get the current state
    const quest = await this.getQuest(id);
    if (!quest) throw new Error("Quest not found");
    
    // Toggle the completed state
    const [updatedQuest] = await db
      .update(quests)
      .set({ completed: !quest.completed })
      .where(eq(quests.id, id))
      .returning();
    
    // If quest was just completed, update user experience
    if (!quest.completed && updatedQuest.completed) {
      const userStats = await this.getUserStats(updatedQuest.userId);
      if (userStats) {
        // Add experience reward
        let newExperience = userStats.experienceCurrent + quest.experienceReward;
        let newLevel = userStats.level;
        let newExperienceMax = userStats.experienceMax;
        
        // Level up if necessary
        while (newExperience >= userStats.experienceMax) {
          newExperience -= userStats.experienceMax;
          newLevel += 1;
          newExperienceMax = Math.floor(userStats.experienceMax * 1.2); // 20% increase per level
        }
        
        // Update user stats
        await this.updateUserStats(updatedQuest.userId, {
          experienceCurrent: newExperience,
          level: newLevel,
          experienceMax: newExperienceMax
        });
      }
    }
    
    return updatedQuest;
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
    // First get all child folders recursively
    const childFolders = await this.getAllChildFolders(id);
    
    // Get all documents in this folder and child folders
    const folderIds = [id, ...childFolders.map(f => f.id)];
    
    // Delete all documents in these folders
    for (const folderId of folderIds) {
      const folderDocuments = await this.getDocumentsByFolder(folderId);
      for (const doc of folderDocuments) {
        await this.deleteDocument(doc.id);
      }
    }
    
    // Delete child folders (from leaf to root)
    for (const folder of childFolders.reverse()) {
      await db.delete(folders).where(eq(folders.id, folder.id));
    }
    
    // Finally delete the folder itself
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
  
  // Helper method to get all child folders recursively
  private async getAllChildFolders(folderId: number): Promise<Folder[]> {
    const directChildren = await this.getFolderChildren(folderId);
    let allChildren: Folder[] = [...directChildren];
    
    for (const child of directChildren) {
      const grandchildren = await this.getAllChildFolders(child.id);
      allChildren = [...allChildren, ...grandchildren];
    }
    
    return allChildren;
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
}

export const storage = new DatabaseStorage();
