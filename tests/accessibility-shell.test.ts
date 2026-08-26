import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("shared accessibility shell", () => {
  it("provides a keyboard skip link and a focusable main landmark", () => {
    const layout = readFileSync(resolve(process.cwd(), "client/src/components/layout/RootLayout.tsx"), "utf8");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain("Skip to main content");
    expect(layout).toContain('<main id="main-content"');
    expect(layout).toContain("tabIndex={-1}");
  });

  it("keeps desktop and mobile primary navigation discoverable to assistive technology", () => {
    const mobile = readFileSync(resolve(process.cwd(), "client/src/components/layout/MobileNav.tsx"), "utf8");
    const sidebar = readFileSync(resolve(process.cwd(), "client/src/components/layout/Sidebar.tsx"), "utf8");
    expect(mobile).toContain('aria-label="Primary navigation"');
    expect(mobile).toContain('aria-label={isOpen ? "Close navigation" : "Open navigation"}');
    expect(mobile).toContain('e.key === "Enter" || e.key === " "');
    expect(sidebar).toContain('aria-label="Primary navigation"');
    expect(sidebar).toContain('aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}');
  });

  it("keeps the desktop assistant controls keyboard and screen-reader operable", () => {
    const assistant = readFileSync(resolve(process.cwd(), "client/src/components/ai/AICompanionPanel.tsx"), "utf8");
    expect(assistant).toContain('aria-label={`Chat with ${aiCompanionName}`}');
    expect(assistant).toContain('aria-label="Save assistant name"');
    expect(assistant).toContain('aria-label={`Open chat: ${chat.title}`}');
    expect(assistant).toContain('e.key === "Enter" || e.key === " "');
    expect(assistant).toContain('aria-label="Send message"');
  });

  it("keeps the public waitlist forms and FAQ semantically operable", () => {
    const waitlist = readFileSync(resolve(process.cwd(), "client/src/pages/WaitlistPage.tsx"), "utf8");
    expect(waitlist).toContain("<main>");
    expect(waitlist).toContain('<label htmlFor={id} className="sr-only">Email address</label>');
    expect(waitlist).toContain("aria-invalid={Boolean(error)}");
    expect(waitlist).toContain('role="alert"');
    expect(waitlist).toContain("aria-expanded={open}");
    expect(waitlist).toContain("aria-controls={answerId}");
  });
});
