import Anthropic from "@anthropic-ai/sdk";

export function formatLocalDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

export const logger = {
  debug: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
      console.log('[INFO]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};

const VALID_CATEGORIES = ["work", "health", "fitness", "finance", "learning", "creative", "social", "personal", "mindset", "career", "nutrition", "recovery", "planning", "spiritual", "household"];
const VALID_DIFFICULTIES = ["s", "a", "b", "c", "d"];
const PRESET_CATEGORIES = ["onboarding", "setup", "rituals"];

const CLASSIFICATION_PROMPT = `Classify this mission. Respond with ONLY two words separated by a space: the category and the difficulty rank. Nothing else.

Categories: work, health, fitness, finance, learning, creative, social, personal, mindset, career, nutrition, recovery, planning, spiritual, household

Difficulty ranks (based on effort, complexity, and time required):
S = Extreme effort, multi-day or life-changing tasks
A = High effort, significant commitment (several hours or very challenging)
B = Moderate effort, requires focus and planning (1-3 hours)
C = Light effort, simple but requires some attention (30min-1hr)
D = Minimal effort, quick and easy tasks (under 30min)`;

export interface ClassificationResult {
  category: string;
  difficulty: string;
}

export async function classifyMission(
  title: string,
  description?: string | null,
  defaults: ClassificationResult = { category: "general", difficulty: "D" }
): Promise<ClassificationResult> {
  if (PRESET_CATEGORIES.includes(defaults.category)) {
    return defaults;
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 30,
      messages: [{
        role: "user",
        content: `${CLASSIFICATION_PROMPT}\n\nMission title: ${title}${description ? `\nDescription: ${description}` : ''}`,
      }],
    });

    const responseText = response.content[0].type === "text"
      ? response.content[0].text.trim().toLowerCase()
      : "";

    if (!responseText) return defaults;

    const parts = responseText.split(/\s+/);
    const result = { ...defaults };

    if (parts.length >= 2) {
      if (VALID_CATEGORIES.includes(parts[0])) result.category = parts[0];
      if (VALID_DIFFICULTIES.includes(parts[1])) result.difficulty = parts[1].toUpperCase();
    } else if (parts.length === 1 && VALID_CATEGORIES.includes(parts[0])) {
      result.category = parts[0];
    }

    return result;
  } catch (error) {
    logger.error("AI classification failed, using defaults:", error);
    return defaults;
  }
}
