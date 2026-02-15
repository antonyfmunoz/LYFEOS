import type { Express, Request, Response } from "express";
import { isAuthenticated, awardExperiencePoints } from "./middleware";
import { storage } from "../storage";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const PROMPT_CATEGORIES = [
  "gratitude",
  "growth",
  "reflection",
  "vision",
  "challenge",
  "emotions",
  "relationships",
  "mindfulness",
] as const;

export function registerJournalRoutes(app: Express) {
  app.get("/api/journal-entries", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const entries = await storage.getJournalEntries(userId);
      res.json({ entries });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch journal entries" });
    }
  });

  app.get("/api/journal-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const entry = await storage.getJournalEntry(parseInt(req.params.id));
      if (!entry || entry.userId !== userId) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.json({ entry });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch journal entry" });
    }
  });

  app.post("/api/journal-entries", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const wordCount = (req.body.content || "").trim().split(/\s+/).filter(Boolean).length;
      const xpAwarded = Math.min(Math.max(Math.floor(wordCount / 10) * 5, 10), 100);

      const entry = await storage.createJournalEntry({
        userId,
        title: req.body.title || null,
        content: req.body.content,
        mood: req.body.mood || null,
        tags: req.body.tags || [],
        promptCategory: req.body.promptCategory || null,
        aiPrompt: req.body.aiPrompt || null,
        aiReflection: null,
        wordCount,
        xpAwarded,
      });

      await awardExperiencePoints(userId, xpAwarded);

      res.json({ entry, xpAwarded });
    } catch (error) {
      res.status(500).json({ error: "Failed to create journal entry" });
    }
  });

  app.patch("/api/journal-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const existing = await storage.getJournalEntry(parseInt(req.params.id));
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Entry not found" });
      }

      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.content !== undefined) {
        updates.content = req.body.content;
        updates.wordCount = req.body.content.trim().split(/\s+/).filter(Boolean).length;
      }
      if (req.body.mood !== undefined) updates.mood = req.body.mood;
      if (req.body.tags !== undefined) updates.tags = req.body.tags;
      if (req.body.aiReflection !== undefined) updates.aiReflection = req.body.aiReflection;

      const entry = await storage.updateJournalEntry(existing.id, updates);
      res.json({ entry });
    } catch (error) {
      res.status(500).json({ error: "Failed to update journal entry" });
    }
  });

  app.delete("/api/journal-entries/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const existing = await storage.getJournalEntry(parseInt(req.params.id));
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ error: "Entry not found" });
      }
      await storage.deleteJournalEntry(existing.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete journal entry" });
    }
  });

  app.post("/api/journal-prompts", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { category } = req.body;

      const [user, stats, profile, dailyLogs, missions] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
        storage.getUserProfile(userId),
        storage.getUserDailyLogs(userId),
        storage.getQuests(userId),
      ]);

      const recentLogs = (dailyLogs || [])
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

      const activeMissions = (missions || []).filter(m => !m.completed && !m.deletedAt).slice(0, 10);
      const recentCompletions = (missions || []).filter(m => m.completed && !m.deletedAt).slice(0, 5);

      const contextParts: string[] = [];
      if (user?.displayName) contextParts.push(`Player name: ${user.displayName}`);
      if (stats) {
        contextParts.push(`Level: ${stats.level}, Streak: ${stats.streakDays} days`);
        contextParts.push(`Energy: ${stats.energyPointsCurrent}/${stats.energyPointsMax}, Health: ${stats.healthPointsCurrent}/${stats.healthPointsMax}`);
      }

      if (recentLogs.length > 0) {
        const moods = recentLogs.map(l => {
          const avg = ((l.mentalState || 5) + (l.physicalState || 5) + (l.emotionalState || 5)) / 3;
          return `${l.date}: ${avg.toFixed(1)}/10`;
        });
        contextParts.push(`Recent mood trends: ${moods.join(', ')}`);

        const latestLog = recentLogs[0];
        if (latestLog.gratitude) contextParts.push(`Recent gratitude: "${latestLog.gratitude}"`);
        if (latestLog.wentWell) contextParts.push(`Recent win: "${latestLog.wentWell}"`);
        if (latestLog.couldBeBetter) contextParts.push(`Recent challenge: "${latestLog.couldBeBetter}"`);
      }

      if (activeMissions.length > 0) {
        contextParts.push(`Active missions: ${activeMissions.map(m => m.title).join(', ')}`);
      }
      if (recentCompletions.length > 0) {
        contextParts.push(`Recently completed: ${recentCompletions.map(m => m.title).join(', ')}`);
      }
      if (profile?.futureSelfSummary) contextParts.push(`Future self vision: ${profile.futureSelfSummary}`);

      const categoryInstruction = category && PROMPT_CATEGORIES.includes(category)
        ? `Focus on the "${category}" theme.`
        : `Choose from these themes: ${PROMPT_CATEGORIES.join(', ')}.`;

      const systemPrompt = `You are NOVA, the AI companion in LYFEOS - a gamified life management system. Generate a single thought-provoking journal prompt that encourages deep self-reflection.

${categoryInstruction}

Player context:
${contextParts.join('\n')}

Rules:
- Generate exactly ONE prompt question (2-3 sentences max)
- Make it personal based on their data (reference their missions, mood patterns, wins, challenges when relevant)
- Encourage vulnerability and honest self-examination
- Vary between forward-looking, retrospective, and present-moment prompts
- Use second person ("you")
- Do NOT use emojis or markdown formatting
- Return ONLY the prompt text, nothing else`;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: "Generate a journal prompt for me." }],
        system: systemPrompt,
      });

      const promptText = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("")
        .trim();

      const selectedCategory = category || PROMPT_CATEGORIES[Math.floor(Math.random() * PROMPT_CATEGORIES.length)];

      res.json({ prompt: promptText, category: selectedCategory });
    } catch (error) {
      console.error("Journal prompt generation error:", error);
      const fallbackPrompts = [
        "What moment today made you feel most alive, and what does that tell you about what truly matters to you?",
        "If you could give your past self from one week ago a piece of advice, what would it be and why?",
        "What is one thing you've been avoiding, and what would change if you finally faced it?",
        "Describe a recent challenge you overcame. What strength did you discover in yourself?",
        "What would your ideal day look like six months from now? What small step could you take tomorrow to move toward it?",
      ];
      res.json({
        prompt: fallbackPrompts[Math.floor(Math.random() * fallbackPrompts.length)],
        category: "reflection",
        fallback: true,
      });
    }
  });

  app.post("/api/journal-entries/:id/reflect", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const entry = await storage.getJournalEntry(parseInt(req.params.id));
      if (!entry || entry.userId !== userId) {
        return res.status(404).json({ error: "Entry not found" });
      }

      if (!entry.content || entry.content.trim().length < 20) {
        return res.status(400).json({ error: "Entry too short for meaningful reflection" });
      }

      const [user, stats] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
      ]);

      const systemPrompt = `You are NOVA, the AI companion in LYFEOS. Provide a brief, insightful reflection on the user's journal entry. 

Player: ${user?.displayName || 'Commander'}, Level ${stats?.level || 1}

Rules:
- 2-4 sentences maximum
- Acknowledge what they've shared with genuine empathy
- Offer one meaningful insight or pattern you notice
- Optionally suggest a gentle next step or reframe
- Be warm but not syrupy — speak like a wise friend
- Do NOT use emojis or markdown
- Do NOT repeat what they wrote back to them`;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: `My journal entry:\n\n${entry.content}` }],
        system: systemPrompt,
      });

      const reflection = response.content
        .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
        .map(b => b.text)
        .join("")
        .trim();

      await storage.updateJournalEntry(entry.id, { aiReflection: reflection });

      res.json({ reflection });
    } catch (error) {
      console.error("Journal reflection error:", error);
      res.status(500).json({ error: "Failed to generate reflection" });
    }
  });
}
