import { describe, expect, it } from "vitest";
import { inspectKosherPackageText } from "../client/src/lib/kosher-package-check";

describe("on-device kosher package check", () => {
  it("surfaces only possible textual marks and never turns OCR into certification", () => {
    expect(inspectKosherPackageText("Certified OU-D · Star-K")).toMatchObject({
      matches: [{ key: "ou" }, { key: "star_k" }],
      disclosure: expect.stringContaining("OCR hint only"),
    });
  });

  it("keeps absent or unreadable mark text unknown rather than non-kosher", () => {
    const result = inspectKosherPackageText("Nutrition Facts\nProtein 8g");
    expect(result.matches).toEqual([]);
    expect(result.disclosure).toContain("does not mean the product is non-kosher");
  });
});
