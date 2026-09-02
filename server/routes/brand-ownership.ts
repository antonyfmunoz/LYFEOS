import type { Express, Request, Response } from "express";
import { z } from "zod";
import { brandOwnershipAvailability, lookupReviewedBrandOwnership } from "../brand-ownership";
import { isAuthenticated } from "./middleware";

const lookupSchema = z.object({ brand: z.string().trim().min(1).max(160) }).strict();

export function registerBrandOwnershipRoutes(app: Express): void {
  app.get("/api/brand-ownership/status", isAuthenticated, (_req: Request, res: Response) => {
    return res.json(brandOwnershipAvailability());
  });

  app.post("/api/brand-ownership/lookup", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid brand before checking ownership." });
    return res.json(await lookupReviewedBrandOwnership(parsed.data.brand));
  });
}
