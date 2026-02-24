import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import { insertFolderSchema, insertDocumentSchema, quests } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

function cleanLinkedItems(type: string, id: number) {
  return db.execute(sql`
    UPDATE quests SET linked_items = (
      SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
      FROM jsonb_array_elements(linked_items) AS item
      WHERE NOT (item->>'type' = ${type} AND (item->>'id')::int = ${id})
    )
    WHERE linked_items::text LIKE ${'%"type": "' + type + '"%'}
      AND linked_items::text LIKE ${'%"id": ' + id + '%'}
  `);
}

export function registerDocumentRoutes(app: Express): void {
  app.get("/api/folders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const folders = await storage.getFolders(req.session.userId!);
      return res.json(folders);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch folders" });
    }
  });

  app.post("/api/folders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const data = insertFolderSchema.parse({ ...req.body, userId: req.session.userId! });
      const folder = await storage.createFolder(data);
      return res.status(201).json(folder);
    } catch (error) {
      return res.status(400).json({ error: "Invalid folder data" });
    }
  });

  app.patch("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getFolder(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Folder not found" });
      const folder = await storage.updateFolder(id, req.body);
      return res.json(folder);
    } catch (error) {
      return res.status(500).json({ error: "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getFolder(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Folder not found" });
      const docs = await storage.getDocumentsByFolder(id);
      for (const doc of docs) {
        await storage.updateDocument(doc.id, { folderId: null as any });
      }
      const children = await storage.getFolderChildren(id);
      for (const child of children) {
        await storage.updateFolder(child.id, { parentId: existing.parentId });
      }
      await storage.softDeleteFolder(id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  app.post("/api/folders/:id/favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getFolder(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Folder not found" });
      const folder = await storage.toggleFavoriteFolder(id);
      return res.json(folder);
    } catch (error) {
      return res.status(500).json({ error: "Failed to toggle favorite" });
    }
  });

  app.get("/api/documents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const documents = await storage.getDocuments(req.session.userId!);
      return res.json(documents);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const doc = await storage.getDocument(id);
      if (!doc || doc.userId !== req.session.userId!) return res.status(404).json({ error: "Document not found" });
      return res.json(doc);
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/documents", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const data = insertDocumentSchema.parse({ ...req.body, userId: req.session.userId! });
      const doc = await storage.createDocument(data);
      return res.status(201).json(doc);
    } catch (error) {
      return res.status(400).json({ error: "Invalid document data" });
    }
  });

  app.patch("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getDocument(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Document not found" });
      const doc = await storage.updateDocument(id, req.body);
      return res.json(doc);
    } catch (error) {
      return res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getDocument(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Document not found" });
      await storage.softDeleteDocument(id);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.post("/api/documents/:id/favorite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getDocument(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Document not found" });
      const doc = await storage.toggleFavoriteDocument(id);
      return res.json(doc);
    } catch (error) {
      return res.status(500).json({ error: "Failed to toggle favorite" });
    }
  });

  app.get("/api/deleted-items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const [deletedDocs, deletedFolders] = await Promise.all([
        storage.getDeletedDocuments(userId),
        storage.getDeletedFolders(userId),
      ]);
      return res.json({ documents: deletedDocs, folders: deletedFolders });
    } catch (error) {
      return res.status(500).json({ error: "Failed to fetch deleted items" });
    }
  });

  app.post("/api/documents/:id/restore", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getDocument(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Document not found" });
      const doc = await storage.restoreDocument(id);
      return res.json(doc);
    } catch (error) {
      return res.status(500).json({ error: "Failed to restore document" });
    }
  });

  app.post("/api/folders/:id/restore", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getFolder(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Folder not found" });
      const folder = await storage.restoreFolder(id);
      return res.json(folder);
    } catch (error) {
      return res.status(500).json({ error: "Failed to restore folder" });
    }
  });

  app.delete("/api/documents/:id/permanent", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getDocument(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Document not found" });
      await storage.permanentDeleteDocument(id);
      try { await cleanLinkedItems("document", id); } catch (e) { console.error("Failed to clean linked items", e); }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Failed to permanently delete document" });
    }
  });

  app.delete("/api/folders/:id/permanent", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const existing = await storage.getFolder(id);
      if (!existing || existing.userId !== req.session.userId!) return res.status(404).json({ error: "Folder not found" });
      await storage.permanentDeleteFolder(id);
      try { await cleanLinkedItems("folder", id); } catch (e) { console.error("Failed to clean linked items", e); }
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: "Failed to permanently delete folder" });
    }
  });
}
