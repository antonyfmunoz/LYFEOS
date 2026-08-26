export interface AffirmationSeed {
  displayName?: unknown;
  coreValues?: unknown;
  strengths?: unknown;
  desiredEmotion?: unknown;
  coreBelief?: unknown;
  vision90Day?: unknown;
  vision5Year?: unknown;
  primaryCraft?: unknown;
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 240) || fallback;
}

function cleanList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return values
    .map((entry) => cleanText(entry))
    .filter(Boolean)
    .slice(0, 3);
}

export function buildFoundationalAffirmation(seed: AffirmationSeed): string {
  const name = cleanText(seed.displayName, "Player");
  const values = cleanList(seed.coreValues);
  const strengths = cleanList(seed.strengths);
  const desiredEmotion = cleanText(seed.desiredEmotion);
  const coreBelief = cleanText(seed.coreBelief);
  const vision = cleanText(seed.vision90Day) || cleanText(seed.vision5Year);
  const craft = cleanText(seed.primaryCraft);

  const details = [
    values.length ? `Your commitment to ${values.join(", ")} keeps your choices aligned with who you are becoming.` : "Your values give direction to every choice you make.",
    strengths.length ? `You rely on ${strengths.join(", ")} as strengths you can practice and prove through action.` : "Your strengths become more real every time you practice them with intention.",
    coreBelief ? `You carry this belief forward: ${coreBelief}.` : "You trust your ability to learn, adapt, and become more capable.",
    vision ? `You move steadily toward your vision: ${vision}.` : craft ? `You develop your craft of ${craft} through focused, consistent work.` : "You turn your vision into reality through focused, consistent action.",
    desiredEmotion ? `You cultivate ${desiredEmotion} without waiting for circumstances to create it for you.` : "You choose the inner state that supports the life you are building.",
  ];

  return `${name}, you have chosen to make your growth visible and intentional. You are not waiting for a future version of yourself to begin; you are building that person through what you do today. ${details.join(" ")} ${name}, your progress counts even when it feels small. You meet the next mission with courage, honesty, and discipline. You are the author of your system, the evidence of your growth, and the person responsible for bringing your potential into reality.`;
}
