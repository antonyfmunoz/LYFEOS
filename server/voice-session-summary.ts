export interface VoiceSummarySegment {
  id: string;
  speaker: "user" | "assistant";
  transcript: string;
}

export interface ExtractedActionItem {
  text: string;
  sourceSegmentId: string;
  owner: "user" | "assistant" | "shared" | "unspecified";
  status: "open";
}

function sentences(value: string): string[] {
  return value
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim().replace(/^[\-•]\s*/, ""))
    .filter((part) => part.length >= 8);
}

function inferOwner(text: string): ExtractedActionItem["owner"] {
  if (/^(?:i|i'll|i will|i need|i should|i must)\b/i.test(text)) return "user";
  if (/^(?:you|you'll|you will|you need|you should|you must)\b/i.test(text)) return "assistant";
  if (/^(?:we|we'll|we will|we need|we should|we must|let's)\b/i.test(text)) return "shared";
  return "unspecified";
}

export function buildExtractiveVoiceSummary(segments: VoiceSummarySegment[]): {
  summary: string;
  keyPoints: string[];
  actionItems: ExtractedActionItem[];
} {
  const userSegments = segments.filter((segment) => segment.speaker === "user");
  const allSentences = userSegments.flatMap((segment) => sentences(segment.transcript));
  const unique = Array.from(new Map(allSentences.map((sentence) => [sentence.toLocaleLowerCase("en-US"), sentence])).values());
  const keyPoints = unique.slice(0, 6);
  const actionPattern = /\b(?:need to|needs to|should|must|have to|will|action item|follow up|next step|let's)\b/i;
  const actionItems: ExtractedActionItem[] = [];
  const seenActions = new Set<string>();
  for (const segment of userSegments) {
    for (const sentence of sentences(segment.transcript)) {
      if (!actionPattern.test(sentence)) continue;
      const key = sentence.toLocaleLowerCase("en-US");
      if (seenActions.has(key)) continue;
      seenActions.add(key);
      actionItems.push({ text: sentence, sourceSegmentId: segment.id, owner: inferOwner(sentence), status: "open" });
      if (actionItems.length === 12) break;
    }
    if (actionItems.length === 12) break;
  }
  return {
    summary: keyPoints.length ? keyPoints.join(" ") : "No substantive user transcript was captured.",
    keyPoints,
    actionItems,
  };
}
