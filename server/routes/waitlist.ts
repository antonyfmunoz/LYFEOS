import type { Express } from "express";
import { storage } from "../storage";
import { z } from "zod";

const waitlistSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  referralSource: z.string().optional(),
});

export function registerWaitlistRoutes(app: Express) {
  app.post("/api/waitlist", async (req, res) => {
    try {
      const parsed = waitlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0].message });
      }

      const entry = await storage.addWaitlistEmail(parsed.data.email, parsed.data.referralSource);
      res.json({ success: true, id: entry.id });
    } catch (error: any) {
      console.error("Waitlist signup error:", error);
      res.status(500).json({ error: "Failed to join waitlist. Please try again." });
    }
  });
}
