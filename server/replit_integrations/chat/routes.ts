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

const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_MS = 60 * 1000;
const aiRequestCounts = new Map<number, { count: number; windowStart: number }>();

function checkAIRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = aiRequestCounts.get(userId);
  if (!entry || now - entry.windowStart > AI_RATE_WINDOW_MS) {
    aiRequestCounts.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= AI_RATE_LIMIT) {
    return false;
  }
  entry.count++;
  return true;
}

function getRateLimitRemaining(userId: number): number {
  const now = Date.now();
  const entry = aiRequestCounts.get(userId);
  if (!entry || now - entry.windowStart > AI_RATE_WINDOW_MS) return AI_RATE_LIMIT;
  return Math.max(0, AI_RATE_LIMIT - entry.count);
}

const aiRateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const userId = req.session?.userId;
  if (!userId) return next();
  if (!checkAIRateLimit(userId)) {
    const remaining = getRateLimitRemaining(userId);
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    return res.status(429).json({ error: "Slow down — you've hit the AI request limit. Try again in a minute." });
  }
  res.setHeader("X-RateLimit-Remaining", getRateLimitRemaining(userId).toString());
  next();
};

function buildSystemPrompt(user: any, stats: any, profile: any, missions: any[], conversationHistory?: { role: string; content: string; conversationTitle?: string; createdAt: Date }[]): string {
  const activeMissions = missions.filter(m => !m.completed && !m.deletedAt);
  const completedMissions = missions.filter(m => m.completed && !m.deletedAt);
  const terminatedMissions = missions.filter(m => m.deletedAt);

  const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `You are NOVA, the user's personal AI assistant. You are intelligent, supportive, direct, and motivating. You speak with a futuristic but warm tone, like a trusted advisor in a sci-fi world. Keep responses concise and actionable.

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
- category: ALWAYS choose the most fitting category from: 'work', 'health', 'fitness', 'finance', 'learning', 'creative', 'social', 'personal', 'mindset', 'career', 'nutrition', 'recovery', 'planning', 'spiritual', 'household'. Never use 'general'. Default to 'personal' if unclear.
- difficulty: "D" (easiest) unless specified. Ranks are S, A, B, C, D.
- energyCost: 1, attentionCost: 0, timeCost: 0 unless specified
- experienceReward: calculate based on difficulty (D=10, C=25, B=50, A=100, S=200)
- startDate: today's date in YYYY-MM-DD format unless specified

Guidelines:
- NEVER use emojis in your responses. Use plain text only — no emoji characters whatsoever.
- Address the user by name when appropriate
- Reference their archetype, goals, and current missions to personalize advice
- Be encouraging but honest — push them toward growth
- When they ask about their data, reference the actual numbers above
- If they want to make changes, use the tools — don't just tell them what to do

=== PREVIOUS CONVERSATION HISTORY ===
${conversationHistory && conversationHistory.length > 0 
  ? `You have had previous conversations with this user. Here is a summary of past interactions so you maintain continuity and remember context from earlier chats:\n${conversationHistory.slice(-100).map(m => `[${m.conversationTitle || 'Chat'}] ${m.role === 'user' ? 'User' : 'You'}: ${m.content.substring(0, 500)}${m.content.length > 500 ? '...' : ''}`).join('\n')}`
  : 'No previous conversation history yet.'}`;
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
        category: { type: "string", description: "Category - ALWAYS choose the most fitting one: 'work', 'health', 'fitness', 'finance', 'learning', 'creative', 'social', 'personal', 'mindset', 'career', 'nutrition', 'recovery', 'planning', 'spiritual', 'household'. Never use 'general'." },
        difficulty: { type: "string", description: "Difficulty rank: 'S', 'A', 'B', 'C', 'D' (D is easiest)", default: "D" },
        startDate: { type: "string", description: "Start date in YYYY-MM-DD format" },
        endDate: { type: "string", description: "End date in YYYY-MM-DD format" },
        dueDate: { type: "string", description: "Due date in YYYY-MM-DD format" },
        energyCost: { type: "number", description: "Energy cost (default 1)", default: 1 },
        attentionCost: { type: "number", description: "Attention cost (default 0)", default: 0 },
        timeCost: { type: "number", description: "Time cost (default 0)", default: 0 },
        experienceReward: { type: "number", description: "XP reward (default based on difficulty)" }
      },
      required: ["title", "description", "category"]
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
  },
  {
    name: "toggle_widget",
    description: "Open or close a dashboard widget. Use when user wants to show/hide/expand/collapse a widget on the dashboard.",
    input_schema: {
      type: "object" as const,
      properties: {
        widget_id: { type: "string", description: "Widget ID: 'dashboard.data-entry-log', 'dashboard.research-log', 'dashboard.reflection-log', 'dashboard.intention-setter', 'dashboard.energy-log'" },
        open: { type: "boolean", description: "true to open/expand, false to close/collapse" }
      },
      required: ["widget_id", "open"]
    }
  },
  {
    name: "navigate_to_page",
    description: "Navigate the user to a specific page in the app. Use when user asks to go to, open, or show a page.",
    input_schema: {
      type: "object" as const,
      properties: {
        route: { type: "string", description: "Route path: '/dashboard', '/missions', '/ai', '/chronilog', '/profile', '/journal-log', '/chronilog/timeline', '/knowledge-vault', '/goals-archive'" }
      },
      required: ["route"]
    }
  },
  {
    name: "play_affirmation",
    description: "Play the user's character affirmation aloud using text-to-speech. Use when user says 'play my affirmation', 'read my affirmation', 'say my affirmation'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "generate_affirmation",
    description: "Generate a new AI-powered character affirmation for the user based on their profile data. Use when user says 'create a new affirmation', 'generate affirmation', 'make me a new affirmation'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "update_daily_log",
    description: "Update fields in the user's daily log for today. Use when user wants to log their mental/physical/emotional state, gratitude, thoughts, goals, reflections, wake/sleep time, research notes, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        mentalState: { type: "number", description: "Mental state rating 1-10" },
        physicalState: { type: "number", description: "Physical state rating 1-10" },
        emotionalState: { type: "number", description: "Emotional state rating 1-10" },
        wakeTime: { type: "string", description: "Wake time in HH:MM format" },
        sleepTime: { type: "string", description: "Sleep time in HH:MM format" },
        gratitude: { type: "string", description: "What user is grateful for" },
        tomorrowGoals: { type: "string", description: "Goals for tomorrow" },
        annualGoals: { type: "string", description: "Annual goals reminder" },
        thoughts: { type: "string", description: "Free-form thoughts/intentions" },
        contentConsumed: { type: "string", description: "Information consumed today" },
        todoIdeas: { type: "string", description: "Ideas for future todos" },
        sourceAuthor: { type: "string", description: "Source author name" },
        sourceMaterial: { type: "string", description: "Source material reference" },
        researchNote: { type: "string", description: "Research note" },
        revisionNote: { type: "string", description: "Revision and summary note" },
        executionNote: { type: "string", description: "Execution note" },
        wentWell: { type: "string", description: "What went well today" },
        couldBeBetter: { type: "string", description: "What could be better" },
        learned: { type: "string", description: "What was learned today" },
        todayPrimaryMission: { type: "string", description: "Today's primary mission/focus" }
      },
      required: []
    }
  },
  {
    name: "toggle_theme",
    description: "Toggle between dark and light theme. Use when user says 'switch theme', 'dark mode', 'light mode', 'toggle theme'.",
    input_schema: {
      type: "object" as const,
      properties: {
        dark: { type: "boolean", description: "true for dark theme, false for light theme" }
      },
      required: ["dark"]
    }
  },
  {
    name: "start_mission_timer",
    description: "Start a timer for a specific mission. Use when user says 'start timer for [mission]', 'begin working on [mission]', 'start [mission]'.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_id: { type: "number", description: "The ID of the mission to start timer for" }
      },
      required: ["mission_id"]
    }
  },
  {
    name: "pause_timer",
    description: "Pause the currently running mission timer. Use when user says 'pause timer', 'pause'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "resume_timer",
    description: "Resume a paused mission timer. Use when user says 'resume timer', 'resume', 'continue timer', 'unpause'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "end_timer",
    description: "End/stop the currently running mission timer. Use when user says 'stop timer', 'end timer', 'stop'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "stop_affirmation",
    description: "Stop the currently playing affirmation audio. Use when user says 'stop affirmation', 'stop talking', 'stop playing', 'silence', 'shut up', 'be quiet', 'stop the voice'.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
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
        return JSON.stringify({ success: true, action: "terminate_mission", message: `Mission "${quest.title}" has been terminated (moved to Terminated). It can be restored within 24 hours.` });
      }

      case "complete_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        const result = await storage.toggleQuestCompletion(input.mission_id);
        return JSON.stringify({ 
          success: true, 
          action: "complete_mission",
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
          category: input.category || "personal",
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
        return JSON.stringify({ success: true, action: "create_mission", message: `Mission "${quest.title}" created with ${xpReward} XP reward (Difficulty: ${difficulty}).`, missionId: quest.id });
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
        return JSON.stringify({ success: true, action: "update_mission", message: `Mission "${updated.title}" has been updated.` });
      }

      case "restore_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        const restored = await storage.restoreQuest(input.mission_id);
        return JSON.stringify({ success: true, action: "restore_mission", message: `Mission "${restored.title}" has been restored from Terminated.` });
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
        return JSON.stringify({ success: true, action: "update_profile", message: `Profile updated: ${fields}` });
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
        return JSON.stringify({ success: true, action: "create_calendar_event", message: `Calendar event "${event.title}" created for ${input.date} at ${input.startTime}.` });
      }

      case "toggle_widget": {
        await storage.setWidgetState(userId, input.widget_id, input.open);
        return JSON.stringify({ 
          success: true, 
          action: "toggle_widget",
          widgetId: input.widget_id, 
          open: input.open,
          message: `Widget ${input.open ? 'opened' : 'closed'}.` 
        });
      }

      case "navigate_to_page": {
        return JSON.stringify({ 
          success: true, 
          action: "navigate",
          route: input.route,
          message: `Navigating to ${input.route}.` 
        });
      }

      case "play_affirmation": {
        const profile = await storage.getUserProfile(userId);
        const affirmation = profile?.characterAffirmation;
        if (!affirmation) {
          return JSON.stringify({ success: false, action: "play_affirmation", message: "No affirmation set yet. Generate one first." });
        }
        return JSON.stringify({ 
          success: true, 
          action: "play_affirmation",
          affirmationText: affirmation,
          message: "Playing your affirmation now." 
        });
      }

      case "generate_affirmation": {
        const userProfile = await storage.getUserProfile(userId);
        const user = await storage.getUser(userId);
        try {
          const affirmationResponse = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 512,
            messages: [{ role: "user", content: "Generate a powerful, personalized character affirmation." }],
            system: `Generate a deeply personal character affirmation for this person:
Name: ${user?.displayName || user?.username || 'Commander'}
Archetype: ${userProfile?.archetypePrimary || 'Warrior'}/${userProfile?.archetypeSecondary || 'Architect'}
Core Motivation: ${userProfile?.coreMotivation || 'growth, discipline'}
5-Year Vision: ${userProfile?.vision5Year || 'mastery'}
Primary Craft: ${userProfile?.primaryCraft || 'creation'}

Write a 2-3 paragraph affirmation in second person ("You are..."). Make it powerful, specific to their data, and motivating. No emojis. No title or label.`
          });
          const textBlock = affirmationResponse.content.find(b => b.type === "text");
          const affirmation = textBlock?.text || "You are a force of nature.";
          await storage.upsertUserProfile(userId, { characterAffirmation: affirmation } as any);
          return JSON.stringify({ success: true, action: "generate_affirmation", affirmationText: affirmation, message: "New affirmation generated and saved." });
        } catch (err: any) {
          return JSON.stringify({ success: false, message: "Failed to generate affirmation: " + (err.message || "Unknown error") });
        }
      }

      case "update_daily_log": {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        const { ...logUpdates } = input;
        const todayDate = new Date(today + 'T00:00:00');
        const todayLog = await storage.getUserDailyLogByDate(userId, todayDate);
        if (todayLog) {
          await storage.updateUserDailyLog(todayLog.id, logUpdates);
        } else {
          await storage.createUserDailyLog({ userId, date: today, ...logUpdates });
        }
        const fields = Object.keys(logUpdates).join(", ");
        return JSON.stringify({ success: true, action: "update_daily_log", message: `Daily log updated: ${fields}` });
      }

      case "toggle_theme": {
        const stats = await storage.getUserStats(userId);
        if (stats) {
          await storage.updateUserStats(userId, { darkThemeEnabled: input.dark });
        }
        return JSON.stringify({ 
          success: true, 
          action: "toggle_theme",
          dark: input.dark,
          message: `Theme switched to ${input.dark ? 'dark' : 'light'} mode.` 
        });
      }

      case "start_mission_timer": {
        return JSON.stringify({ 
          success: true, 
          action: "start_mission_timer",
          missionId: input.mission_id,
          message: `Starting timer for mission.` 
        });
      }

      case "pause_timer": {
        return JSON.stringify({ success: true, action: "pause_timer", message: "Timer paused." });
      }

      case "resume_timer": {
        return JSON.stringify({ success: true, action: "resume_timer", message: "Timer resumed." });
      }

      case "end_timer": {
        return JSON.stringify({ success: true, action: "end_timer", message: "Timer ended." });
      }

      case "stop_affirmation": {
        return JSON.stringify({ success: true, action: "stop_affirmation", message: "Affirmation playback stopped." });
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

  app.post("/api/conversations/:id/messages", isAuthenticated, aiRateLimiter, async (req: Request, res: Response) => {
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

      const [user, stats, profile, missions, allConversationMessages] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
        storage.getUserProfile(userId),
        storage.getQuests(userId),
        chatStorage.getAllMessagesByUser(userId),
      ]);
      const archivedMissions = await storage.getArchivedQuests(userId);
      const allMissions = [...missions, ...archivedMissions];

      const otherConversationMessages = allConversationMessages.filter(m => m.conversationId !== conversationId);

      const systemPrompt = buildSystemPrompt(user, stats, profile, allMissions, otherConversationMessages);

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

  app.post("/api/stat-tips", isAuthenticated, aiRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { statType } = req.body;

      const validTypes = ["experience", "energy", "health", "time", "attention", "efficiency", "streak"];
      if (!validTypes.includes(statType)) {
        return res.status(400).json({ error: "Invalid stat type" });
      }

      const user = await storage.getUser(userId);
      const stats = await storage.getUserStats(userId);
      const missions = await storage.getQuests(userId);

      if (!user || !stats) {
        return res.status(404).json({ error: "User data not found" });
      }

      const activeMissions = missions.filter((m: any) => !m.completed && !m.deletedAt);
      const completedMissions = missions.filter((m: any) => m.completed && !m.deletedAt);

      const statContextMap: Record<string, string> = {
        experience: `XP: ${stats.experienceCurrent}/${stats.experienceMax}, Level: ${stats.level}, Active missions: ${activeMissions.length}, Completed missions: ${completedMissions.length}`,
        energy: `Energy: ${stats.energyPointsCurrent}/${stats.energyPointsMax}, Level: ${stats.level}, Active missions: ${activeMissions.length}`,
        health: `Health: ${stats.healthPointsCurrent}/${stats.healthPointsMax}, Level: ${stats.level}, Streak: ${stats.streakDays} days`,
        time: `Time Tokens: ${stats.timeTokensCurrent}/${stats.timeTokensMax}, Active missions: ${activeMissions.length}, Level: ${stats.level}`,
        attention: `Attention Tokens: ${stats.attentionTokensCurrent}/${stats.attentionTokensMax}, Active missions: ${activeMissions.length}, Level: ${stats.level}`,
        efficiency: `Efficiency Score: ${stats.efficiencyScore || 0}%, Active missions: ${activeMissions.length}, Completed: ${completedMissions.length}, Streak: ${stats.streakDays} days`,
        streak: `Current Streak: ${stats.streakDays} days, Level: ${stats.level}, Completed missions: ${completedMissions.length}`,
      };

      const statLabelMap: Record<string, string> = {
        experience: "Experience Points (XP) and Leveling",
        energy: "Energy Tokens",
        health: "Health Points",
        time: "Time Tokens",
        attention: "Attention Tokens",
        efficiency: "System Efficiency",
        streak: "Streak Tracking",
      };

      const prompt = `You are NOVA, the user's personal AI life coach. The user "${user.displayName || user.username}" is viewing their ${statLabelMap[statType]} stats page.

Their current data: ${statContextMap[statType]}

Provide 3 concise, personalized, actionable tips to help them improve this stat. Each tip should be 1-2 sentences max. Base your advice on their actual numbers. Be direct, motivating, and specific. No emojis. Format each tip on its own line, numbered 1-3.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === "text");
      const tip = textBlock ? textBlock.text : "Keep pushing forward. Every small action compounds into massive progress.";

      res.json({ tip, statType });
    } catch (error) {
      console.error("Error generating stat tip:", error);
      res.status(500).json({ error: "Failed to generate tip" });
    }
  });

  app.post("/api/stat-tips/all", isAuthenticated, aiRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;

      const user = await storage.getUser(userId);
      const stats = await storage.getUserStats(userId);
      const missions = await storage.getQuests(userId);

      if (!user || !stats) {
        return res.status(404).json({ error: "User data not found" });
      }

      const activeMissions = missions.filter((m: any) => !m.completed && !m.deletedAt);
      const completedMissions = missions.filter((m: any) => m.completed && !m.deletedAt);

      const totalEnergyCost = activeMissions.reduce((sum: number, m: any) => sum + (m.energyCost || 0), 0);
      const totalTimeCost = activeMissions.reduce((sum: number, m: any) => sum + (m.timeCost || 0), 0);
      const totalAttentionCost = activeMissions.reduce((sum: number, m: any) => sum + (m.attentionCost || 0), 0);

      const allContext = `User: ${user.displayName || user.username}
Level: ${stats.level}, Total XP: ${stats.experienceCurrent}/${stats.experienceMax}
Energy: ${stats.energyPointsCurrent}/${stats.energyPointsMax}, Health: ${stats.healthPointsCurrent}/${stats.healthPointsMax}
Time Tokens: ${stats.timeTokensCurrent}/${stats.timeTokensMax}, Attention Tokens: ${stats.attentionTokensCurrent}/${stats.attentionTokensMax}
Efficiency: ${stats.efficiencyScore || 0}%, Streak: ${stats.streakDays} days
Active missions: ${activeMissions.length}, Completed missions: ${completedMissions.length}
Total energy allocated to missions: ${totalEnergyCost}, Total time allocated: ${totalTimeCost}, Total attention allocated: ${totalAttentionCost}`;

      const prompt = `You are NOVA, the user's personal AI life coach.

User data:
${allContext}

Generate personalized tips for ALL 7 stat categories. For each category, provide exactly 3 concise, actionable tips (1-2 sentences each). Base advice on their actual numbers. Be direct, motivating, specific. No emojis.

Format your response as JSON with this exact structure:
{"experience":["tip1","tip2","tip3"],"energy":["tip1","tip2","tip3"],"health":["tip1","tip2","tip3"],"time":["tip1","tip2","tip3"],"attention":["tip1","tip2","tip3"],"efficiency":["tip1","tip2","tip3"],"streak":["tip1","tip2","tip3"]}

Return ONLY the JSON, no other text.`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === "text");
      const rawText = textBlock ? textBlock.text.trim() : "{}";

      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const tips = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        res.json({ tips });
      } catch {
        res.json({ tips: {} });
      }
    } catch (error) {
      console.error("Error generating all stat tips:", error);
      res.status(500).json({ error: "Failed to generate tips" });
    }
  });

  app.get("/api/computed-stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;

      const stats = await storage.getUserStats(userId);
      const missions = await storage.getQuests(userId);
      const events = await storage.getEvents(userId);

      if (!stats) {
        return res.status(404).json({ error: "Stats not found" });
      }

      const activeMissions = missions.filter((m: any) => !m.completed && !m.deletedAt);
      const completedMissions = missions.filter((m: any) => m.completed && !m.deletedAt);
      const totalMissions = missions.filter((m: any) => !m.deletedAt);

      const totalEnergyCost = activeMissions.reduce((sum: number, m: any) => sum + (m.energyCost || 0), 0);
      const totalTimeCost = activeMissions.reduce((sum: number, m: any) => sum + (m.timeCost || 0), 0);
      const totalAttentionCost = activeMissions.reduce((sum: number, m: any) => sum + (m.attentionCost || 0), 0);
      const totalXpFromCompleted = completedMissions.reduce((sum: number, m: any) => sum + (m.experienceReward || 0), 0);

      const completionRate = totalMissions.length > 0 ? Math.round((completedMissions.length / totalMissions.length) * 100) : 0;

      const difficultyBreakdown: Record<string, number> = {};
      totalMissions.forEach((m: any) => {
        const d = m.difficulty || "D";
        difficultyBreakdown[d] = (difficultyBreakdown[d] || 0) + 1;
      });

      const categoryBreakdown: Record<string, { total: number; completed: number }> = {};
      totalMissions.forEach((m: any) => {
        const cat = m.category || "general";
        if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { total: 0, completed: 0 };
        categoryBreakdown[cat].total++;
        if (m.completed) categoryBreakdown[cat].completed++;
      });

      const eventCategoryHours: Record<string, number> = {};
      (events || []).forEach((e: any) => {
        const cat = e.category || "personal";
        const dur = parseFloat(e.duration) || 1;
        eventCategoryHours[cat] = (eventCategoryHours[cat] || 0) + dur;
      });

      res.json({
        activeMissions: activeMissions.length,
        completedMissions: completedMissions.length,
        totalMissions: totalMissions.length,
        completionRate,
        totalEnergyCost,
        totalTimeCost,
        totalAttentionCost,
        totalXpFromCompleted,
        difficultyBreakdown,
        categoryBreakdown,
        eventCategoryHours,
        energyAllocated: totalEnergyCost,
        energyRemaining: (stats.energyPointsMax || 10) - (stats.energyPointsCurrent || 0),
        timeAllocated: totalTimeCost,
        timeRemaining: stats.timeTokensCurrent || 0,
        attentionAllocated: totalAttentionCost,
        attentionRemaining: stats.attentionTokensCurrent || 0,
      });
    } catch (error) {
      console.error("Error computing stats:", error);
      res.status(500).json({ error: "Failed to compute stats" });
    }
  });

  app.post("/api/voice-command", isAuthenticated, aiRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { transcript, conversationId } = req.body;

      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ error: "Transcript is required" });
      }

      const [user, stats, missions, profile] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
        storage.getQuests(userId),
        storage.getUserProfile(userId),
      ]);

      const activeMissions = (missions || []).filter((m: any) => !m.completed && !m.deletedAt);
      const archivedMissions = await storage.getArchivedQuests(userId);

      let recentMessages: { role: string; content: string }[] = [];
      let dbConversationId = conversationId ? parseInt(conversationId) : null;
      
      if (dbConversationId) {
        const messages = await chatStorage.getMessagesByConversation(dbConversationId);
        recentMessages = messages.slice(-10).map(m => ({
          role: m.role,
          content: m.content,
        }));
      }

      if (dbConversationId) {
        await chatStorage.createMessage(dbConversationId, "user", `[Voice] ${transcript}`);
      }

      const voiceSystemPrompt = buildSystemPrompt(user, stats, profile, [...(missions || []), ...archivedMissions]);

      const apiMessages: any[] = [
        ...recentMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user" as const, content: `[Voice Command] ${transcript}` }
      ];

      let currentMessages = apiMessages;
      let maxIterations = 3;
      let fullResponse = "";
      let toolActions: any[] = [];

      while (maxIterations > 0) {
        maxIterations--;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 512,
          system: voiceSystemPrompt + "\n\nIMPORTANT: This is a VOICE command. Keep your text responses very brief (1-2 sentences). The response will be spoken aloud. Do not use markdown formatting, emojis, or special characters. Be concise and natural-sounding.",
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
            toolActions.push(JSON.parse(result));

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result,
            });
          }

          currentMessages = [
            ...currentMessages,
            { role: "assistant" as const, content: response.content },
            { role: "user" as const, content: toolResults },
          ];

          continue;
        }

        const textBlocks = response.content.filter(
          (block): block is Anthropic.Messages.TextBlock => block.type === "text"
        );
        fullResponse = textBlocks.map(b => b.text).join("");
        break;
      }

      if (dbConversationId && fullResponse) {
        await chatStorage.createMessage(dbConversationId, "assistant", fullResponse);
      }

      res.json({ 
        speech: fullResponse || "Done.", 
        toolActions, 
        understood: true 
      });
    } catch (error) {
      console.error("Error processing voice command:", error);
      res.status(500).json({ error: "Failed to process voice command" });
    }
  });

  app.post("/api/mission-stat-suggest", isAuthenticated, aiRateLimiter, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { title, description, difficulty } = req.body;

      const stats = await storage.getUserStats(userId);
      if (!stats) {
        return res.status(404).json({ error: "Stats not found" });
      }

      const prompt = `You are NOVA, the user's personal AI assistant. A user is creating a mission and needs realistic stat cost suggestions.

Mission details:
- Title: "${title}"
- Description: "${description || "No description provided"}"
- Difficulty: ${difficulty || "D"} (S=hardest, A=hard, B=medium, C=easy, D=easiest)

User's current stats:
- Energy: ${stats.energyPointsCurrent}/${stats.energyPointsMax}
- Time Tokens: ${stats.timeTokensCurrent}/${stats.timeTokensMax}
- Attention Tokens: ${stats.attentionTokensCurrent}/${stats.attentionTokensMax}
- Level: ${stats.level}

Based on the mission title, description, and difficulty, suggest realistic stat costs and XP reward. Consider:
- D difficulty: 1 energy, 0-1 time, 0-1 attention, 5-15 XP
- C difficulty: 1-2 energy, 1 time, 1 attention, 15-25 XP
- B difficulty: 2-3 energy, 1-2 time, 1-2 attention, 25-50 XP
- A difficulty: 3-4 energy, 2-3 time, 2-3 attention, 50-100 XP
- S difficulty: 4-5 energy, 3-5 time, 3-5 attention, 100-250 XP

Return ONLY a JSON object with these fields:
{"energyCost":number,"timeCost":number,"attentionCost":number,"experienceReward":number,"reasoning":"brief 1-sentence explanation"}`;

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 256,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === "text");
      const rawText = textBlock ? textBlock.text.trim() : "{}";

      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const suggestion = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        res.json(suggestion);
      } catch {
        res.json({ energyCost: 1, timeCost: 0, attentionCost: 0, experienceReward: 10, reasoning: "Default values applied." });
      }
    } catch (error) {
      console.error("Error suggesting mission stats:", error);
      res.status(500).json({ error: "Failed to suggest stats" });
    }
  });
}
