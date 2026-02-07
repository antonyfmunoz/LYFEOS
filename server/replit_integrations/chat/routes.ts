import type { Express, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { storage } from "../../storage";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.session?.userId) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
};

function buildSystemPrompt(user: any, stats: any, profile: any, missions: any[]): string {
  const activeMissions = missions.filter(m => !m.completed && !m.deletedAt);
  const completedMissions = missions.filter(m => m.completed && !m.deletedAt);
  const terminatedMissions = missions.filter(m => m.deletedAt);

  const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `You are NOVA, the user's personal AI assistant inside LYFEOS — a gamified life operating system. You are intelligent, supportive, direct, and motivating. You speak with a futuristic but warm tone, like a trusted advisor in a sci-fi world. Keep responses concise and actionable.

TODAY: ${todayStr} (PST timezone)

=== USER PROFILE ===
Name: ${user?.displayName || user?.username || 'Commander'}
Level: ${stats?.level || 1}
XP: ${stats?.experience || 0}
Energy Points: ${stats?.energyPoints ?? 'N/A'}
Health Points: ${stats?.healthPoints ?? 'N/A'}
Time Tokens: ${stats?.timeTokens ?? 'N/A'}
Attention Tokens: ${stats?.attentionTokens ?? 'N/A'}
Streak: ${stats?.streakDays || 0} days

=== ARCHETYPE & IDENTITY ===
Primary Archetype: ${profile?.archetypePrimary || 'Not set'}
Secondary Archetype: ${profile?.archetypeSecondary || 'Not set'}
Shadow Archetype: ${profile?.archetypeShadow || 'Not set'}
Life Stage: ${profile?.lifeStage || 'Not set'}
Core Values: ${JSON.stringify(profile?.primaryValues || [])}
Desired Emotion: ${profile?.desiredEmotion || 'Not set'}
Career/Vocation: ${profile?.careerVocation || 'Not set'}
Primary Craft: ${profile?.primaryCraft || 'Not set'}

=== VISION & GOALS ===
90-Day Vision: ${profile?.vision90Day || 'Not set'}
18-Month Vision: ${profile?.vision18Month || 'Not set'}
5-Year Vision: ${profile?.vision5Year || 'Not set'}
10-Year Legacy: ${profile?.vision10YearLegacy || 'Not set'}
Current Goals: ${JSON.stringify(profile?.currentGoals || [])}

=== PERSONALITY ===
Core Belief: ${profile?.coreBelief || 'Not set'}
Limiting Belief: ${profile?.limitingBelief || 'Not set'}
Empowering Belief: ${profile?.empoweringBelief || 'Not set'}
Strengths: ${JSON.stringify(profile?.strengths || [])}
Weaknesses: ${JSON.stringify(profile?.weaknesses || [])}

=== CHARACTER AFFIRMATION ===
${profile?.characterAffirmation || 'Not generated yet'}

=== SYSTEMS & RITUALS ===
Ideal Day: ${profile?.idealDay || 'Not set'}
Locked Habit: ${profile?.lockedHabit || 'Not set'}
Morning Rituals: ${JSON.stringify(profile?.morningRituals || [])}
Evening Rituals: ${JSON.stringify(profile?.eveningRituals || [])}
Grounding Ritual: ${profile?.groundingRitual || 'Not set'}

=== ACTIVE MISSIONS (${activeMissions.length}) ===
${activeMissions.map(m => `- [ID:${m.id}] "${m.title}" | ${m.category || 'general'} | Difficulty: ${m.difficulty || 'D'} | XP: ${m.experienceReward} | Start: ${m.startDate || 'none'} | Due: ${m.dueDate || 'none'} | Desc: ${m.description || 'none'}`).join('\n') || 'No active missions'}

=== COMPLETED MISSIONS (${completedMissions.length}) ===
${completedMissions.slice(0, 10).map(m => `- [ID:${m.id}] "${m.title}" | Completed: ${m.completedAt ? new Date(m.completedAt).toLocaleDateString() : 'unknown'}`).join('\n') || 'No completed missions'}

=== TERMINATED MISSIONS (${terminatedMissions.length}) ===
${terminatedMissions.slice(0, 5).map(m => `- [ID:${m.id}] "${m.title}"`).join('\n') || 'No terminated missions'}

=== CAPABILITIES ===
You can take actions for the user using tools. When the user asks you to do something (create, delete, complete, update missions, etc.), use the appropriate tool. After performing an action, confirm what you did clearly.

When creating missions, use sensible defaults:
- category: "general" unless specified
- difficulty: "D" (easiest) unless specified. Ranks are S, A, B, C, D.
- energyCost: 1, attentionCost: 0, timeCost: 0 unless specified
- experienceReward: calculate based on difficulty (D=10, C=25, B=50, A=100, S=200)
- startDate: today's date in YYYY-MM-DD format unless specified

Guidelines:
- Address the user by name when appropriate
- Reference their archetype, goals, and current missions to personalize advice
- Be encouraging but honest — push them toward growth
- When they ask about their data, reference the actual numbers above
- If they want to make changes, use the tools — don't just tell them what to do`;
}

const tools: Anthropic.Messages.Tool[] = [
  {
    name: "terminate_mission",
    description: "Soft-delete a mission (move to Terminated). Use when user says 'delete', 'remove', 'terminate', or 'get rid of' a mission. The mission can be restored within 24 hours.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_id: { type: "number", description: "The ID of the mission to terminate" }
      },
      required: ["mission_id"]
    }
  },
  {
    name: "complete_mission",
    description: "Mark a mission as completed, awarding XP to the user. Use when user says 'complete', 'finish', 'done with' a mission.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_id: { type: "number", description: "The ID of the mission to complete" }
      },
      required: ["mission_id"]
    }
  },
  {
    name: "create_mission",
    description: "Create a new mission/quest for the user. Use when user wants to add a new task, mission, or quest.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The mission title" },
        description: { type: "string", description: "A brief description of the mission" },
        category: { type: "string", description: "Category: 'general', 'setup', 'rituals', 'life pillars', 'todo'", default: "general" },
        difficulty: { type: "string", description: "Difficulty rank: 'S', 'A', 'B', 'C', 'D' (D is easiest)", default: "D" },
        startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
        endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
        dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
        energyCost: { type: "number", description: "Energy cost (default 1)", default: 1 },
        attentionCost: { type: "number", description: "Attention cost (default 0)", default: 0 },
        timeCost: { type: "number", description: "Time cost (default 0)", default: 0 },
        experienceReward: { type: "number", description: "XP reward (default based on difficulty)" }
      },
      required: ["title", "description"]
    }
  },
  {
    name: "update_mission",
    description: "Update an existing mission's details. Use when user wants to change title, description, dates, difficulty, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_id: { type: "number", description: "The ID of the mission to update" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        category: { type: "string", description: "New category" },
        difficulty: { type: "string", description: "New difficulty rank" },
        startDate: { type: "string", description: "New start date (YYYY-MM-DD)" },
        endDate: { type: "string", description: "New end date (YYYY-MM-DD)" },
        dueDate: { type: "string", description: "New due date (YYYY-MM-DD)" },
        energyCost: { type: "number", description: "New energy cost" },
        attentionCost: { type: "number", description: "New attention cost" },
        timeCost: { type: "number", description: "New time cost" },
        experienceReward: { type: "number", description: "New XP reward" }
      },
      required: ["mission_id"]
    }
  },
  {
    name: "restore_mission",
    description: "Restore a terminated/deleted mission back to active. Use when user wants to undo a deletion or bring back a terminated mission.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_id: { type: "number", description: "The ID of the mission to restore" }
      },
      required: ["mission_id"]
    }
  },
  {
    name: "search_missions",
    description: "Search through user's missions by keyword. Use when user asks about a specific mission but doesn't know the ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search keyword to match against mission titles and descriptions" }
      },
      required: ["query"]
    }
  },
  {
    name: "update_profile",
    description: "Update user profile fields like affirmation, goals, rituals, etc. Use when user wants to change their profile data.",
    input_schema: {
      type: "object" as const,
      properties: {
        characterAffirmation: { type: "string", description: "New character affirmation text" },
        vision90Day: { type: "string", description: "90-day vision" },
        vision18Month: { type: "string", description: "18-month vision" },
        vision5Year: { type: "string", description: "5-year vision" },
        vision10YearLegacy: { type: "string", description: "10-year legacy vision" },
        idealDay: { type: "string", description: "Description of ideal day" },
        lockedHabit: { type: "string", description: "Most important locked habit" },
        groundingRitual: { type: "string", description: "Grounding ritual" },
        coreBelief: { type: "string", description: "Core belief" },
        primaryCraft: { type: "string", description: "Primary craft/skill" }
      },
      required: []
    }
  },
  {
    name: "create_calendar_event",
    description: "Create a calendar event for the user. Use when user wants to schedule something.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event description" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
        startTime: { type: "string", description: "Start time in HH:MM format (24h)" },
        duration: { type: "string", description: "Duration like '1h', '30m', '2h'" },
        category: { type: "string", description: "Category: 'work', 'personal', or 'health'" }
      },
      required: ["title", "description", "date", "startTime", "duration", "category"]
    }
  }
];

async function executeTool(toolName: string, input: any, userId: number): Promise<string> {
  try {
    switch (toolName) {
      case "terminate_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        await storage.deleteQuest(input.mission_id);
        return JSON.stringify({ success: true, message: `Mission "${quest.title}" has been terminated (moved to Terminated). It can be restored within 24 hours.` });
      }

      case "complete_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        const result = await storage.toggleQuestCompletion(input.mission_id);
        return JSON.stringify({ 
          success: true, 
          message: `Mission "${quest.title}" has been completed! +${quest.experienceReward} XP awarded.`,
          levelUp: result.levelUp,
          xpAwarded: quest.experienceReward
        });
      }

      case "create_mission": {
        const difficultyXP: Record<string, number> = { S: 200, A: 100, B: 50, C: 25, D: 10 };
        const difficulty = input.difficulty || "D";
        const xpReward = input.experienceReward || difficultyXP[difficulty] || 10;
        
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        
        const quest = await storage.createQuest({
          userId,
          title: input.title,
          description: input.description || "",
          category: input.category || "general",
          difficulty,
          energyCost: input.energyCost ?? 1,
          attentionCost: input.attentionCost ?? 0,
          timeCost: input.timeCost ?? 0,
          experienceReward: xpReward,
          startDate: input.startDate || today,
          endDate: input.endDate || null,
          dueDate: input.dueDate || null,
          completed: false,
        });
        return JSON.stringify({ success: true, message: `Mission "${quest.title}" created with ${xpReward} XP reward (Difficulty: ${difficulty}).`, missionId: quest.id });
      }

      case "update_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        
        const updateData: any = {};
        if (input.title) updateData.title = input.title;
        if (input.description) updateData.description = input.description;
        if (input.category) updateData.category = input.category;
        if (input.difficulty) updateData.difficulty = input.difficulty;
        if (input.startDate) updateData.startDate = input.startDate;
        if (input.endDate) updateData.endDate = input.endDate;
        if (input.dueDate) updateData.dueDate = input.dueDate;
        if (input.energyCost !== undefined) updateData.energyCost = input.energyCost;
        if (input.attentionCost !== undefined) updateData.attentionCost = input.attentionCost;
        if (input.timeCost !== undefined) updateData.timeCost = input.timeCost;
        if (input.experienceReward !== undefined) updateData.experienceReward = input.experienceReward;
        
        const updated = await storage.updateQuest(input.mission_id, updateData);
        return JSON.stringify({ success: true, message: `Mission "${updated.title}" has been updated.` });
      }

      case "restore_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        const restored = await storage.restoreQuest(input.mission_id);
        return JSON.stringify({ success: true, message: `Mission "${restored.title}" has been restored from Terminated.` });
      }

      case "search_missions": {
        const allQuests = await storage.getQuests(userId);
        const archivedQuests = await storage.getArchivedQuests(userId);
        const allMissions = [...allQuests, ...archivedQuests];
        const query = input.query.toLowerCase();
        const matches = allMissions.filter(m => 
          m.title.toLowerCase().includes(query) || 
          (m.description && m.description.toLowerCase().includes(query))
        );
        return JSON.stringify({ 
          results: matches.map(m => ({
            id: m.id,
            title: m.title,
            description: m.description,
            completed: m.completed,
            terminated: !!m.deletedAt,
            difficulty: m.difficulty,
            category: m.category,
            startDate: m.startDate,
            xp: m.experienceReward
          })),
          count: matches.length
        });
      }

      case "update_profile": {
        const { ...profileUpdates } = input;
        await storage.updateUserProfile(userId, profileUpdates);
        const fields = Object.keys(profileUpdates).join(", ");
        return JSON.stringify({ success: true, message: `Profile updated: ${fields}` });
      }

      case "create_calendar_event": {
        const event = await storage.createEvent({
          userId,
          title: input.title,
          description: input.description || "",
          date: input.date,
          startTime: input.startTime,
          duration: input.duration,
          category: input.category || "personal",
        });
        return JSON.stringify({ success: true, message: `Calendar event "${event.title}" created for ${input.date} at ${input.startTime}.` });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error: any) {
    console.error(`Tool execution error (${toolName}):`, error);
    return JSON.stringify({ error: error.message || "Tool execution failed" });
  }
}

export function registerChatRoutes(app: Express): void {
  app.get("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const conversations = await chatStorage.getConversationsByUser(userId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      const conversation = await chatStorage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post("/api/conversations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { title } = req.body;
      const conversation = await chatStorage.createConversation(userId, title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete("/api/conversations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId!;
      const conversation = await chatStorage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  app.post("/api/conversations/:id/messages", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = req.session.userId!;
      const { content } = req.body;

      const conversation = await chatStorage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      await chatStorage.createMessage(conversationId, "user", content);

      const dbMessages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages: Anthropic.Messages.MessageParam[] = dbMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const [user, stats, profile, missions] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
        storage.getUserProfile(userId),
        storage.getQuests(userId),
      ]);
      const archivedMissions = await storage.getArchivedQuests(userId);
      const allMissions = [...missions, ...archivedMissions];

      const systemPrompt = buildSystemPrompt(user, stats, profile, allMissions);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let toolActionsPerformed: string[] = [];

      let currentMessages = [...chatMessages];
      let maxIterations = 5;
      let fullResponse = "";

      while (maxIterations > 0) {
        maxIterations--;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPrompt,
          messages: currentMessages,
          tools,
        });

        if (response.stop_reason === "tool_use") {
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
          );

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            const result = await executeTool(toolUse.name, toolUse.input, userId);
            toolActionsPerformed.push(result);
            
            res.write(`data: ${JSON.stringify({ toolAction: JSON.parse(result) })}\n\n`);

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result,
            });
          }

          currentMessages = [
            ...currentMessages,
            { role: "assistant", content: response.content },
            { role: "user", content: toolResults },
          ];

          continue;
        }

        const textBlocks = response.content.filter(
          (block): block is Anthropic.Messages.TextBlock => block.type === "text"
        );
        fullResponse = textBlocks.map(b => b.text).join("");

        const chunks = fullResponse.match(/.{1,50}/g) || [fullResponse];
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        break;
      }

      await chatStorage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true, toolActions: toolActionsPerformed.map(a => JSON.parse(a)) })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  });
}
