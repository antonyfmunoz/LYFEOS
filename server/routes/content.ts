import type { Express, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import { logger } from "../utils";
import { isAuthenticated, isOwner, awardExperiencePoints } from "./middleware";
import {
  insertAIMessageSchema,
  insertCalendarEventSchema,
  insertMissionPageSchema,
  insertContactSchema,
  insertSpreadsheetSchema,
  insertCanvasSchema,
  insertGraphSchema,
  insertFolderSchema,
  insertDocumentSchema,
  insertTemplateSchema,
  insertMediaItemSchema,
  insertMediaAlbumSchema,
  MediaItem,
  InsertMediaItem,
} from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

export function registerContentRoutes(app: Express): void {
  // AI MESSAGE ROUTES
  app.get("/api/users/:userId/messages", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const messages = await storage.getMessages(userId);
      return res.status(200).json({ messages });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const messageData = insertAIMessageSchema.parse(req.body);
      
      // Ensure user can only post messages from their own account
      if (messageData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to post messages for this user" });
      }
      
      const message = await storage.createMessage(messageData);
      
      // If this is a user message, create an AI response using OpenAI
      if (messageData.sender === "user") {
        // Import the OpenAI client
        const { generateAIResponse } = await import('../openai');
        
        // Generate AI response
        const aiContent = await generateAIResponse(messageData.content);
        
        const aiResponse = await storage.createMessage({
          userId: messageData.userId,
          sender: "ai",
          content: aiContent
        });
        
        return res.status(201).json({ 
          userMessage: message,
          aiResponse 
        });
      }
      
      return res.status(201).json({ message });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      logger.error("Error processing message:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CALENDAR EVENT ROUTES
  app.get("/api/users/:userId/events", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const events = await storage.getEvents(userId);
      return res.status(200).json({ events });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventData = insertCalendarEventSchema.parse(req.body);
      
      // Ensure user can only create events for their own account
      if (eventData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create events for this user" });
      }
      
      const event = await storage.createEvent(eventData);
      
      // Award XP for creating a calendar event
      try {
        // Add 5 XP for creating a calendar event
        const xpResult = await awardExperiencePoints(eventData.userId, 5);
        if (xpResult.success) {
          return res.status(201).json({ 
            event,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        logger.error("Error awarding XP for event creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ event });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/events/:eventId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.eventId);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      // Get the event to check ownership
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Verify ownership
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this event" });
      }
      
      const eventUpdate = req.body;
      const updatedEvent = await storage.updateEvent(eventId, eventUpdate);
      
      return res.status(200).json({ event: updatedEvent });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // MISSION PAGE ROUTES
  app.get("/api/users/:userId/mission-pages", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const missionPages = await storage.getMissionPages(userId);
      return res.status(200).json({ missionPages });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/mission-pages/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) {
        return res.status(400).json({ error: "Invalid page ID" });
      }
      
      const page = await storage.getMissionPage(pageId);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this mission page" });
      }
      
      return res.status(200).json({ page });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/mission-pages/slug/:slug", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const slug = req.params.slug;
      
      const page = await storage.getMissionPageBySlug(slug);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this mission page" });
      }
      
      return res.status(200).json({ page });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/mission-pages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageData = insertMissionPageSchema.parse(req.body);
      
      // Ensure user can only create pages for their own account
      if (pageData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create mission pages for this user" });
      }
      
      // Check if the slug is already taken
      const existingPage = await storage.getMissionPageBySlug(pageData.slug);
      if (existingPage) {
        return res.status(400).json({ error: "A mission page with this slug already exists" });
      }
      
      const page = await storage.createMissionPage(pageData);
      
      // Award XP for creating a mission page
      try {
        // Add 15 XP for creating a mission page
        const xpResult = await awardExperiencePoints(pageData.userId, 15);
        if (xpResult.success) {
          return res.status(201).json({ 
            page,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        logger.error("Error awarding XP for mission page creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ page });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/mission-pages/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) {
        return res.status(400).json({ error: "Invalid page ID" });
      }
      
      // Get the page to check ownership
      const page = await storage.getMissionPage(pageId);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this mission page" });
      }
      
      const pageUpdate = req.body;
      
      // If trying to update the slug, check if the new slug is taken
      if (pageUpdate.slug && pageUpdate.slug !== page.slug) {
        const existingPage = await storage.getMissionPageBySlug(pageUpdate.slug);
        if (existingPage && existingPage.id !== pageId) {
          return res.status(400).json({ error: "A mission page with this slug already exists" });
        }
      }
      
      const updatedPage = await storage.updateMissionPage(pageId, pageUpdate);
      
      return res.status(200).json({ page: updatedPage });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/mission-pages/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const pageId = parseInt(req.params.id);
      if (isNaN(pageId)) {
        return res.status(400).json({ error: "Invalid page ID" });
      }
      
      // Get the page to check ownership
      const page = await storage.getMissionPage(pageId);
      if (!page) {
        return res.status(404).json({ error: "Mission page not found" });
      }
      
      // Verify ownership
      if (page.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this mission page" });
      }
      
      await storage.deleteMissionPage(pageId);
      
      return res.status(200).json({ message: "Mission page deleted successfully" });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CALENDAR EVENT ROUTES
  app.get("/api/users/:userId/calendar-events", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const events = await storage.getEvents(userId);
      return res.status(200).json({ events });
    } catch (error) {
      logger.error("Error getting calendar events:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/calendar-events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }
      
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this event" });
      }
      
      return res.status(200).json({ event });
    } catch (error) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/calendar-events", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventData = insertCalendarEventSchema.parse(req.body);
      
      if (eventData.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to create events for this user" });
      }
      
      const event = await storage.createEvent(eventData);
      
      return res.status(201).json({ event });
    } catch (error) {
      logger.error("Error creating calendar event:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid event data", details: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/calendar-events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }
      
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this event" });
      }
      
      const eventUpdate = req.body;
      const updatedEvent = await storage.updateEvent(eventId, eventUpdate);
      
      return res.status(200).json({ event: updatedEvent });
    } catch (error) {
      logger.error("Error updating calendar event:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/calendar-events/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      if (isNaN(eventId)) {
        return res.status(400).json({ error: "Invalid event ID" });
      }
      
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Calendar event not found" });
      }
      
      if (event.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this event" });
      }
      
      await storage.deleteEvent(eventId);
      
      return res.status(200).json({ message: "Calendar event deleted successfully" });
    } catch (error) {
      logger.error("Error deleting calendar event:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CONTACT ROUTES
  app.get("/api/users/:userId/contacts", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const category = req.query.category as string | undefined;
      let contacts;
      
      if (category) {
        contacts = await storage.getContactsByCategory(userId, category);
      } else {
        contacts = await storage.getContacts(userId);
      }
      
      return res.status(200).json({ contacts });
    } catch (error) {
      logger.error("Error getting contacts:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/contacts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this contact" });
      }
      
      return res.status(200).json({ contact });
    } catch (error) {
      logger.error("Error getting contact:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/contacts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Add the user ID to the contact data
      const contactData = {
        ...req.body,
        userId: req.session.userId,
      };
      
      // Validate contact data
      const validatedData = insertContactSchema.parse(contactData);
      
      // Create contact
      const contact = await storage.createContact(validatedData);
      
      // Award XP for creating a contact
      try {
        // Add 3 XP for creating a contact
        const xpResult = await awardExperiencePoints(contact.userId, 3);
        if (xpResult.success) {
          return res.status(201).json({
            contact,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            xpAwarded: 3,
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        logger.error("Error awarding XP for contact creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ contact });
    } catch (error) {
      logger.error("Error creating contact:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/contacts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      // Get the contact to check ownership
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this contact" });
      }
      
      // Update contact
      const updatedContact = await storage.updateContact(contactId, req.body);
      
      return res.status(200).json({ contact: updatedContact });
    } catch (error) {
      logger.error("Error updating contact:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/contacts/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      // Get the contact to check ownership
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this contact" });
      }
      
      // Delete contact
      await storage.deleteContact(contactId);
      
      return res.status(200).json({ message: "Contact deleted successfully" });
    } catch (error) {
      logger.error("Error deleting contact:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/contacts/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      if (isNaN(contactId)) {
        return res.status(400).json({ error: "Invalid contact ID" });
      }
      
      // Get the contact to check ownership
      const contact = await storage.getContact(contactId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Verify ownership
      if (contact.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this contact" });
      }
      
      // Toggle favorite status
      const updatedContact = await storage.toggleFavoriteContact(contactId);
      
      return res.status(200).json({ contact: updatedContact });
    } catch (error) {
      logger.error("Error toggling contact favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // SPREADSHEET ROUTES
  app.get("/api/users/:userId/spreadsheets", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const spreadsheets = await storage.getSpreadsheets(userId);
      
      return res.status(200).json({ spreadsheets });
    } catch (error) {
      logger.error("Error getting spreadsheets:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/spreadsheets/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const userIdRaw = req.session.userId;
      
      if (!userIdRaw) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const userId = Number(userIdRaw);
      const spreadsheets = await storage.getSpreadsheetsByCategory(userId, category);
      
      return res.status(200).json({ spreadsheets });
    } catch (error) {
      logger.error("Error getting spreadsheets by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/spreadsheets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this spreadsheet" });
      }
      
      return res.status(200).json({ spreadsheet });
    } catch (error) {
      logger.error("Error getting spreadsheet:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/spreadsheets", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate spreadsheet data
      const validateData = insertSpreadsheetSchema.parse({
        ...req.body,
        userId: req.session.userId
      });
      
      // Create spreadsheet
      const spreadsheet = await storage.createSpreadsheet(validateData);
      
      // Award XP for creating a spreadsheet
      try {
        // Add 8 XP for creating a spreadsheet
        const xpResult = await awardExperiencePoints(spreadsheet.userId, 8);
        if (xpResult.success) {
          return res.status(201).json({
            spreadsheet,
            stats: {
              ...xpResult.newStats,
              experience: {
                ...xpResult.newStats?.experience,
                totalXP: xpResult.totalXP,
                showLevelUp: xpResult.levelUp
              }
            },
            xpAwarded: 8,
            levelUp: xpResult.levelUp
          });
        }
      } catch (xpError) {
        logger.error("Error awarding XP for spreadsheet creation:", xpError);
        // Continue without failing the request if XP award fails
      }
      
      return res.status(201).json({ spreadsheet });
    } catch (error) {
      logger.error("Error creating spreadsheet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/spreadsheets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      // Get the spreadsheet to check ownership
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this spreadsheet" });
      }
      
      // Update spreadsheet
      const updatedSpreadsheet = await storage.updateSpreadsheet(spreadsheetId, req.body);
      
      return res.status(200).json({ spreadsheet: updatedSpreadsheet });
    } catch (error) {
      logger.error("Error updating spreadsheet:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/spreadsheets/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      // Get the spreadsheet to check ownership
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this spreadsheet" });
      }
      
      // Delete spreadsheet
      await storage.deleteSpreadsheet(spreadsheetId);
      
      return res.status(200).json({ message: "Spreadsheet deleted successfully" });
    } catch (error) {
      logger.error("Error deleting spreadsheet:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/spreadsheets/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      if (isNaN(spreadsheetId)) {
        return res.status(400).json({ error: "Invalid spreadsheet ID" });
      }
      
      // Get the spreadsheet to check ownership
      const spreadsheet = await storage.getSpreadsheet(spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Verify ownership
      if (spreadsheet.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this spreadsheet" });
      }
      
      // Toggle favorite status
      const updatedSpreadsheet = await storage.toggleFavoriteSpreadsheet(spreadsheetId);
      
      return res.status(200).json({ spreadsheet: updatedSpreadsheet });
    } catch (error) {
      logger.error("Error toggling spreadsheet favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // CANVAS ROUTES
  app.get("/api/users/:userId/canvases", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const canvases = await storage.getCanvases(userId);
      
      return res.status(200).json({ canvases });
    } catch (error) {
      logger.error("Error getting canvases:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/canvases/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const userIdRaw = req.session.userId;
      
      if (!userIdRaw) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const userId = Number(userIdRaw);
      const canvases = await storage.getCanvasesByCategory(userId, category);
      
      return res.status(200).json({ canvases });
    } catch (error) {
      logger.error("Error getting canvases by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/canvases/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this canvas" });
      }
      
      return res.status(200).json({ canvas });
    } catch (error) {
      logger.error("Error getting canvas:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/canvases", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate canvas data
      const validateData = insertCanvasSchema.parse({
        ...req.body,
        userId: req.session.userId
      });
      
      // Create canvas
      const canvas = await storage.createCanvas(validateData);
      
      return res.status(201).json({ canvas });
    } catch (error) {
      logger.error("Error creating canvas:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/canvases/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      // Get the canvas to check ownership
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this canvas" });
      }
      
      // Update canvas
      const updatedCanvas = await storage.updateCanvas(canvasId, req.body);
      
      return res.status(200).json({ canvas: updatedCanvas });
    } catch (error) {
      logger.error("Error updating canvas:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/canvases/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      // Get the canvas to check ownership
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this canvas" });
      }
      
      // Delete canvas
      await storage.deleteCanvas(canvasId);
      
      return res.status(200).json({ message: "Canvas deleted successfully" });
    } catch (error) {
      logger.error("Error deleting canvas:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/canvases/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const canvasId = parseInt(req.params.id);
      if (isNaN(canvasId)) {
        return res.status(400).json({ error: "Invalid canvas ID" });
      }
      
      // Get the canvas to check ownership
      const canvas = await storage.getCanvas(canvasId);
      if (!canvas) {
        return res.status(404).json({ error: "Canvas not found" });
      }
      
      // Verify ownership
      if (canvas.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this canvas" });
      }
      
      // Toggle favorite status
      const updatedCanvas = await storage.toggleFavoriteCanvas(canvasId);
      
      return res.status(200).json({ canvas: updatedCanvas });
    } catch (error) {
      logger.error("Error toggling canvas favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // GRAPH ROUTES
  app.get("/api/users/:userId/graphs", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const graphs = await storage.getGraphs(userId);
      
      return res.status(200).json({ graphs });
    } catch (error) {
      logger.error("Error getting graphs:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/graphs/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { category } = req.params;
      const userIdRaw = req.session.userId;
      
      if (!userIdRaw) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const userId = Number(userIdRaw);
      const graphs = await storage.getGraphsByCategory(userId, category);
      
      return res.status(200).json({ graphs });
    } catch (error) {
      logger.error("Error getting graphs by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/graphs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this graph" });
      }
      
      return res.status(200).json({ graph });
    } catch (error) {
      logger.error("Error getting graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/graphs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Validate graph data
      const validateData = insertGraphSchema.parse({
        ...req.body,
        userId: req.session.userId
      });
      
      // Create graph
      const graph = await storage.createGraph(validateData);
      
      return res.status(201).json({ graph });
    } catch (error) {
      logger.error("Error creating graph:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/graphs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      // Get the graph to check ownership
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this graph" });
      }
      
      // Update graph
      const updatedGraph = await storage.updateGraph(graphId, req.body);
      
      return res.status(200).json({ graph: updatedGraph });
    } catch (error) {
      logger.error("Error updating graph:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/graphs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      // Get the graph to check ownership
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this graph" });
      }
      
      // Delete graph
      await storage.deleteGraph(graphId);
      
      return res.status(200).json({ message: "Graph deleted successfully" });
    } catch (error) {
      logger.error("Error deleting graph:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/graphs/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const graphId = parseInt(req.params.id);
      if (isNaN(graphId)) {
        return res.status(400).json({ error: "Invalid graph ID" });
      }
      
      // Get the graph to check ownership
      const graph = await storage.getGraph(graphId);
      if (!graph) {
        return res.status(404).json({ error: "Graph not found" });
      }
      
      // Verify ownership
      if (graph.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this graph" });
      }
      
      // Toggle favorite status
      const updatedGraph = await storage.toggleFavoriteGraph(graphId);
      
      return res.status(200).json({ graph: updatedGraph });
    } catch (error) {
      logger.error("Error toggling graph favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Folder routes
  app.get("/api/users/:userId/folders", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const folders = await storage.getFolders(userId);
      
      return res.status(200).json({ folders });
    } catch (error) {
      logger.error("Error getting folders:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Get children
      const childFolders = await storage.getFolderChildren(folderId);
      const documents = await storage.getDocumentsByFolder(folderId);
      
      return res.status(200).json({ 
        folder, 
        children: {
          folders: childFolders,
          documents
        } 
      });
    } catch (error) {
      logger.error("Error getting folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/folders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderData = req.body;
      if (!folderData.name || folderData.name.trim() === '') {
        return res.status(400).json({ error: "Folder name is required" });
      }
      
      const userId = req.session.userId;
      
      // Verify parent folder exists and belongs to user if provided
      if (folderData.parentId) {
        const parentFolder = await storage.getFolder(folderData.parentId);
        if (!parentFolder) {
          return res.status(404).json({ error: "Parent folder not found" });
        }
        
        if (parentFolder.userId !== userId) {
          return res.status(403).json({ error: "Not authorized to add to this folder" });
        }
      }
      
      const newFolder = await storage.createFolder({
        ...folderData,
        userId
      });
      
      return res.status(201).json({ folder: newFolder });
    } catch (error) {
      logger.error("Error creating folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // Prevent cycles in folder structure
      if (req.body.parentId && req.body.parentId !== folder.parentId) {
        if (req.body.parentId === folderId) {
          return res.status(400).json({ error: "A folder cannot be its own parent" });
        }
        
        // Check if the new parent is a descendant of this folder
        const checkForCycle = async (currentFolderId: number, targetFolderId: number): Promise<boolean> => {
          if (currentFolderId === targetFolderId) return true;
          
          const children = await storage.getFolderChildren(currentFolderId);
          for (const child of children) {
            const hasCycle = await checkForCycle(child.id, targetFolderId);
            if (hasCycle) return true;
          }
          
          return false;
        };
        
        const wouldCreateCycle = await checkForCycle(folderId, req.body.parentId);
        if (wouldCreateCycle) {
          return res.status(400).json({ error: "This would create a cycle in the folder structure" });
        }
      }
      
      const updatedFolder = await storage.updateFolder(folderId, req.body);
      
      return res.status(200).json({ folder: updatedFolder });
    } catch (error) {
      logger.error("Error updating folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteFolder(folderId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error deleting folder:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/folders/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folderId = parseInt(req.params.id);
      if (isNaN(folderId)) {
        return res.status(400).json({ error: "Invalid folder ID" });
      }
      
      const folder = await storage.getFolder(folderId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      
      // Check ownership
      if (folder.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updatedFolder = await storage.toggleFavoriteFolder(folderId);
      
      return res.status(200).json({ folder: updatedFolder });
    } catch (error) {
      logger.error("Error toggling folder favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Document routes
  app.get("/api/users/:userId/documents", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const documents = await storage.getDocuments(userId);
      
      return res.status(200).json({ documents });
    } catch (error) {
      logger.error("Error getting documents:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      return res.status(200).json({ document });
    } catch (error) {
      logger.error("Error getting document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/documents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentData = req.body;
      if (!documentData.title || documentData.title.trim() === '') {
        return res.status(400).json({ error: "Document title is required" });
      }
      
      if (!documentData.content) {
        documentData.content = '';  // Default empty content
      }
      
      const userId = req.session.userId;
      
      // Verify folder exists and belongs to user if provided
      if (documentData.folderId) {
        const folder = await storage.getFolder(documentData.folderId);
        if (!folder) {
          return res.status(404).json({ error: "Folder not found" });
        }
        
        if (folder.userId !== userId) {
          return res.status(403).json({ error: "Not authorized to add to this folder" });
        }
      }
      
      const newDocument = await storage.createDocument({
        ...documentData,
        userId
      });
      
      return res.status(201).json({ document: newDocument });
    } catch (error) {
      logger.error("Error creating document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      // If moving to a different folder, verify folder exists and belongs to user
      if (req.body.folderId && req.body.folderId !== document.folderId) {
        const folder = await storage.getFolder(req.body.folderId);
        if (!folder) {
          return res.status(404).json({ error: "Target folder not found" });
        }
        
        if (folder.userId !== req.session.userId) {
          return res.status(403).json({ error: "Not authorized to move to this folder" });
        }
      }
      
      const updatedDocument = await storage.updateDocument(documentId, req.body);
      
      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      logger.error("Error updating document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteDocument(documentId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error deleting document:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/documents/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documentId = parseInt(req.params.id);
      if (isNaN(documentId)) {
        return res.status(400).json({ error: "Invalid document ID" });
      }
      
      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Check ownership
      if (document.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updatedDocument = await storage.toggleFavoriteDocument(documentId);
      
      return res.status(200).json({ document: updatedDocument });
    } catch (error) {
      logger.error("Error toggling document favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Template routes
  app.get("/api/users/:userId/templates", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const templates = await storage.getTemplates(userId);
      
      return res.status(200).json({ templates });
    } catch (error) {
      logger.error("Error getting templates:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/users/:userId/templates/category/:category", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      const { category } = req.params;
      if (!category) {
        return res.status(400).json({ error: "Category is required" });
      }
      
      const templates = await storage.getTemplatesByCategory(userId, category);
      
      return res.status(200).json({ templates });
    } catch (error) {
      logger.error("Error getting templates by category:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      return res.status(200).json({ template });
    } catch (error) {
      logger.error("Error getting template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/templates", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateData = insertTemplateSchema.parse(req.body);
      
      if (!templateData.title || templateData.title.trim() === '') {
        return res.status(400).json({ error: "Template title is required" });
      }
      
      if (!templateData.content) {
        templateData.content = '';  // Default empty content
      }
      
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const newTemplate = await storage.createTemplate({
        ...templateData,
        userId
      });
      
      return res.status(201).json({ template: newTemplate });
    } catch (error) {
      logger.error("Error creating template:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const templateUpdate = req.body;
      
      const updatedTemplate = await storage.updateTemplate(templateId, templateUpdate);
      
      return res.status(200).json({ template: updatedTemplate });
    } catch (error) {
      logger.error("Error updating template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/templates/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      await storage.deleteTemplate(templateId);
      
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error deleting template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/templates/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized" });
      }
      
      const updatedTemplate = await storage.toggleFavoriteTemplate(templateId);
      
      return res.status(200).json({ template: updatedTemplate });
    } catch (error) {
      logger.error("Error toggling template favorite status:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Create document from template
  app.post("/api/templates/:id/create-document", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Check ownership
      if (template.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to use this template" });
      }
      
      const { title, folderId } = req.body;
      const documentTitle = title || `${template.title} (Copy)`;
      
      // If folderId provided, verify it exists and belongs to user
      if (folderId) {
        const folder = await storage.getFolder(folderId);
        if (!folder) {
          return res.status(404).json({ error: "Target folder not found" });
        }
        
        if (folder.userId !== req.session.userId) {
          return res.status(403).json({ error: "Not authorized to add to this folder" });
        }
      }
      
      // Create new document from template
      const newDocument = await storage.createDocument({
        userId: req.session.userId,
        folderId: folderId || null,
        title: documentTitle,
        content: template.content,
        description: template.description,
        format: template.format,
        tags: template.tags,
        favorite: false
      });
      
      return res.status(201).json({ document: newDocument });
    } catch (error) {
      logger.error("Error creating document from template:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Integrations routes
  app.get("/api/users/:userId/integrations", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const integrations = await storage.getUserIntegrations(userId);
      
      // For security, don't return tokens in the response
      const safeIntegrations = integrations.map(integration => {
        const { accessToken, refreshToken, ...safeIntegration } = integration;
        return safeIntegration;
      });
      
      return res.status(200).json({ integrations: safeIntegrations });
    } catch (error) {
      logger.error("Error getting user integrations:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get a specific integration
  app.get("/api/integrations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.id);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }
      
      const integration = await storage.getIntegration(integrationId);
      if (!integration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      // Check ownership
      if (integration.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this integration" });
      }
      
      // For security, don't return tokens in the response
      const { accessToken, refreshToken, ...safeIntegration } = integration;
      
      return res.status(200).json({ integration: safeIntegration });
    } catch (error) {
      logger.error("Error getting integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a new integration
  app.post("/api/integrations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const { provider, providerName, accessToken, refreshToken, tokenExpiry, scope, status, settings } = req.body;
      
      // Basic validation
      if (!provider || !providerName) {
        return res.status(400).json({ error: "Provider and provider name are required" });
      }
      
      const newIntegration = await storage.createIntegration({
        userId,
        provider,
        providerName,
        accessToken,
        refreshToken,
        tokenExpiry,
        scope,
        status: status || "active",
        settings: settings || {}
      });
      
      // For security, don't return tokens in the response
      const { accessToken: _, refreshToken: __, ...safeIntegration } = newIntegration;
      
      return res.status(201).json({ integration: safeIntegration });
    } catch (error) {
      logger.error("Error creating integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update an integration
  app.patch("/api/integrations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.id);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }
      
      // Check if integration exists and belongs to user
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (existingIntegration.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this integration" });
      }
      
      // Update the integration
      const updatedIntegration = await storage.updateIntegration(integrationId, req.body);
      
      // For security, don't return tokens in the response
      const { accessToken, refreshToken, ...safeIntegration } = updatedIntegration;
      
      return res.status(200).json({ integration: safeIntegration });
    } catch (error) {
      logger.error("Error updating integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete an integration
  app.delete("/api/integrations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const integrationId = parseInt(req.params.id);
      if (isNaN(integrationId)) {
        return res.status(400).json({ error: "Invalid integration ID" });
      }
      
      // Check if integration exists and belongs to user
      const existingIntegration = await storage.getIntegration(integrationId);
      if (!existingIntegration) {
        return res.status(404).json({ error: "Integration not found" });
      }
      
      if (existingIntegration.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this integration" });
      }
      
      // Delete the integration
      await storage.deleteIntegration(integrationId);
      
      return res.status(200).json({ message: "Integration deleted successfully" });
    } catch (error) {
      logger.error("Error deleting integration:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Progress Tracker Routes
  app.get("/api/users/:userId/progress-trackers", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const progressTrackers = await storage.getProgressTrackersByUserId(userId);
      res.json({ progressTrackers });
    } catch (error) {
      logger.error("Failed to fetch progress trackers:", error);
      res.status(500).json({ error: "Failed to fetch progress trackers" });
    }
  });

  app.get("/api/progress-trackers/category/:category", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const category = req.params.category;
      const progressTrackers = await storage.getProgressTrackersByCategory(userId, category);
      res.json({ progressTrackers });
    } catch (error) {
      logger.error("Failed to fetch progress trackers by category:", error);
      res.status(500).json({ error: "Failed to fetch progress trackers by category" });
    }
  });

  app.get("/api/progress-trackers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const trackerId = parseInt(req.params.id);
      if (isNaN(trackerId)) {
        return res.status(400).json({ error: "Invalid tracker ID" });
      }
      
      const progressTracker = await storage.getProgressTracker(trackerId);
      if (!progressTracker) {
        return res.status(404).json({ error: "Progress tracker not found" });
      }

      if (progressTracker.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this tracker" });
      }

      res.json({ progressTracker });
    } catch (error) {
      logger.error("Failed to fetch progress tracker:", error);
      res.status(500).json({ error: "Failed to fetch progress tracker" });
    }
  });

  app.post("/api/progress-trackers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const trackerData = {
        ...req.body,
        userId
      };
      
      const progressTracker = await storage.createProgressTracker(trackerData);
      res.status(201).json({ progressTracker });
    } catch (error) {
      logger.error("Failed to create progress tracker:", error);
      res.status(500).json({ error: "Failed to create progress tracker" });
    }
  });

  app.patch("/api/progress-trackers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const trackerId = parseInt(req.params.id);
      if (isNaN(trackerId)) {
        return res.status(400).json({ error: "Invalid tracker ID" });
      }
      
      const existingTracker = await storage.getProgressTracker(trackerId);
      if (!existingTracker) {
        return res.status(404).json({ error: "Progress tracker not found" });
      }
      
      if (existingTracker.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this tracker" });
      }
      
      const updatedTracker = await storage.updateProgressTracker(trackerId, req.body);
      res.json({ progressTracker: updatedTracker });
    } catch (error) {
      logger.error("Failed to update progress tracker:", error);
      res.status(500).json({ error: "Failed to update progress tracker" });
    }
  });

  app.delete("/api/progress-trackers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const trackerId = parseInt(req.params.id);
      if (isNaN(trackerId)) {
        return res.status(400).json({ error: "Invalid tracker ID" });
      }
      
      const existingTracker = await storage.getProgressTracker(trackerId);
      if (!existingTracker) {
        return res.status(404).json({ error: "Progress tracker not found" });
      }
      
      if (existingTracker.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this tracker" });
      }
      
      await storage.deleteProgressTracker(trackerId);
      res.json({ message: "Progress tracker deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete progress tracker:", error);
      res.status(500).json({ error: "Failed to delete progress tracker" });
    }
  });

  // Media Items Routes
  app.get("/api/users/:userId/media-items", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const mediaItems = await storage.getMediaItemsByUserId(userId);
      res.json({ mediaItems });
    } catch (error) {
      logger.error("Failed to fetch media items:", error);
      res.status(500).json({ error: "Failed to fetch media items" });
    }
  });

  app.get("/api/media-items/album/:albumId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.albumId);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      // Ensure the user owns the album before fetching its items
      const album = await storage.getMediaAlbum(albumId);
      if (!album) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (album.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this album" });
      }
      
      const mediaItems = await storage.getMediaItemsByAlbum(albumId);
      res.json({ mediaItems });
    } catch (error) {
      logger.error("Failed to fetch media items by album:", error);
      res.status(500).json({ error: "Failed to fetch media items by album" });
    }
  });

  app.get("/api/media-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const mediaItem = await storage.getMediaItem(itemId);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (mediaItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this media item" });
      }
      
      res.json({ mediaItem });
    } catch (error) {
      logger.error("Failed to fetch media item:", error);
      res.status(500).json({ error: "Failed to fetch media item" });
    }
  });

  const multerStorage = multer.memoryStorage();
  const upload = multer({ 
    storage: multerStorage,
    limits: {
      fileSize: 100 * 1024 * 1024,
    },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image and video files are allowed'));
      }
    }
  });

  const inlineUpload = multer({
    storage: multerStorage,
    limits: {
      fileSize: 10 * 1024 * 1024,
    },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  app.post("/api/inline-upload", isAuthenticated, inlineUpload.single('file'), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as number;
      const file = req.file as Express.Multer.File;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const fileData = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${fileData}`;

      const itemData: InsertMediaItem = {
        userId,
        fileName: file.originalname,
        fileType: 'image',
        mimeType: file.mimetype,
        fileData: dataUrl,
        thumbnailUrl: dataUrl,
        title: file.originalname,
        size: file.size,
        isFavorite: false,
        tags: ['inline-upload'],
      };

      const mediaItem = await storage.createMediaItem(itemData);
      res.status(201).json({ 
        id: mediaItem.id, 
        url: `/api/inline-upload/${mediaItem.id}`,
        markdown: `![${file.originalname}](/api/inline-upload/${mediaItem.id})`
      });
    } catch (error) {
      logger.error("Failed to upload inline image:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  app.get("/api/inline-upload/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid ID" });
      }

      const userId = req.session.userId as number;
      const mediaItem = await storage.getMediaItem(id);
      if (!mediaItem || !mediaItem.fileData || mediaItem.userId !== userId) {
        return res.status(404).json({ error: "Image not found" });
      }

      const matches = mediaItem.fileData.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return res.status(500).json({ error: "Invalid image data" });
      }

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');

      res.set('Content-Type', mimeType);
      res.set('Cache-Control', 'private, max-age=31536000');
      res.send(buffer);
    } catch (error) {
      logger.error("Failed to serve inline image:", error);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  // Handle media item upload with multer middleware
  app.post("/api/media-items", isAuthenticated, upload.array('files'), async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      const files = req.files as Express.Multer.File[];
      const albumId = req.body.albumId ? parseInt(req.body.albumId) : undefined;
      
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      logger.debug(`Processing ${files.length} uploaded files`);
      
      // Process each uploaded file
      const mediaItems: MediaItem[] = [];
      
      for (const file of files) {
        const fileType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        
        // Convert file buffer to base64 for storage
        const fileData = file.buffer.toString('base64');
        
        // Prepare media item data
        const itemData: InsertMediaItem = {
          userId,
          albumId,
          fileName: file.originalname,
          fileType,
          mimeType: file.mimetype,
          fileData: `data:${file.mimetype};base64,${fileData}`,
          thumbnailUrl: `data:${file.mimetype};base64,${fileData}`, // Use same data for thumbnail for now
          title: file.originalname,
          size: file.size,
          isFavorite: false,
          tags: []
        };
        
        // Create the media item
        const mediaItem = await storage.createMediaItem(itemData);
        mediaItems.push(mediaItem);
      }
      
      res.status(201).json({ mediaItems });
    } catch (error) {
      logger.error("Failed to create media item:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create media item" });
    }
  });

  app.patch("/api/media-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const existingItem = await storage.getMediaItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (existingItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this media item" });
      }
      
      // Don't allow changing the userId
      const { userId, ...updateData } = req.body;
      
      const updatedItem = await storage.updateMediaItem(itemId, updateData);
      res.json({ mediaItem: updatedItem });
    } catch (error) {
      logger.error("Failed to update media item:", error);
      res.status(500).json({ error: "Failed to update media item" });
    }
  });

  app.delete("/api/media-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const existingItem = await storage.getMediaItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (existingItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this media item" });
      }
      
      await storage.deleteMediaItem(itemId);
      res.json({ message: "Media item deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete media item:", error);
      res.status(500).json({ error: "Failed to delete media item" });
    }
  });

  app.post("/api/media-items/:id/toggle-favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const itemId = parseInt(req.params.id);
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid media item ID" });
      }
      
      const existingItem = await storage.getMediaItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (existingItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this media item" });
      }
      
      const updatedItem = await storage.toggleFavoriteMediaItem(itemId);
      res.json({ mediaItem: updatedItem });
    } catch (error) {
      logger.error("Failed to toggle favorite status:", error);
      res.status(500).json({ error: "Failed to toggle favorite status" });
    }
  });

  // Media Albums Routes
  app.get("/api/users/:userId/media-albums", isOwner, async (req: Request, res: Response) => {
    try {
      const userId = parseInt(req.params.userId);
      if (isNaN(userId)) return res.status(400).json({ error: "Invalid ID" });
      const mediaAlbums = await storage.getMediaAlbumsByUserId(userId);
      res.json({ mediaAlbums });
    } catch (error) {
      logger.error("Failed to fetch media albums:", error);
      res.status(500).json({ error: "Failed to fetch media albums" });
    }
  });

  app.get("/api/media-albums/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const mediaAlbum = await storage.getMediaAlbum(albumId);
      if (!mediaAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (mediaAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to access this album" });
      }
      
      res.json({ mediaAlbum });
    } catch (error) {
      logger.error("Failed to fetch media album:", error);
      res.status(500).json({ error: "Failed to fetch media album" });
    }
  });

  app.post("/api/media-albums", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Ensure userId is a number
      const userId = req.session.userId as number;
      
      const albumData = {
        ...req.body,
        userId
      };
      
      // Validate with schema
      const validatedData = insertMediaAlbumSchema.parse(albumData);
      
      const mediaAlbum = await storage.createMediaAlbum(validatedData);
      res.status(201).json({ mediaAlbum });
    } catch (error) {
      logger.error("Failed to create media album:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create media album" });
    }
  });

  app.patch("/api/media-albums/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const existingAlbum = await storage.getMediaAlbum(albumId);
      if (!existingAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (existingAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this album" });
      }
      
      // Don't allow changing the userId
      const { userId, ...updateData } = req.body;
      
      const updatedAlbum = await storage.updateMediaAlbum(albumId, updateData);
      res.json({ mediaAlbum: updatedAlbum });
    } catch (error) {
      logger.error("Failed to update media album:", error);
      res.status(500).json({ error: "Failed to update media album" });
    }
  });

  app.delete("/api/media-albums/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const existingAlbum = await storage.getMediaAlbum(albumId);
      if (!existingAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (existingAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to delete this album" });
      }
      
      await storage.deleteMediaAlbum(albumId);
      res.json({ message: "Album deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete media album:", error);
      res.status(500).json({ error: "Failed to delete media album" });
    }
  });

  app.post("/api/media-albums/:id/set-cover", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const albumId = parseInt(req.params.id);
      if (isNaN(albumId)) {
        return res.status(400).json({ error: "Invalid album ID" });
      }
      
      const existingAlbum = await storage.getMediaAlbum(albumId);
      if (!existingAlbum) {
        return res.status(404).json({ error: "Album not found" });
      }
      
      if (existingAlbum.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to update this album" });
      }
      
      const { mediaItemId } = req.body;
      if (!mediaItemId) {
        return res.status(400).json({ error: "Media item ID is required" });
      }
      
      // Verify the media item exists and belongs to the user
      const mediaItem = await storage.getMediaItem(mediaItemId);
      if (!mediaItem) {
        return res.status(404).json({ error: "Media item not found" });
      }
      
      if (mediaItem.userId !== req.session.userId) {
        return res.status(403).json({ error: "Not authorized to use this media item" });
      }
      
      const updatedAlbum = await storage.setAlbumCoverImage(albumId, mediaItemId);
      res.json({ mediaAlbum: updatedAlbum });
    } catch (error) {
      logger.error("Failed to set album cover image:", error);
      res.status(500).json({ error: "Failed to set album cover image" });
    }
  });

  // Widget States & Layouts
  app.get("/api/widget-states", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const states = await storage.getWidgetStates(userId);
      return res.json(states);
    } catch (error) {
      logger.error("Error fetching widget states:", error);
      return res.status(500).json({ error: "Failed to fetch widget states" });
    }
  });

  app.put("/api/widget-states", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ widgetId: z.string().min(1), isOpen: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "widgetId (string) and isOpen (boolean) required" });
      }
      const states = await storage.setWidgetState(userId, parsed.data.widgetId, parsed.data.isOpen);
      return res.json(states);
    } catch (error) {
      logger.error("Error updating widget state:", error);
      return res.status(500).json({ error: "Failed to update widget state" });
    }
  });

  app.get("/api/widget-layouts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const layouts = await storage.getWidgetLayouts(userId);
      return res.json(layouts);
    } catch (error) {
      logger.error("Error fetching widget layouts:", error);
      return res.status(500).json({ error: "Failed to fetch widget layouts" });
    }
  });

  app.put("/api/widget-layouts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ page: z.string().min(1), order: z.array(z.string()) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "page (string) and order (string[]) required" });
      }
      const layouts = await storage.setWidgetLayout(userId, parsed.data.page, parsed.data.order);
      return res.json(layouts);
    } catch (error) {
      logger.error("Error updating widget layout:", error);
      return res.status(500).json({ error: "Failed to update widget layout" });
    }
  });

  // Dismissed Knowledge
  app.get("/api/dismissed-knowledge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const entries = await storage.getDismissedKnowledge(userId);
      return res.json(entries);
    } catch (error) {
      logger.error("Error fetching dismissed knowledge:", error);
      return res.status(500).json({ error: "Failed to fetch dismissed knowledge" });
    }
  });

  app.post("/api/dismissed-knowledge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ author: z.string().min(1), sourceMaterial: z.string().nullable().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "author is required" });
      }
      const existing = await storage.getDismissedKnowledge(userId);
      const alreadyDismissed = existing.find(e => e.author === parsed.data.author && e.sourceMaterial === (parsed.data.sourceMaterial ?? null));
      if (alreadyDismissed) {
        return res.json(alreadyDismissed);
      }
      const entry = await storage.dismissKnowledgeEntry({ userId, author: parsed.data.author, sourceMaterial: parsed.data.sourceMaterial ?? null });
      return res.json(entry);
    } catch (error) {
      logger.error("Error dismissing knowledge entry:", error);
      return res.status(500).json({ error: "Failed to dismiss knowledge entry" });
    }
  });

  app.delete("/api/dismissed-knowledge/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
      await storage.undismissKnowledgeEntry(id, userId);
      return res.json({ success: true });
    } catch (error) {
      logger.error("Error undismissing knowledge entry:", error);
      return res.status(500).json({ error: "Failed to undismiss knowledge entry" });
    }
  });

  // User Categories CRUD
  app.get("/api/user-categories", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const categories = await storage.getUserCategories(userId);
      res.json(categories);
    } catch (error) {
      logger.error("Error fetching user categories:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user-categories", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { value, label, description } = req.body;
      if (!value || !label) {
        return res.status(400).json({ error: "Value and label are required" });
      }
      const existing = await storage.getUserCategories(userId);
      if (existing.some(c => c.value === value)) {
        return res.status(409).json({ error: "Category already exists" });
      }
      const category = await storage.createUserCategory({
        userId,
        value: value.toLowerCase().replace(/\s+/g, '_'),
        label,
        description: description || null,
      });
      res.json(category);
    } catch (error) {
      logger.error("Error creating user category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/user-categories/generate-description", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { categoryName } = req.body;
      if (!categoryName) {
        return res.status(400).json({ error: "Category name is required" });
      }
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: `Generate a short, one-sentence description (under 15 words) for a personal productivity mission category called "${categoryName}". The description should explain what types of tasks or goals belong in this category. Be concise and direct. Return ONLY the description, no quotes or punctuation at the start/end.`
          }
        ],
      });
      const description = message.content[0].type === "text" ? message.content[0].text.trim() : "";
      res.json({ description });
    } catch (error) {
      logger.error("Error generating category description:", error);
      res.status(500).json({ error: "Failed to generate description" });
    }
  });

  app.patch("/api/user-categories/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      const { value, label } = req.body;
      if (!value || !label) {
        return res.status(400).json({ error: "Value and label are required" });
      }
      const existingCategories = await storage.getUserCategories(userId);
      const oldCategory = existingCategories.find(c => c.id === id);
      const duplicate = existingCategories.find(c => c.id !== id && c.value === value);
      if (duplicate) {
        return res.status(409).json({ error: "A category with this name already exists" });
      }
      const result = await storage.updateUserCategory(id, userId, { value, label });
      if (!result) {
        return res.status(404).json({ error: "Category not found" });
      }
      if (oldCategory && oldCategory.value !== value) {
        await storage.updateQuestCategoryForUser(userId, oldCategory.value, value);
      }
      res.json(result);
    } catch (error) {
      logger.error("Error updating user category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/user-categories/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      await storage.deleteUserCategory(id, userId);
      res.json({ success: true });
    } catch (error) {
      logger.error("Error deleting user category:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
