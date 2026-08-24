export type AIContextPreferences = {
  planning: boolean;
  identity: boolean;
  dailyState: boolean;
  conversationHistory: boolean;
};

export const DEFAULT_AI_CONTEXT_PREFERENCES: AIContextPreferences = {
  planning: true,
  identity: false,
  dailyState: false,
  conversationHistory: false,
};

/** Resolves only known booleans so malformed or future profile data cannot broaden AI context. */
export function resolveAIContextPreferences(value: unknown): AIContextPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_AI_CONTEXT_PREFERENCES };
  const candidate = value as Record<string, unknown>;
  return {
    planning: typeof candidate.planning === "boolean" ? candidate.planning : DEFAULT_AI_CONTEXT_PREFERENCES.planning,
    identity: typeof candidate.identity === "boolean" ? candidate.identity : DEFAULT_AI_CONTEXT_PREFERENCES.identity,
    dailyState: typeof candidate.dailyState === "boolean" ? candidate.dailyState : DEFAULT_AI_CONTEXT_PREFERENCES.dailyState,
    conversationHistory: typeof candidate.conversationHistory === "boolean" ? candidate.conversationHistory : DEFAULT_AI_CONTEXT_PREFERENCES.conversationHistory,
  };
}

/** A display name is identity data and must not reach the prompt by default. */
export function resolveAIVisibleDisplayName(preferences: unknown, displayName: unknown): string {
  const resolved = resolveAIContextPreferences(preferences);
  return resolved.identity && typeof displayName === "string" && displayName.trim()
    ? displayName.trim()
    : "Player";
}
