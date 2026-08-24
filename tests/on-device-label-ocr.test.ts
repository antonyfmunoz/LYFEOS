import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeDetectedLabelText } from "../client/src/lib/on-device-label-ocr";

describe("on-device ingredient label OCR normalization", () => {
  it("orders detected blocks visually and preserves label punctuation for explicit review", () => {
    expect(normalizeDetectedLabelText([
      { rawValue: "salt)", boundingBox: { x: 90, y: 20 } },
      { rawValue: "Ingredients: water,", boundingBox: { x: 10, y: 10 } },
      { rawValue: "oats; flavor (vanilla,", boundingBox: { x: 10, y: 20 } },
    ])).toEqual({ text: "Ingredients: water, oats; flavor (vanilla, salt)", truncated: false });
  });

  it("removes empty OCR blocks and reports bounded truncation", () => {
    expect(normalizeDetectedLabelText([{ rawValue: "  " }, { rawValue: "Ingredients: oats, water" }], 12)).toEqual({ text: "Ingredients:", truncated: true });
  });

  it("keeps OCR on-device, review-first, and server-attributed as photo capture", () => {
    const scanner = readFileSync(resolve(process.cwd(), "client/src/components/health/IngredientScanner.tsx"), "utf8");
    const routes = readFileSync(resolve(process.cwd(), "server/routes/ingredient-scanner.ts"), "utf8");
    expect(scanner).toContain("TextDetectorApi");
    expect(scanner).toContain("photos are not uploaded");
    expect(scanner).toContain("only an editable draft until you review and save it");
    expect(routes).toContain('z.enum(["manual_label", "photo_ocr"])');
  });
});
