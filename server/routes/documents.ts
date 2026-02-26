import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "./middleware";
import { insertFolderSchema, insertDocumentSchema, quests } from "@shared/schema";
import { db } from "../db";
import { sql } from "drizzle-orm";
import multer from "multer";
import xml2js from "xml2js";
import TurndownService from "turndown";
import * as cheerio from "cheerio";
import AdmZip from "adm-zip";
import path from "path";

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

  const obsidianUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      const allowed = [
        'text/markdown', 'text/plain', 'text/x-markdown',
        'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'application/pdf',
      ];
      const ext = path.extname(file.originalname).toLowerCase();
      if (allowed.includes(file.mimetype) || ['.md', '.zip', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(ext)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
  });

  function parseYamlFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };

    const rawYaml = match[1];
    const body = match[2];
    const frontmatter: Record<string, any> = {};

    for (const line of rawYaml.split('\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      let value: any = line.slice(colonIdx + 1).trim();
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      }
      frontmatter[key] = value;
    }

    return { frontmatter, body };
  }

  function generateFrontmatter(doc: any): string {
    const lines: string[] = ['---'];
    lines.push(`title: "${doc.title.replace(/"/g, '\\"')}"`);
    if (doc.tags && doc.tags.length > 0) {
      lines.push(`tags: [${doc.tags.map((t: string) => `"${t}"`).join(', ')}]`);
    }
    if (doc.createdAt) {
      lines.push(`created: ${new Date(doc.createdAt).toISOString()}`);
    }
    if (doc.updatedAt) {
      lines.push(`updated: ${new Date(doc.updatedAt).toISOString()}`);
    }
    if (doc.favorite) {
      lines.push(`favorite: true`);
    }
    if (doc.description) {
      lines.push(`description: "${doc.description.replace(/"/g, '\\"')}"`);
    }
    lines.push('---');
    return lines.join('\n');
  }

  app.post("/api/documents/import/obsidian", isAuthenticated, obsidianUpload.array('files', 100), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "No files uploaded" });
      }

      const targetFolderId = req.body.folderId ? parseInt(req.body.folderId) : null;
      let imported = 0;
      let updated = 0;
      let skipped = 0;

      interface FileEntry {
        relativePath: string;
        buffer: Buffer;
        isMarkdown: boolean;
        isImage: boolean;
      }

      const entries: FileEntry[] = [];

      for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.zip') {
          const zip = new AdmZip(file.buffer);
          const zipEntries = zip.getEntries();
          for (const entry of zipEntries) {
            if (entry.isDirectory) continue;
            const entryExt = path.extname(entry.entryName).toLowerCase();
            if (entryExt === '.md' || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(entryExt)) {
              entries.push({
                relativePath: entry.entryName,
                buffer: entry.getData(),
                isMarkdown: entryExt === '.md',
                isImage: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(entryExt),
              });
            }
          }
        } else {
          entries.push({
            relativePath: file.originalname,
            buffer: file.buffer,
            isMarkdown: ['.md'].includes(ext),
            isImage: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf'].includes(ext),
          });
        }
      }

      const folderMap = new Map<string, number>();

      async function ensureFolderHierarchy(dirPath: string): Promise<number | null> {
        if (!dirPath || dirPath === '.' || dirPath === '/') return targetFolderId;

        if (folderMap.has(dirPath)) return folderMap.get(dirPath)!;

        const parentDir = path.dirname(dirPath);
        const folderName = path.basename(dirPath);
        const parentId = await ensureFolderHierarchy(parentDir);

        const externalId = `obsidian:${dirPath}`;
        let folder = await storage.getFolderByExternalId(userId, "obsidian", externalId);

        if (!folder) {
          folder = await storage.createFolder({
            userId,
            name: folderName,
            parentId: parentId as any,
            source: "obsidian",
            externalId: externalId,
          });
        }

        folderMap.set(dirPath, folder.id);
        return folder.id;
      }

      for (const entry of entries) {
        try {
          const dirPath = path.dirname(entry.relativePath);
          const folderId = await ensureFolderHierarchy(dirPath);
          const externalId = `obsidian:${entry.relativePath}`;

          if (entry.isMarkdown) {
            const content = entry.buffer.toString('utf-8');
            const { frontmatter, body } = parseYamlFrontmatter(content);
            const title = frontmatter.title || path.basename(entry.relativePath, '.md');
            const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];

            const existingDoc = await storage.getDocumentByExternalId(userId, "obsidian", externalId);

            if (existingDoc) {
              await storage.updateDocument(existingDoc.id, {
                title,
                content: body,
                tags: tags.length > 0 ? tags : undefined,
                lastSyncedAt: new Date(),
              });
              updated++;
            } else {
              await storage.createDocument({
                userId,
                folderId: folderId as any,
                title,
                content: body,
                format: "markdown",
                tags: tags.length > 0 ? tags : undefined,
                source: "obsidian",
                externalId: externalId,
                favorite: frontmatter.favorite === true,
              });
              imported++;
            }
          } else if (entry.isImage) {
            const ext = path.extname(entry.relativePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
              '.pdf': 'application/pdf',
            };
            const mimeType = mimeMap[ext] || 'application/octet-stream';
            const fileType = mimeType === 'application/pdf' ? 'pdf' : 'image';
            const base64Data = `data:${mimeType};base64,${entry.buffer.toString('base64')}`;
            const title = path.basename(entry.relativePath, ext);

            const existingDoc = await storage.getDocumentByExternalId(userId, "obsidian", externalId);

            if (existingDoc) {
              await storage.updateDocument(existingDoc.id, {
                title,
                fileData: base64Data,
                fileSize: entry.buffer.length,
                mimeType,
                lastSyncedAt: new Date(),
              });
              updated++;
            } else {
              await storage.createDocument({
                userId,
                folderId: folderId as any,
                title,
                content: '',
                format: fileType,
                fileType,
                fileData: base64Data,
                fileSize: entry.buffer.length,
                mimeType,
                source: "obsidian",
                externalId: externalId,
              });
              imported++;
            }
          } else {
            skipped++;
          }
        } catch (err) {
          console.error(`Error importing obsidian entry ${entry.relativePath}:`, err);
          skipped++;
        }
      }

      return res.json({ imported, updated, skipped, total: entries.length });
    } catch (error) {
      console.error("Obsidian import error:", error);
      return res.status(500).json({ error: "Failed to import Obsidian vault" });
    }
  });

  app.get("/api/documents/export/obsidian", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const allDocs = await storage.getDocuments(userId);
      const allFolders = await storage.getFolders(userId);

      const docs = allDocs.filter(d => !d.deletedAt);
      const activeFolders = allFolders.filter(f => !f.deletedAt);

      const folderPathMap = new Map<number, string>();
      function getFolderPath(folderId: number): string {
        if (folderPathMap.has(folderId)) return folderPathMap.get(folderId)!;
        const folder = activeFolders.find(f => f.id === folderId);
        if (!folder) return '';
        const parentPath = folder.parentId ? getFolderPath(folder.parentId) : '';
        const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
        folderPathMap.set(folderId, fullPath);
        return fullPath;
      }

      const zip = new AdmZip();

      for (const doc of docs) {
        const folderPath = doc.folderId ? getFolderPath(doc.folderId) : '';

        if (doc.fileType && doc.fileType !== 'document' && doc.fileData) {
          const matches = doc.fileData.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            const buffer = Buffer.from(matches[2], 'base64');
            const extMap: Record<string, string> = {
              'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
              'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/pdf': '.pdf',
            };
            const ext = extMap[matches[1]] || '';
            const fileName = `${doc.title}${ext}`;
            const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
            zip.addFile(filePath, buffer);
          }
        } else {
          const frontmatter = generateFrontmatter(doc);
          const content = `${frontmatter}\n\n${doc.content || ''}`;
          const fileName = `${doc.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;
          const filePath = folderPath ? `${folderPath}/${fileName}` : fileName;
          zip.addFile(filePath, Buffer.from(content, 'utf-8'));
        }
      }

      const zipBuffer = zip.toBuffer();
      res.set('Content-Type', 'application/zip');
      res.set('Content-Disposition', 'attachment; filename="obsidian-vault-export.zip"');
      res.set('Content-Length', zipBuffer.length.toString());
      return res.send(zipBuffer);
    } catch (error) {
      console.error("Obsidian export error:", error);
      return res.status(500).json({ error: "Failed to export Obsidian vault" });
    }
  });

  app.get("/api/documents/export/obsidian/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const doc = await storage.getDocument(id);
      if (!doc || doc.userId !== userId) return res.status(404).json({ error: "Document not found" });

      if (doc.fileType && doc.fileType !== 'document' && doc.fileData) {
        const matches = doc.fileData.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) return res.status(500).json({ error: "Invalid file data" });
        const buffer = Buffer.from(matches[2], 'base64');
        const extMap: Record<string, string> = {
          'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
          'image/webp': '.webp', 'image/svg+xml': '.svg', 'application/pdf': '.pdf',
        };
        const ext = extMap[matches[1]] || '';
        res.set('Content-Type', matches[1]);
        res.set('Content-Disposition', `attachment; filename="${doc.title}${ext}"`);
        return res.send(buffer);
      }

      const frontmatter = generateFrontmatter(doc);
      const content = `${frontmatter}\n\n${doc.content || ''}`;
      const fileName = `${doc.title.replace(/[/\\?%*:|"<>]/g, '_')}.md`;

      res.set('Content-Type', 'text/markdown; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(content);
    } catch (error) {
      console.error("Obsidian single export error:", error);
      return res.status(500).json({ error: "Failed to export document" });
    }
  });
}
