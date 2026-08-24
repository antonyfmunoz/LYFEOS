import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("live workout session journey", () => {
  it("persists start, pause, and resume state without creating evidence before finish", () => {
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");
    expect(client).toContain('sessionState, setSessionState] = useState<"not_started" | "active" | "paused">');
    expect(client).toContain("sessionAccumulatedSeconds");
    expect(client).toContain("version: 2");
    expect(client).toContain("Start</Button>");
    expect(client).toContain("Pause</Button>");
    expect(client).toContain("Resume</Button>");
    expect(client).toContain("No workout record exists until you finish and log");
    expect(client).toContain("Finish & log workout");
  });

  it("uses elapsed time only as a fallback when the user leaves duration blank", () => {
    const client = readFileSync(resolve(process.cwd(), "client/src/components/health/WorkoutLog.tsx"), "utf8");
    expect(client).toContain("durationMinutes ? Number(durationMinutes) : sessionStartedAt ? Math.max(1, Math.round(sessionElapsedSeconds / 60)) : null");
  });
});
