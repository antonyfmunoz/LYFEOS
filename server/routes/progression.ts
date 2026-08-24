import type { Express, Request, Response } from "express";
import { getProgressionSummary } from "../progression";
import { isAuthenticated } from "./middleware";

export function registerProgressionRoutes(app: Express): void {
  app.get("/api/progression", isAuthenticated, async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ progression: await getProgressionSummary(req.session.userId!) });
    } catch (error) {
      return res.status(500).json({ error: "Could not load progression." });
    }
  });
}
