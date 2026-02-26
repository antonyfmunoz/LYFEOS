import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import { insertFolderSchema, insertDocumentSchema, quests } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";
import multer from "multer";

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
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
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

  const vaultUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const allowed = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
        'application/pdf',
        'text/plain', 'text/markdown', 'text/csv',
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  });

  function getFileType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'pdf';
    return 'document';
  }

  app.post("/api/documents/upload", isAuthenticated, vaultUpload.array('files', 20), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const folderId = req.body.folderId ? parseInt(req.body.folderId) : null;
      if (folderId) {
        const folder = await storage.getFolder(folderId);
        if (!folder || folder.userId !== userId) {
          return res.status(404).json({ error: "Folder not found" });
        }
      }

      const results = [];
      for (const file of files) {
        const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const fileType = getFileType(file.mimetype);
        const title = file.originalname.replace(/\.[^/.]+$/, '');

        const doc = await storage.createDocument({
          userId,
          folderId: folderId as any,
          title,
          content: '',
          format: fileType,
          fileType,
          fileData: base64Data,
          fileSize: file.size,
          mimeType: file.mimetype,
        });

        results.push({
          id: doc.id,
          title: doc.title,
          fileType: doc.fileType,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
        });
      }

      return res.status(201).json({ uploaded: results });
    } catch (error) {
      console.error("File upload error:", error);
      return res.status(500).json({ error: "Failed to upload files" });
    }
  });

  app.get("/api/documents/:id/file", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const doc = await storage.getDocument(id);
      if (!doc || !doc.fileData) return res.status(404).json({ error: "File not found" });

      const matches = doc.fileData.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return res.status(500).json({ error: "Invalid file data" });

      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');

      res.set('Content-Type', mimeType);
      res.set('Content-Length', buffer.length.toString());
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    } catch (error) {
      return res.status(500).json({ error: "Failed to serve file" });
    }
  });
}
