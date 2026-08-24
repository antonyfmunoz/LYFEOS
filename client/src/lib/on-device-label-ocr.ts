export type DetectedLabelTextBlock = {
  rawValue: string;
  boundingBox?: { x: number; y: number };
};

export function normalizeDetectedLabelText(blocks: DetectedLabelTextBlock[], maxLength = 20_000) {
  const ordered = [...blocks].sort((left, right) => {
    const leftY = Number.isFinite(left.boundingBox?.y) ? left.boundingBox!.y : 0;
    const rightY = Number.isFinite(right.boundingBox?.y) ? right.boundingBox!.y : 0;
    const leftX = Number.isFinite(left.boundingBox?.x) ? left.boundingBox!.x : 0;
    const rightX = Number.isFinite(right.boundingBox?.x) ? right.boundingBox!.x : 0;
    return leftY - rightY || leftX - rightX;
  });
  const normalized = ordered.map((block) => block.rawValue.trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return { text: normalized.slice(0, maxLength), truncated: normalized.length > maxLength };
}
