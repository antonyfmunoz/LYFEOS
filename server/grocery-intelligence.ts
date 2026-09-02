import { lookupBrandOwnership } from "./brand-ownership";

export type ReceiptItem = {
  name: string;
  brand: string | null;
  quantity: number;
  unit: string;
  location: string | null;
  expiresOn: string | null;
  reorderAt: number | null;
};

export function parseReceiptText(sourceText: string): ReceiptItem[] {
  const ignored = /\b(subtotal|total|tax|change|cash|visa|mastercard|debit|credit|balance|coupon|discount|savings|thank you)\b/i;
  const results: ReceiptItem[] = [];
  for (const rawLine of sourceText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (line.length < 2 || ignored.test(line)) continue;
    const withoutPrice = line.replace(/(?:\s+|^)(?:\$?\d{1,4}(?:\.\d{2})?|\d{1,4},\d{2})\s*$/, "").trim();
    const quantityMatch = withoutPrice.match(/^(\d+(?:\.\d+)?)\s*(?:x|@)\s+(.+)$/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
    const name = (quantityMatch ? quantityMatch[2] : withoutPrice).replace(/^\d+\s+/, "").trim();
    if (name.length < 2 || !/[a-z]/i.test(name) || !Number.isFinite(quantity) || quantity <= 0) continue;
    results.push({ name: name.slice(0, 200), brand: null, quantity: Math.min(quantity, 100_000), unit: "item", location: null, expiresOn: null, reorderAt: 0 });
    if (results.length === 100) break;
  }
  return results;
}

export function ownershipScore(items: Array<{ brand: string | null }>) {
  return ownershipScoreFromProfiles(items.map((item) => item.brand ? lookupBrandOwnership(item.brand).profile : null));
}

export function ownershipScoreFromProfiles(profiles: Array<ReturnType<typeof lookupBrandOwnership>["profile"]>) {
  const matched = profiles.filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  const corporate = matched.filter((profile) => profile.status === "corporate_owned" || profile.status === "public_company");
  const parentCounts = new Map<string, number>();
  for (const profile of matched) {
    const parent = profile.ownershipChain.at(-1)?.name || profile.brand;
    parentCounts.set(parent, (parentCounts.get(parent) || 0) + 1);
  }
  const largestParent = Array.from(parentCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] || null;
  const corporateShare = matched.length ? corporate.length / matched.length : null;
  const largestParentShare = matched.length && largestParent ? largestParent[1] / matched.length : null;
  const score = corporateShare === null || largestParentShare === null ? null : Math.round((corporateShare * 0.7 + largestParentShare * 0.3) * 100);
  return {
    score,
    matchedItems: matched.length,
    unmatchedItems: profiles.length - matched.length,
    corporateOwnedItems: corporate.length,
    largestParent: largestParent ? { name: largestParent[0], itemCount: largestParent[1] } : null,
    formula: "70% of the score is the share of matched active pantry items owned by corporate/public companies; 30% is the share held by the single largest documented parent. It is an ownership-concentration snapshot, not a health, quality, ethical, or spending score.",
    confidence: matched.length >= 3 ? "informative" : matched.length ? "preliminary" : "insufficient",
  };
}
