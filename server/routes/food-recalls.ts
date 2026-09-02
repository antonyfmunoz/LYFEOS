import type { Express, Request, Response } from "express";
import { z } from "zod";
import { FoodRecallError, foodRecallAvailability, lookupFoodRecalls } from "../food-recalls";
import { isAuthenticated } from "./middleware";

const lookupSchema = z.object({
  productName: z.string().trim().min(2).max(160),
  brand: z.string().trim().min(1).max(120).nullable().optional(),
}).strict();

function lookupFailure(error: unknown, res: Response) {
  if (error instanceof FoodRecallError) {
    return res.status(error.code === "unavailable" ? 503 : error.code === "invalid_response" ? 400 : 502).json({ error: error.message, code: error.code });
  }
  return res.status(502).json({ error: "The FDA food recall lookup failed.", code: "provider_failure" });
}

export function registerFoodRecallRoutes(app: Express): void {
  app.get("/api/food-recalls/status", isAuthenticated, (_req: Request, res: Response) => {
    return res.json(foodRecallAvailability());
  });

  app.post("/api/food-recalls/lookup", isAuthenticated, async (req: Request, res: Response) => {
    const parsed = lookupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid product name before checking FDA recall reports." });
    try {
      return res.json(await lookupFoodRecalls(parsed.data));
    } catch (error) {
      return lookupFailure(error, res);
    }
  });
}
