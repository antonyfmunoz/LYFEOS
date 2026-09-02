export type KosherPackageMark = {
  key: "ou" | "star_k" | "kof_k" | "generic_kosher";
  label: string;
};

export type KosherPackageCheck = {
  matches: KosherPackageMark[];
  disclosure: string;
};

// OCR can help a person find text around a package mark, but it cannot prove
// that an image shows a current, valid certification. Keep matching narrow and
// return a possible mark rather than a kosher determination.
export function inspectKosherPackageText(value: string): KosherPackageCheck {
  const text = value.normalize("NFKD").toLocaleLowerCase("en-US");
  const matches: KosherPackageMark[] = [];
  if (/\b(?:ou|orthodox\s+union)(?:[-\s]?(?:d|p|pareve|parve))?\b/i.test(text)) matches.push({ key: "ou", label: "Possible OU mark" });
  if (/\bstar[-\s]?k\b/i.test(text)) matches.push({ key: "star_k", label: "Possible Star-K mark" });
  if (/\bkof[-\s]?k\b/i.test(text)) matches.push({ key: "kof_k", label: "Possible Kof-K mark" });
  if (/\bkosher\b/i.test(text)) matches.push({ key: "generic_kosher", label: "Possible kosher wording" });
  return {
    matches,
    disclosure: matches.length
      ? "This is an OCR hint only. Visually confirm the actual mark is printed on this exact package, then apply any personal standards for dairy, pareve, Passover, or certifying agency."
      : "No recognizable kosher-mark text was found. This does not mean the product is non-kosher; some marks are logos that text reading cannot recognize.",
  };
}
