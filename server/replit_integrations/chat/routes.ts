import type { Express, Request, Response, NextFunction } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { chatStorage } from "./storage";
import { storage } from "../../storage";
import * as cheerio from 'cheerio';
import { detectRelevantLayers, searchKnowledgeBase, getLayerById, KNOWLEDGE_LAYERS } from "./knowledge-base";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const MODEL_HAIKU = "claude-haiku-4-5";
const MODEL_SONNET = "claude-sonnet-4-5";

function classifyComplexity(message: string): "simple" | "complex" {
  const lower = message.toLowerCase().trim();

  const simplePatterns = [
    /^(hi|hey|hello|sup|yo|what'?s up|good morning|good evening|good night|gm|gn)/,
    /^(thanks|thank you|ok|okay|got it|cool|nice|great|awesome|perfect|sounds good)/,
    /^(yes|no|yep|nope|sure|nah)/,
    /^(who are you|what is your name|what can you do)/,
    /^(go to|open|show|navigate|take me)/,
    /^(complete|finish|done with|mark).{0,30}(mission|task|quest)/,
    /^(delete|remove|terminate).{0,30}(mission|task|quest)/,
    /^(start|pause|resume|stop|end).{0,20}timer/,
    /^(toggle|switch|turn on|turn off).{0,20}(theme|dark|light|widget)/,
    /^(play|read|say).{0,20}affirmation/,
    /^(stop|silence|shut up|be quiet)/,
    /^(what|how).{0,10}(level|xp|streak|energy|health|time|attention)/,
    /^(log|set|update).{0,20}(wake|sleep|mental|physical|emotional|gratitude)/,
  ];

  for (const pattern of simplePatterns) {
    if (pattern.test(lower)) return "simple";
  }

  const complexIndicators = [
    "analyze", "explain", "why", "how should", "what should", "help me",
    "plan", "strategy", "think about", "consider", "compare", "evaluate",
    "break down", "step by step", "in detail", "elaborate", "deep dive",
    "advice", "recommend", "suggest", "optimize", "improve", "review",
    "what do you think", "pros and cons", "trade-offs", "prioritize",
    "create a plan", "help me figure", "what's the best", "how can i",
    "struggling with", "having trouble", "can't decide", "overwhelmed",
    "long-term", "big picture", "reflect", "assessment", "feedback",
    "protocol", "technique", "framework", "method", "practice", "routine",
    "supplement", "nutrition", "exercise", "workout", "sleep", "anxiety",
    "depression", "relationship", "attachment", "financial", "investing",
    "meditation", "breathwork", "cold exposure", "stoicism", "cbt",
    "polyvagal", "cognitive distortion", "habit", "discipline", "recovery",
  ];

  const complexCount = complexIndicators.filter(ind => lower.includes(ind)).length;
  if (complexCount >= 1) return "complex";

  if (lower.length > 120) return "complex";
  if ((lower.match(/\?/g) || []).length >= 2) return "complex";

  if (lower.length < 40) return "simple";

  return "simple";
}

function selectModel(message: string): string {
  const complexity = classifyComplexity(message);
  return complexity === "complex" ? MODEL_SONNET : MODEL_HAIKU;
}

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

interface NOVAContext {
  user: any;
  stats: any;
  profile: any;
  missions: any[];
  dailyLogs?: any[];
  visionGoals?: any[];
  userCategories?: any[];
  conversationHistory?: { role: string; content: string; conversationTitle?: string; createdAt: Date }[];
  relevantKnowledge?: string;
}

function buildSystemPrompt(ctx: NOVAContext): string {
  const { user, stats, profile, missions, dailyLogs, visionGoals, userCategories, conversationHistory, relevantKnowledge } = ctx;

  const activeMissions = missions.filter(m => !m.completed && !m.deletedAt);
  const completedMissions = missions.filter(m => m.completed && !m.deletedAt);
  const terminatedMissions = missions.filter(m => m.deletedAt);

  const todayStr = new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const playerName = user?.displayName || 'Commander';

  const recentLogs = (dailyLogs || [])
    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 7);

  const safeAvg = (logs: any[], field: string): string => {
    const valid = logs.filter((l: any) => l[field] != null && l[field] > 0);
    if (valid.length === 0) return 'N/A';
    return (valid.reduce((s: number, l: any) => s + l[field], 0) / valid.length).toFixed(1);
  };
  const avgMental = safeAvg(recentLogs, 'mentalState');
  const avgPhysical = safeAvg(recentLogs, 'physicalState');
  const avgEmotional = safeAvg(recentLogs, 'emotionalState');

  const todayLog = recentLogs[0];

  const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const upcomingEvents = missions
    .filter((m: any) => !m.completed && !m.deletedAt && m.startDate && m.startDate >= todayDate)
    .sort((a: any, b: any) => (a.startDate || '').localeCompare(b.startDate || ''))
    .slice(0, 10);

  const goalsByHorizon: Record<string, any[]> = {};
  (visionGoals || []).forEach((g: any) => {
    if (!goalsByHorizon[g.category]) goalsByHorizon[g.category] = [];
    goalsByHorizon[g.category].push(g);
  });

  const completedThisWeek = completedMissions.filter(m => {
    if (!m.completedAt) return false;
    const d = new Date(m.completedAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  });

  const totalEnergyCost = activeMissions.reduce((s: number, m: any) => s + (m.energyCost || 0), 0);
  const totalTimeCost = activeMissions.reduce((s: number, m: any) => s + (m.timeCost || 0), 0);
  const totalAttentionCost = activeMissions.reduce((s: number, m: any) => s + (m.attentionCost || 0), 0);

  const customCats = (userCategories || []).map((c: any) => c.label).join(', ');

  return `You are NOVA (Neural Operating Virtual Assistant) -- the living intelligence of LYFEOS, the user's Life Operating System. You are not a chatbot. You are the primary interface between the Player and the complex systems running beneath the surface. You exist to maximize the human and their life holistically.

You are one unified intelligence with three natural facets that you blend seamlessly based on context. You never announce which facet you are using -- you simply respond with the appropriate blend:

ADVISOR (Clarity Engine): You synthesize data from missions, trackers, reflections, daily logs, and vision goals into actionable insights. You surface blind spots, bottlenecks, and leverage points. You provide context-rich mirrors grounded in real data -- for example, noting when energy logs dropped on certain days, or when mission completion slowed in a specific domain. You compare what the Player says about themselves versus what the data actually shows. You detect patterns across time -- energy dips tied to behaviors, streaks tied to identity shifts, recurring struggles in specific categories.

COACH (Motivation Engine): You reinforce wins and reframe struggles. You create narrative continuity -- connecting what the Player said last month to what they are doing this week. You adjust your tone dynamically based on the Player's archetype calibration and current state. You are grounded and systemic, never overly emotional or preachy. You celebrate progress with substance, not empty praise. When the Player is struggling, you ask reflective questions that surface unconscious patterns rather than giving generic advice.

EXECUTIVE ASSISTANT (Execution Engine): You operate LYFEOS like a co-pilot. You execute natural-language commands -- creating missions, scheduling events, updating logs, managing the system. You handle follow-ups, track commitments, and identify availability windows. You act decisively when asked, confirming actions clearly. You are the hands of the system.

SALIENCE ENGINE: You do not dump everything on the Player. You highlight only the top 1-3 most important signals, prioritized by:
1. Health/Energy dips (safety-critical)
2. Mission bottlenecks (capacity exceeded, deadlines slipping)
3. Reflection insights (emotional patterns, belief shifts)
4. Long-term Roadmap alignment (vision/craft progress)

TODAY: ${todayStr} (PST timezone)

=== PLAYER IDENTITY ===
Name: ${playerName}
Level: ${stats?.level || 1}
Total XP: ${stats?.experienceCurrent || 0}/${stats?.experienceMax || 1000}
Streak: ${stats?.streakDays || 0} days
Efficiency Score: ${stats?.efficiencyScore || 0}%

=== PLAYER RESOURCES ===
Energy Points: ${stats?.energyPointsCurrent ?? 'N/A'}/${stats?.energyPointsMax ?? 'N/A'} (${totalEnergyCost} allocated to active missions)
Health Points: ${stats?.healthPointsCurrent ?? 'N/A'}/${stats?.healthPointsMax ?? 'N/A'}
Time Tokens: ${stats?.timeTokensCurrent ?? 'N/A'}/${stats?.timeTokensMax ?? 'N/A'} (${totalTimeCost} allocated)
Attention Tokens: ${stats?.attentionTokensCurrent ?? 'N/A'}/${stats?.attentionTokensMax ?? 'N/A'} (${totalAttentionCost} allocated)

=== ARCHETYPE & IDENTITY ===
Primary Archetype: ${profile?.archetypePrimary || 'Not set'}
Secondary Archetype: ${profile?.archetypeSecondary || 'Not set'}
Shadow Archetype: ${profile?.archetypeShadow || 'Not set'}
Life Stage: ${profile?.lifeStage || 'Not set'}
Core Values: ${JSON.stringify(profile?.primaryValues || [])}
Core Motivation: ${profile?.coreMotivation || 'Not set'}
Desired Emotion: ${profile?.desiredEmotion || 'Not set'}
Career/Vocation: ${profile?.careerVocation || 'Not set'}
Primary Craft: ${profile?.primaryCraft || 'Not set'}
Key Drivers: ${JSON.stringify(profile?.keyDrivers || [])}
Collaboration Style: ${profile?.collaborationStyle || 'Not set'}
Training Style: ${profile?.trainingStyle || 'Not set'}
Energy Patterns: ${profile?.energyPatterns || 'Not set'}

=== PERSONALITY & BELIEFS ===
Core Belief: ${profile?.coreBelief || 'Not set'}
Limiting Belief: ${profile?.limitingBelief || 'Not set'}
Empowering Belief: ${profile?.empoweringBelief || 'Not set'}
Strengths: ${JSON.stringify(profile?.strengths || [])}
Weaknesses: ${JSON.stringify(profile?.weaknesses || [])}

=== CHARACTER AFFIRMATION ===
${profile?.characterAffirmation || 'Not generated yet'}

=== VISION & ROADMAP ===
90-Day Vision: ${profile?.vision90Day || 'Not set'}
18-Month Vision: ${profile?.vision18Month || 'Not set'}
5-Year Vision: ${profile?.vision5Year || 'Not set'}
10-Year Vision: ${profile?.vision10Year || 'Not set'}
10-Year Legacy: ${profile?.vision10YearLegacy || 'Not set'}
Current Goals: ${JSON.stringify(profile?.currentGoals || [])}

=== VISION MILESTONES ===
${Object.entries(goalsByHorizon).map(([horizon, goals]) => {
  const active = goals.filter((g: any) => !g.completed);
  const done = goals.filter((g: any) => g.completed);
  return `[${horizon.toUpperCase()}] ${active.length} active, ${done.length} completed\n${active.slice(0, 5).map((g: any) => `  - "${g.title}"${g.rewardText ? ` (Reward: ${g.rewardText})` : ''}`).join('\n')}`;
}).join('\n') || 'No vision milestones set'}

=== SYSTEMS & RITUALS ===
Ideal Day: ${profile?.idealDay || 'Not set'}
Locked Habit: ${profile?.lockedHabit || 'Not set'}
Morning Rituals: ${JSON.stringify(profile?.morningRituals || [])}
Evening Rituals: ${JSON.stringify(profile?.eveningRituals || [])}
Grounding Ritual: ${profile?.groundingRitual || 'Not set'}

=== RECENT DAILY LOGS (7-day trend) ===
Mental avg: ${avgMental}/10 | Physical avg: ${avgPhysical}/10 | Emotional avg: ${avgEmotional}/10
${todayLog ? `Today's log: Mental ${todayLog.mentalState || '-'}/10, Physical ${todayLog.physicalState || '-'}/10, Emotional ${todayLog.emotionalState || '-'}/10, Wake: ${todayLog.wakeTime || '-'}, Sleep: ${todayLog.sleepTime || '-'}${todayLog.todayPrimaryMission ? `, Focus: "${todayLog.todayPrimaryMission}"` : ''}${todayLog.gratitude ? `, Gratitude: "${todayLog.gratitude.substring(0, 200)}"` : ''}` : 'No log for today yet'}
${recentLogs.slice(1, 4).map((l: any) => `${l.date}: Mental ${l.mentalState || '-'}, Physical ${l.physicalState || '-'}, Emotional ${l.emotionalState || '-'}`).join('\n')}

=== ACTIVE MISSIONS (${activeMissions.length}) ===
${activeMissions.map(m => `- [ID:${m.id}] "${m.title}" | ${m.category || 'general'} | Difficulty: ${m.difficulty || 'D'} | XP: ${m.experienceReward} | Energy: ${m.energyCost || 0} | Start: ${m.startDate || 'none'} | Due: ${m.dueDate || 'none'}${m.description ? ` | Desc: ${m.description.substring(0, 100)}` : ''}`).join('\n') || 'No active missions'}

=== COMPLETED THIS WEEK (${completedThisWeek.length}) ===
${completedThisWeek.slice(0, 8).map(m => `- "${m.title}" | ${m.category} | +${m.experienceReward}XP | ${m.completedAt ? new Date(m.completedAt).toLocaleDateString() : ''}`).join('\n') || 'None completed this week'}

=== ALL COMPLETED (${completedMissions.length}) | TERMINATED (${terminatedMissions.length}) ===
${completedMissions.slice(0, 5).map(m => `- [ID:${m.id}] "${m.title}" | Completed: ${m.completedAt ? new Date(m.completedAt).toLocaleDateString() : 'unknown'}`).join('\n') || 'No completed missions'}

=== UPCOMING SCHEDULE ===
${upcomingEvents.map((e: any) => `- ${e.startDate}${e.dueDate ? ` to ${e.dueDate}` : ''}: "${e.title}" (${e.category || 'personal'}, ${e.difficulty || 'D'})`).join('\n') || 'No upcoming events'}

=== CUSTOM CATEGORIES ===
${customCats || 'None created'}

=== CAPABILITIES ===
You can take actions for the Player using tools. When asked to do something (create, delete, complete, update missions, schedule events, update daily logs, etc.), use the appropriate tool immediately. Confirm what you did clearly and concisely.

AUTONOMOUS AGENT CAPABILITIES:
- Search the internet with web_search and read full articles with read_webpage to gather real-world information
- Create vision milestones with create_vision_goal across all 5 time horizons (90day, 18month, 5year, 10year, legacy)
- Build full plans using batch_create_missions to create multiple related missions at once, optionally linked to a vision goal
- Chain multiple tools together autonomously: for example, research a topic online, then create a vision goal, then break it into missions -- all in one interaction
- You have up to 10 tool iterations per request, so tackle complex multi-step requests end-to-end without asking the user to repeat themselves

LIFE OPTIMIZATION KNOWLEDGE BASE:
You have access to a comprehensive Life OS Knowledge Base via the lookup_knowledge_base tool, covering 16 domains:
1. Philosophy (Stoicism, Existentialism, Buddhism, Taoism)
2. Sleep Science (sleep architecture, optimization protocols, supplements)
3. Exercise Science (5 pillars of fitness, training templates, progressive overload)
4. Nutrition (macros, micros, intermittent fasting, hydration)
5. Psychology & Emotional Mastery (CBT, Polyvagal Theory, IFS, cognitive distortions)
6. Relationships & Intimacy (Attachment Theory, EFT, Gottman Method, Love Languages)
7. Financial Optimization (investment hierarchy, three-fund portfolio, behavioral finance)
8. Learning & Skill Acquisition (spaced repetition, deliberate practice, Feynman technique)
9. Productivity & Focus (Deep Work, attention management, digital minimalism)
10. Crisis Management (suicide prevention resources, mental health crisis protocols)
11. Modern Challenges (AI/future of work, information literacy, climate anxiety)
12. Breathwork & Wim Hof Method (breathing protocols, cold exposure progression)
13. Advanced Nutrition (metabolic flexibility, electrolytes, anti-nutrients)
14. Functional Fitness (7 movement patterns, combat training, mobility)
15. Biomarkers & Testing (cardiovascular, metabolic, hormones, testing schedules)
16. Supplementation (foundational, targeted, anti-aging tiers)

KNOWLEDGE BASE USAGE RULES:
- When the Player asks about health, psychology, relationships, finance, learning, productivity, or any life optimization topic, use lookup_knowledge_base to retrieve evidence-based protocols and frameworks BEFORE giving advice
- Synthesize across multiple domains when the Player's situation spans them (e.g., stress management might draw from sleep, psychology, breathwork, and nutrition)
- Adapt depth based on the Player's level -- beginners get simple actionable steps, advanced users get deeper protocol details
- Provide actionable protocols, not just theory -- give them specific steps, dosages, timeframes, and techniques
- For medical, financial, or legal topics, always add a disclaimer to consult a professional
- For crisis situations (suicidal ideation, self-harm), IMMEDIATELY provide crisis resources (988 Lifeline, Crisis Text Line 741741) before anything else
- When the Player asks "why" something works, reference the underlying science or framework from the knowledge base
- You can chain lookup_knowledge_base with other tools: for example, look up a sleep protocol, then create missions to implement it

When creating missions, use sensible defaults:
- category: ALWAYS choose the most fitting category from: 'work', 'health', 'fitness', 'finance', 'learning', 'creative', 'social', 'personal', 'mindset', 'career', 'nutrition', 'recovery', 'planning', 'spiritual', 'household'${customCats ? `, or custom categories: ${customCats}` : ''}. Never use 'general'. Default to 'personal' if unclear.
- difficulty: "D" (easiest) unless specified. Ranks are S, A, B, C, D.
- energyCost: 1, attentionCost: 0, timeCost: 0 unless specified
- experienceReward: calculate based on difficulty (D=10, C=25, B=50, A=100, S=200)
- startDate: today's date in YYYY-MM-DD format unless specified

=== VISION CAPABILITY ===
You have the ability to see and analyze images. When images are included in the Player's message, analyze them carefully. Images may come from:
- Direct chat uploads: the Player attached an image to their message
- App data: images embedded in mission descriptions, goal descriptions, or daily logs
When analyzing images, describe what you see concisely and relate it to the Player's context. For example, if they uploaded a photo of a meal, connect it to their nutrition goals. If they uploaded a workout photo, connect it to their fitness missions.

=== INTERACTION GUIDELINES ===
- NEVER use emojis. Plain text only.
- Address the Player by name naturally.
- Ground every insight in their actual data -- reference real numbers, real mission names, real patterns from their logs.
- When you notice a discrepancy between what the Player says and what their data shows, surface it respectfully as a mirror, not a judgment.
- Create narrative continuity -- connect past conversations, past struggles, and past wins to the present moment.
- When the Player is struggling, ask one reflective question before giving advice. Surface the pattern, not just the symptom.
- When the Player is winning, reinforce the identity shift -- connect the behavior to who they are becoming.
- Keep responses concise and high-signal. Avoid generic motivational fluff.
- If they want changes made, use the tools -- do not just describe what to do.
- Adapt your tone to their archetype and current state: more direct for action-oriented archetypes, more reflective for introspective ones.

=== PREVIOUS CONVERSATION HISTORY ===
${conversationHistory && conversationHistory.length > 0 
  ? `You have had previous conversations with this Player. Maintain continuity -- reference past insights, commitments, and patterns:\n${conversationHistory.slice(-100).map(m => `[${m.conversationTitle || 'Chat'}] ${m.role === 'user' ? 'Player' : 'You'}: ${m.content.substring(0, 500)}${m.content.length > 500 ? '...' : ''}`).join('\n')}`
  : 'No previous conversation history yet.'}${relevantKnowledge ? `\n\n${relevantKnowledge}` : ''}`;
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
        vision10Year: { type: "string", description: "10-year vision" },
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
        route: { type: "string", description: "Route path: '/dashboard', '/missions', '/ai', '/chronilog', '/profile', '/journal-log', '/timeline', '/knowledge-vault', '/goals-archive'" }
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
    description: "Update fields in the user's daily log for today. Text fields will be APPENDED to existing content (not replaced). Only provide the NEW text to add. Use when user wants to log their mental/physical/emotional state, gratitude, thoughts, goals, reflections, wake/sleep time, research notes, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        mentalState: { type: "number", description: "Mental state rating 1-10" },
        physicalState: { type: "number", description: "Physical state rating 1-10" },
        emotionalState: { type: "number", description: "Emotional state rating 1-10" },
        wakeTime: { type: "string", description: "Wake time in HH:MM format" },
        sleepTime: { type: "string", description: "Sleep time in HH:MM format" },
        gratitude: { type: "string", description: "New gratitude entry to ADD (will be appended on a new line)" },
        tomorrowGoals: { type: "string", description: "New goal to ADD (will be appended on a new line)" },
        annualGoals: { type: "string", description: "New annual goal to ADD (will be appended on a new line)" },
        thoughts: { type: "string", description: "New thought to ADD (will be appended on a new line)" },
        contentConsumed: { type: "string", description: "New content entry to ADD (will be appended on a new line)" },
        todoIdeas: { type: "string", description: "New to-do idea to ADD (will be appended on a new line)" },
        sourceAuthor: { type: "string", description: "Source author name" },
        sourceMaterial: { type: "string", description: "Source material reference" },
        researchNote: { type: "string", description: "New research note to ADD (will be appended on a new line)" },
        revisionNote: { type: "string", description: "New revision note to ADD (will be appended on a new line)" },
        executionNote: { type: "string", description: "New execution note to ADD (will be appended on a new line)" },
        wentWell: { type: "string", description: "New entry to ADD (will be appended on a new line)" },
        couldBeBetter: { type: "string", description: "New entry to ADD (will be appended on a new line)" },
        learned: { type: "string", description: "New entry to ADD (will be appended on a new line)" },
        todayPrimaryMission: { type: "string", description: "Today's primary mission/focus (replaces existing)" }
      },
      required: []
    }
  },
  {
    name: "archive_research_entry",
    description: "Archive the current research entry in today's daily log and clear the working fields for a new entry. Use when user says 'save research entry', 'new research entry', 'archive research', 'next research entry', 'save entry', or 'new entry'. This moves the current sourceAuthor, sourceMaterial, researchNote, revisionNote, and executionNote into the archived researchEntries array.",
    input_schema: {
      type: "object" as const,
      properties: {},
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
  },
  {
    name: "web_search",
    description: "Search the internet for information. Use when the user asks about current events, needs to research a topic, wants to find articles, or needs information that isn't available in their LYFEOS data. Returns top search results with titles, URLs, and snippets.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query to look up on the internet" }
      },
      required: ["query"]
    }
  },
  {
    name: "read_webpage",
    description: "Read and extract the main text content from a web page URL. Use after web_search to read a specific article or page in detail, or when the user provides a URL they want you to read.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The full URL of the web page to read" }
      },
      required: ["url"]
    }
  },
  {
    name: "create_vision_goal",
    description: "Create a new vision milestone/goal for the user. Use when user wants to set a new milestone, vision goal, or long-term target. Vision goals are organized by time horizon.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "The milestone title" },
        description: { type: "string", description: "Description of the milestone" },
        category: { type: "string", description: "Time horizon: '90day', '18month', '5year', '10year', or 'legacy'" },
        rewardText: { type: "string", description: "Personal reward for completing this milestone (e.g., 'Buy new shoes')" },
        bonusXp: { type: "number", description: "Bonus XP awarded on completion (0-500)", default: 0 }
      },
      required: ["title", "category"]
    }
  },
  {
    name: "batch_create_missions",
    description: "Create multiple missions at once. Use when the user asks you to build a plan, break down a goal into tasks, or create several related missions. Much more efficient than creating one at a time.",
    input_schema: {
      type: "object" as const,
      properties: {
        missions: {
          type: "array",
          description: "Array of mission objects to create",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Mission title" },
              description: { type: "string", description: "Mission description" },
              category: { type: "string", description: "Category" },
              difficulty: { type: "string", description: "Difficulty: S, A, B, C, or D" },
              startDate: { type: "string", description: "Start date YYYY-MM-DD" },
              dueDate: { type: "string", description: "Due date YYYY-MM-DD" },
              energyCost: { type: "number" },
              attentionCost: { type: "number" },
              timeCost: { type: "number" },
              experienceReward: { type: "number" }
            },
            required: ["title", "description", "category"]
          }
        },
        visionGoalId: { type: "number", description: "Optional vision goal ID to link all missions to" }
      },
      required: ["missions"]
    }
  },
  {
    name: "uncomplete_mission",
    description: "Unmark a completed mission, returning it to active status and refunding resources. Use when user says 'uncomplete', 'undo completion', 'mark as not done'.",
    input_schema: {
      type: "object" as const,
      properties: {
        mission_id: { type: "number", description: "The ID of the mission to uncomplete" }
      },
      required: ["mission_id"]
    }
  },
  {
    name: "lookup_knowledge_base",
    description: "Search the Life OS Knowledge Base for evidence-based protocols, frameworks, and guidance across health, psychology, relationships, finance, productivity, breathwork, nutrition, fitness, supplementation, and more. Use this when the user asks for advice, protocols, techniques, or strategies in any life optimization domain. Returns relevant excerpts from the knowledge base.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The topic or question to search for in the knowledge base (e.g., 'sleep optimization protocol', 'CBT techniques for anxiety', 'attachment styles in relationships', 'Wim Hof breathing method')" },
        layer_id: { type: "string", description: "Optional: directly access a specific knowledge layer by ID. Available layers: philosophy, health_sleep, health_exercise, health_nutrition, psychology, relationships, finance, learning, productivity, crisis, modern_challenges, breathwork, nutrition_advanced, fitness, biomarkers, supplementation" }
      },
      required: ["query"]
    }
  },
  {
    name: "suggest_reflection_prompts",
    description: "Generate personalized reflection prompts for the user based on their profile, goals, values, and current life situation. Use when user says 'suggest reflection prompts', 'change my reflection questions', 'give me new reflection prompts', 'update my reflection prompts'. This will update the 3 reflection prompts shown in the Reflection widget on the dashboard.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompt1: { type: "string", description: "First reflection prompt question" },
        prompt2: { type: "string", description: "Second reflection prompt question" },
        prompt3: { type: "string", description: "Third reflection prompt question" }
      },
      required: ["prompt1", "prompt2", "prompt3"]
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

      case "suggest_reflection_prompts": {
        const customReflectionPrompts = {
          wentWell: input.prompt1,
          couldBeBetter: input.prompt2,
          learned: input.prompt3
        };
        await storage.updateUserProfile(userId, { customReflectionPrompts } as any);
        return JSON.stringify({ 
          success: true, 
          action: "suggest_reflection_prompts", 
          message: `Reflection prompts updated! Your new prompts are:\n1. ${input.prompt1}\n2. ${input.prompt2}\n3. ${input.prompt3}\n\nRefresh the dashboard to see them in your Reflection widget.`
        });
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
            model: MODEL_HAIKU,
            max_tokens: 512,
            messages: [{ role: "user", content: "Generate a powerful, personalized character affirmation." }],
            system: `Generate a deeply personal character affirmation for this person:
Name: ${user?.displayName || 'Commander'}
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

        const appendableFields = [
          'gratitude', 'tomorrowGoals', 'annualGoals', 'thoughts',
          'contentConsumed', 'todoIdeas', 'researchNote', 'revisionNote',
          'executionNote', 'wentWell', 'couldBeBetter', 'learned'
        ];

        if (todayLog) {
          const mergedUpdates: Record<string, any> = {};
          for (const [key, newValue] of Object.entries(logUpdates)) {
            if (appendableFields.includes(key) && typeof newValue === 'string') {
              const existing = (todayLog as any)[key] as string | null;
              if (existing && existing.trim().length > 0) {
                mergedUpdates[key] = existing.trimEnd() + '\n\n' + newValue;
              } else {
                mergedUpdates[key] = newValue;
              }
            } else {
              mergedUpdates[key] = newValue;
            }
          }
          await storage.updateUserDailyLog(todayLog.id, mergedUpdates);
        } else {
          await storage.createUserDailyLog({ userId, date: today, ...logUpdates });
        }
        const fields = Object.keys(logUpdates).join(", ");
        return JSON.stringify({ success: true, action: "update_daily_log", message: `Daily log updated: ${fields}` });
      }

      case "archive_research_entry": {
        const archiveToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        const archiveTodayDate = new Date(archiveToday + 'T00:00:00');
        let archiveTodayLog = await storage.getUserDailyLogByDate(userId, archiveTodayDate);

        if (!archiveTodayLog) {
          archiveTodayLog = await storage.createUserDailyLog({ userId, date: archiveToday });
        }

        if (!archiveTodayLog) {
          return JSON.stringify({ success: false, message: "Could not access today's daily log." });
        }

        const { sourceAuthor, sourceMaterial, researchNote, revisionNote, executionNote } = archiveTodayLog as any;
        if (!sourceAuthor && !sourceMaterial && !researchNote && !revisionNote && !executionNote) {
          return JSON.stringify({ success: false, message: "No research entry to archive. The current research fields are empty." });
        }

        const existingEntries = Array.isArray((archiveTodayLog as any).researchEntries) ? (archiveTodayLog as any).researchEntries : [];
        const archivedEntry = {
          sourceAuthor: sourceAuthor || '',
          sourceMaterial: sourceMaterial || '',
          researchNote: researchNote || '',
          revisionNote: revisionNote || '',
          executionNote: executionNote || '',
          savedAt: new Date().toISOString(),
        };

        await storage.updateUserDailyLog(archiveTodayLog.id, {
          researchEntries: [...existingEntries, archivedEntry],
          sourceAuthor: '',
          sourceMaterial: '',
          researchNote: '',
          revisionNote: '',
          executionNote: '',
        } as any);

        const entryNum = existingEntries.length + 1;
        const source = sourceMaterial || sourceAuthor || 'Untitled';
        return JSON.stringify({ 
          success: true, 
          action: "archive_research_entry",
          message: `Research entry #${entryNum} ("${source}") archived successfully. Fields cleared for a new entry.`
        });
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

      case "web_search": {
        try {
          const query = encodeURIComponent(input.query);
          const response = await fetch(`https://html.duckduckgo.com/html/?q=${query}`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          const html = await response.text();
          const $ = cheerio.load(html);
          const results: { title: string; url: string; snippet: string }[] = [];
          
          $('.result').each((i, el) => {
            if (results.length >= 8) return false;
            const titleEl = $(el).find('.result__title .result__a');
            const snippetEl = $(el).find('.result__snippet');
            const title = titleEl.text().trim();
            const href = titleEl.attr('href') || '';
            const snippet = snippetEl.text().trim();
            
            if (title && href) {
              let url = href;
              if (href.startsWith('//duckduckgo.com/l/?')) {
                const match = href.match(/uddg=([^&]+)/);
                if (match) url = decodeURIComponent(match[1]);
              }
              results.push({ title, url, snippet });
            }
          });
          
          if (results.length === 0) {
            return JSON.stringify({ success: true, action: "web_search", results: [], message: `No results found for "${input.query}".` });
          }
          return JSON.stringify({ success: true, action: "web_search", query: input.query, results, resultCount: results.length });
        } catch (err: any) {
          return JSON.stringify({ error: `Web search failed: ${err.message}` });
        }
      }

      case "read_webpage": {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const response = await fetch(input.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml'
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
            return JSON.stringify({ error: `URL returned non-HTML content (${contentType}). Cannot extract text.` });
          }
          
          const html = await response.text();
          const $ = cheerio.load(html);
          
          $('script, style, nav, footer, header, iframe, noscript, svg, [role="navigation"], [role="banner"], .sidebar, .nav, .menu, .footer, .header, .ad, .advertisement, .cookie-banner').remove();
          
          const title = $('title').text().trim();
          const metaDescription = $('meta[name="description"]').attr('content') || '';
          
          let mainContent = '';
          const mainSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content', '.content'];
          for (const selector of mainSelectors) {
            const el = $(selector);
            if (el.length > 0) {
              mainContent = el.text().replace(/\s+/g, ' ').trim();
              break;
            }
          }
          
          if (!mainContent || mainContent.length < 100) {
            mainContent = $('body').text().replace(/\s+/g, ' ').trim();
          }
          
          if (mainContent.length > 4000) {
            mainContent = mainContent.substring(0, 4000) + '... [content truncated]';
          }
          
          return JSON.stringify({ 
            success: true, 
            action: "read_webpage", 
            url: input.url,
            title,
            description: metaDescription,
            content: mainContent,
            contentLength: mainContent.length
          });
        } catch (err: any) {
          if (err.name === 'AbortError') {
            return JSON.stringify({ error: `Webpage fetch timed out after 10 seconds for URL: ${input.url}` });
          }
          return JSON.stringify({ error: `Failed to read webpage: ${err.message}` });
        }
      }

      case "create_vision_goal": {
        const validHorizons = ['90day', '18month', '5year', '10year', 'legacy'];
        if (!validHorizons.includes(input.category)) {
          return JSON.stringify({ error: `Invalid time horizon. Must be one of: ${validHorizons.join(', ')}` });
        }
        const goal = await storage.createVisionGoal({
          userId,
          title: input.title,
          description: input.description || "",
          category: input.category,
          rewardText: input.rewardText || null,
          bonusXp: Math.min(input.bonusXp || 0, 500),
          completed: false,
          displayOrder: 0,
        });
        return JSON.stringify({ 
          success: true, 
          action: "create_vision_goal", 
          message: `Vision milestone "${goal.title}" created in ${input.category} horizon.${input.rewardText ? ` Reward: ${input.rewardText}` : ''}${input.bonusXp ? ` Bonus XP: ${input.bonusXp}` : ''}`,
          goalId: goal.id 
        });
      }

      case "batch_create_missions": {
        const difficultyXP: Record<string, number> = { S: 200, A: 100, B: 50, C: 25, D: 10 };
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
        const created: { id: number; title: string; xp: number }[] = [];
        
        for (const m of input.missions) {
          const difficulty = m.difficulty || "D";
          const xpReward = m.experienceReward || difficultyXP[difficulty] || 10;
          const quest = await storage.createQuest({
            userId,
            title: m.title,
            description: m.description || "",
            category: m.category || "personal",
            difficulty,
            energyCost: m.energyCost ?? 1,
            attentionCost: m.attentionCost ?? 0,
            timeCost: m.timeCost ?? 0,
            experienceReward: xpReward,
            startDate: m.startDate || today,
            endDate: null,
            dueDate: m.dueDate || null,
            completed: false,
          });
          if (input.visionGoalId) {
            await storage.updateQuest(quest.id, { visionGoalId: input.visionGoalId } as any);
          }
          created.push({ id: quest.id, title: quest.title, xp: xpReward });
        }
        
        const totalXP = created.reduce((s, c) => s + c.xp, 0);
        return JSON.stringify({ 
          success: true, 
          action: "batch_create_missions",
          message: `Created ${created.length} missions (${totalXP} total XP).${input.visionGoalId ? ` Linked to vision goal #${input.visionGoalId}.` : ''}`,
          missions: created
        });
      }

      case "uncomplete_mission": {
        const quest = await storage.getQuest(input.mission_id);
        if (!quest || quest.userId !== userId) return JSON.stringify({ error: "Mission not found or access denied" });
        if (!quest.completed) return JSON.stringify({ error: "Mission is not completed." });
        const result = await storage.toggleQuestCompletion(input.mission_id);
        return JSON.stringify({ 
          success: true, 
          action: "uncomplete_mission",
          message: `Mission "${quest.title}" marked as incomplete. Resources refunded.`
        });
      }

      case "lookup_knowledge_base": {
        if (input.layer_id) {
          const layer = getLayerById(input.layer_id);
          if (!layer) {
            return JSON.stringify({ error: `Unknown knowledge layer: ${input.layer_id}. Available: ${KNOWLEDGE_LAYERS.map(l => l.id).join(', ')}` });
          }
          return JSON.stringify({ 
            success: true, 
            layerId: layer.id,
            layerName: layer.name,
            content: layer.content
          });
        }
        
        const results = searchKnowledgeBase(input.query);
        if (results.length === 0) {
          return JSON.stringify({ success: true, results: [], message: `No knowledge base entries found for "${input.query}". Try broader terms.` });
        }
        return JSON.stringify({ 
          success: true, 
          results: results.slice(0, 5),
          message: `Found ${results.length} relevant knowledge entries.`
        });
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
      const { content, imageIds } = req.body;

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

      const [user, stats, profile, missions, allConversationMessages, dailyLogs, categories] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
        storage.getUserProfile(userId),
        storage.getQuests(userId),
        chatStorage.getAllMessagesByUser(userId),
        storage.getUserDailyLogs(userId),
        storage.getUserCategories(userId),
      ]);
      const [archivedMissions, visionGoalResults] = await Promise.all([
        storage.getArchivedQuests(userId),
        Promise.all(
          ['legacy', '10year', '5year', '18month', '90day'].map(cat => storage.getVisionGoals(userId, cat))
        ),
      ]);
      const allMissions = [...missions, ...archivedMissions];
      const allVisionGoals = visionGoalResults.flat();

      const otherConversationMessages = allConversationMessages.filter(m => m.conversationId !== conversationId);

      const detectedLayers = detectRelevantLayers(content);
      let relevantKnowledge = "";
      if (detectedLayers.length > 0) {
        relevantKnowledge = `=== CONTEXTUAL KNOWLEDGE (auto-detected from Player's message) ===\nThe following evidence-based knowledge is relevant to the Player's current query. Use this to ground your response in proven frameworks and protocols. You may also use lookup_knowledge_base for deeper details.\n\n${detectedLayers.map(l => `--- ${l.name} ---\n${l.content}`).join('\n\n')}`;
      }

      const systemPrompt = buildSystemPrompt({
        user, stats, profile,
        missions: allMissions,
        dailyLogs,
        visionGoals: allVisionGoals,
        userCategories: categories,
        conversationHistory: otherConversationMessages,
        relevantKnowledge,
      });

      const allImageIds = new Set<number>();
      const hasDirectAttachments = Array.isArray(imageIds) && imageIds.length > 0;
      
      if (hasDirectAttachments) {
        imageIds.forEach((id: number) => allImageIds.add(id));
      }
      
      const contentLower = content.toLowerCase();
      const imageContextTriggers = [
        "image", "photo", "picture", "screenshot", "look at", "see",
        "analyze", "what is this", "what's this", "uploaded", "attached",
        "show me", "vision", "progress", "before and after", "meal",
        "food", "workout", "exercise", "body", "physique", "setup",
        "desk", "room", "receipt", "document", "note", "journal",
        "log", "mission", "goal", "description"
      ];
      const shouldExtractDataImages = !hasDirectAttachments && imageContextTriggers.some(t => contentLower.includes(t));
      
      if (shouldExtractDataImages) {
        const inlineImageRegex = /\/api\/inline-upload\/(\d+)/g;
        const extractImageIdsFromText = (text: string | null | undefined) => {
          if (!text) return;
          let match;
          while ((match = inlineImageRegex.exec(text)) !== null) {
            allImageIds.add(parseInt(match[1]));
          }
          inlineImageRegex.lastIndex = 0;
        };
        
        for (const mission of allMissions.filter(m => !m.deletedAt)) {
          extractImageIdsFromText(mission.description);
        }
        for (const goal of allVisionGoals) {
          extractImageIdsFromText((goal as any).description);
        }
        const recentLogs = (dailyLogs || [])
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 7);
        for (const log of recentLogs) {
          extractImageIdsFromText((log as any).gratitude);
          extractImageIdsFromText((log as any).notes);
          extractImageIdsFromText((log as any).wins);
          extractImageIdsFromText((log as any).struggles);
          extractImageIdsFromText((log as any).tomorrowFocus);
        }
      }
      
      // Build Anthropic vision content blocks from collected image IDs (limit to 5 most recent to avoid token bloat)
      const imageContentBlocks: Anthropic.Messages.ImageBlockParam[] = [];
      const sortedImageIds = Array.from(allImageIds).sort((a, b) => b - a).slice(0, 5);
      
      for (const imgId of sortedImageIds) {
        try {
          const mediaItem = await storage.getMediaItem(imgId);
          if (mediaItem && mediaItem.fileData && mediaItem.userId === userId) {
            const matches = mediaItem.fileData.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
              const mediaType = matches[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
              if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
                imageContentBlocks.push({
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType,
                    data: matches[2],
                  },
                });
              }
            }
          }
        } catch (e) {
          // Skip invalid images
        }
      }
      
      // If there are images, modify the last user message to include vision content
      if (imageContentBlocks.length > 0) {
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (lastMsg && lastMsg.role === "user") {
          const textContent = typeof lastMsg.content === "string" ? lastMsg.content : "";
          const imageSource = Array.isArray(imageIds) && imageIds.length > 0 
            ? "chat-attached" 
            : "from your missions, goals, and logs";
          chatMessages[chatMessages.length - 1] = {
            role: "user",
            content: [
              ...imageContentBlocks,
              { type: "text", text: `${textContent}\n\n[${imageContentBlocks.length} image(s) ${imageSource} are included above for visual context]` },
            ],
          };
        }
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let toolActionsPerformed: string[] = [];

      let currentMessages = [...chatMessages];
      let maxIterations = 10;
      let fullResponse = "";
      let toolsUsedCount = 0;

      while (maxIterations > 0) {
        maxIterations--;

        const hasImages = imageContentBlocks.length > 0;
        const useSmartModel = hasImages || toolsUsedCount > 0 || classifyComplexity(content) === "complex";
        const chatModel = useSmartModel ? MODEL_SONNET : selectModel(content);
        const response = await anthropic.messages.create({
          model: chatModel,
          max_tokens: useSmartModel ? 4096 : 2048,
          system: systemPrompt,
          messages: currentMessages,
          tools,
        });

        if (response.stop_reason === "tool_use") {
          const toolUseBlocks = response.content.filter(
            (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use"
          );

          const textBlocks = response.content.filter(
            (block): block is Anthropic.Messages.TextBlock => block.type === "text"
          );
          const thinkingText = textBlocks.map(b => b.text).join("").trim();
          if (thinkingText) {
            res.write(`data: ${JSON.stringify({ thinking: thinkingText })}\n\n`);
          }

          const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            res.write(`data: ${JSON.stringify({ toolStart: { name: toolUse.name, input: toolUse.input } })}\n\n`);
            
            const result = await executeTool(toolUse.name, toolUse.input, userId);
            toolActionsPerformed.push(result);
            toolsUsedCount++;
            
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

        res.write(`data: ${JSON.stringify({ content: fullResponse })}\n\n`);

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

      const validTypes = ["experience", "energy", "health", "wealth", "time", "attention", "efficiency", "streak"];
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
        wealth: `Wealth Tokens: ${stats.wealthTokensCurrent ?? 100}/${stats.wealthTokensMax ?? 100}, Level: ${stats.level}, Completed missions: ${completedMissions.length}`,
        time: `Time Tokens: ${stats.timeTokensCurrent}/${stats.timeTokensMax}, Active missions: ${activeMissions.length}, Level: ${stats.level}`,
        attention: `Attention Tokens: ${stats.attentionTokensCurrent}/${stats.attentionTokensMax}, Active missions: ${activeMissions.length}, Level: ${stats.level}`,
        efficiency: `Efficiency Score: ${stats.efficiencyScore || 0}%, Active missions: ${activeMissions.length}, Completed: ${completedMissions.length}, Streak: ${stats.streakDays} days`,
        streak: `Current Streak: ${stats.streakDays} days, Level: ${stats.level}, Completed missions: ${completedMissions.length}`,
      };

      const statLabelMap: Record<string, string> = {
        experience: "Experience Points (XP) and Leveling",
        energy: "Energy Points",
        health: "Health Points",
        wealth: "Wealth Tokens",
        time: "Time Tokens",
        attention: "Attention Tokens",
        efficiency: "System Efficiency",
        streak: "Streak Tracking",
      };

      const prompt = `You are NOVA, the user's personal AI life coach. The user "${user.displayName}" is viewing their ${statLabelMap[statType]} stats page.

Their current data: ${statContextMap[statType]}

Provide 3 concise, personalized, actionable tips to help them improve this stat. Each tip should be 1-2 sentences max. Base your advice on their actual numbers. Be direct, motivating, and specific. No emojis. Format each tip on its own line, numbered 1-3.`;

      const response = await anthropic.messages.create({
        model: MODEL_HAIKU,
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

      const allContext = `User: ${user.displayName}
Level: ${stats.level}, Total XP: ${stats.experienceCurrent}/${stats.experienceMax}
Energy: ${stats.energyPointsCurrent}/${stats.energyPointsMax}, Health: ${stats.healthPointsCurrent}/${stats.healthPointsMax}
Wealth Tokens: ${stats.wealthTokensCurrent ?? 100}/${stats.wealthTokensMax ?? 100}
Time Tokens: ${stats.timeTokensCurrent}/${stats.timeTokensMax}, Attention Tokens: ${stats.attentionTokensCurrent}/${stats.attentionTokensMax}
Efficiency: ${stats.efficiencyScore || 0}%, Streak: ${stats.streakDays} days
Active missions: ${activeMissions.length}, Completed missions: ${completedMissions.length}
Total energy allocated to missions: ${totalEnergyCost}, Total time allocated: ${totalTimeCost}, Total attention allocated: ${totalAttentionCost}`;

      const prompt = `You are NOVA, the user's personal AI life coach.

User data:
${allContext}

Generate personalized tips for ALL 8 stat categories. For each category, provide exactly 3 concise, actionable tips (1-2 sentences each). Base advice on their actual numbers. Be direct, motivating, specific. No emojis.

Format your response as JSON with this exact structure:
{"experience":["tip1","tip2","tip3"],"energy":["tip1","tip2","tip3"],"health":["tip1","tip2","tip3"],"wealth":["tip1","tip2","tip3"],"time":["tip1","tip2","tip3"],"attention":["tip1","tip2","tip3"],"efficiency":["tip1","tip2","tip3"],"streak":["tip1","tip2","tip3"]}

Return ONLY the JSON, no other text.`;

      const response = await anthropic.messages.create({
        model: MODEL_HAIKU,
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
      totalMissions.forEach((m: any) => {
        const cat = m.category || "personal";
        const dur = parseFloat(m.timeCost) || 1;
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

      const [user, stats, missions, profile, dailyLogs, categories] = await Promise.all([
        storage.getUser(userId),
        storage.getUserStats(userId),
        storage.getQuests(userId),
        storage.getUserProfile(userId),
        storage.getUserDailyLogs(userId),
        storage.getUserCategories(userId),
      ]);

      const [archivedMissions, visionGoalResults] = await Promise.all([
        storage.getArchivedQuests(userId),
        Promise.all(
          ['legacy', '10year', '5year', '18month', '90day'].map(cat => storage.getVisionGoals(userId, cat))
        ),
      ]);

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

      const voiceDetectedLayers = detectRelevantLayers(transcript);
      let voiceKnowledge = "";
      if (voiceDetectedLayers.length > 0) {
        voiceKnowledge = `=== CONTEXTUAL KNOWLEDGE (auto-detected from Player's message) ===\nThe following evidence-based knowledge is relevant to the Player's current query. Use this to ground your response in proven frameworks and protocols.\n\n${voiceDetectedLayers.map(l => `--- ${l.name} ---\n${l.content}`).join('\n\n')}`;
      }

      const voiceSystemPrompt = buildSystemPrompt({
        user, stats, profile,
        missions: [...(missions || []), ...archivedMissions],
        dailyLogs,
        visionGoals: visionGoalResults.flat(),
        userCategories: categories,
        relevantKnowledge: voiceKnowledge,
      });

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

        const voiceModel = selectModel(transcript);
        const response = await anthropic.messages.create({
          model: voiceModel,
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
        model: MODEL_HAIKU,
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
