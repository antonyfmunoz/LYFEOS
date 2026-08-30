import type { Express, Request, Response } from "express";
import { getProgressionSummary, reconcileProgressionState } from "../progression";
import { isAuthenticated } from "./middleware";

export function registerProgressionRoutes(app: Express): void {
  app.get("/api/progression", isAuthenticated, async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      const requestedDays = Number(req.query.days || 30);
      const historyDays = Number.isInteger(requestedDays) && requestedDays >= 7 && requestedDays <= 365
        ? requestedDays
        : 30;
      return res.json({ progression: await getProgressionSummary(req.session.userId!, historyDays) });
    } catch (error) {
      return res.status(500).json({ error: "Could not load progression." });
    }
  });

  app.post("/api/progression/reconcile", isAuthenticated, async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      return res.json(await reconcileProgressionState(req.session.userId!));
    } catch (error) {
      return res.status(500).json({ error: "Could not repair progression." });
    }
  });
}
