import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const overlay = readFileSync(resolve(process.cwd(), "client/src/components/VoiceOverlay.tsx"), "utf8");
const archive = readFileSync(resolve(process.cwd(), "client/src/components/ai/VoiceSessionArchive.tsx"), "utf8");
const acceptance = readFileSync(resolve(process.cwd(), "scripts/production-voice-browser-acceptance.ts"), "utf8");
const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/production-browser-acceptance.yml"), "utf8");
const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");

describe("durable Voice overlay lifecycle", () => {
  it("retains only an opaque active-session reference across a browser reload", () => {
    expect(overlay).toContain('const ACTIVE_VOICE_SESSION_KEY = "lyfeos-active-voice-session-v1"');
    expect(overlay).toContain("window.sessionStorage.setItem(ACTIVE_VOICE_SESSION_KEY, JSON.stringify(session))");
    expect(overlay).toContain('apiRequest<{ session: VoiceSessionRecord }>(`/api/ai/voice-sessions/${stored.id}`)');
    expect(overlay).toContain('data.session.status === "active" && data.session.version === stored.version');
    expect(overlay).not.toContain("useEffect(() => () => { void completeVoiceSession(); }");
  });

  it("does not create an empty record before the browser supplies a transcript", () => {
    const openBranch = overlay.slice(overlay.indexOf("} else {\n      setShowOverlay(true)"), overlay.indexOf("}, [showOverlay"));
    expect(openBranch).toContain("await restoreVoiceSession()");
    expect(openBranch).not.toContain("await createVoiceSession()");
    expect(overlay).toContain('await createVoiceSession();\n        await appendVoiceSegment("user", finalTranscript);');
  });

  it("keeps failed completion recoverable and exposes labelled pause and stop controls", () => {
    const completion = overlay.slice(overlay.indexOf("const completeVoiceSession"), overlay.indexOf("const handleCommand"));
    expect(completion.indexOf("voiceSessionRef.current = null")).toBeGreaterThan(completion.indexOf("await apiRequest"));
    expect(completion).toContain("storeVoiceSession(null)");
    expect(overlay).toContain('data-testid="voice-pause-resume"');
    expect(overlay).toContain('aria-label={isListening ? "Pause dictation" : "Resume dictation"}');
    expect(overlay).toContain('data-testid="voice-stop"');
    expect(overlay).toContain('aria-label="Stop and close"');
    expect(overlay).toContain("disabled={isProcessing}");
  });

  it("registers the cross-tree launch listener before the first rendered click", () => {
    expect(overlay).toContain("useLayoutEffect(() => {");
    expect(overlay).toContain("window.addEventListener('toggle-voice-control', handler)");
    expect(overlay).toContain("window.removeEventListener('toggle-voice-control', handler)");
  });

  it("has an exact-source disposable production browser contract with truthful provider boundaries", () => {
    expect(acceptance).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    expect(acceptance).toContain('BASE_URL.origin === "https://lyfeos.net"');
    expect(acceptance).toContain('"lyfeos.production-voice-browser.v1"');
    expect(acceptance).toContain("LYFEOS_ACCEPTANCE_SOURCE");
    expect(acceptance).toContain("LYFEOS_ACCEPTANCE_HARNESS_SOURCE");
    expect(acceptance).toContain('new URL(intercepted.url()).pathname === "/api/voice-command"');
    expect(acceptance).toContain("The command response is deliberately intercepted with a fixed content-free provider stub");
    expect(acceptance).toContain("__lyfeosAcceptanceVoiceToggleCount");
    expect(acceptance).toContain("Voice overlay did not open after its rendered launch control dispatched");
    expect(acceptance).toContain('button[aria-label="Skip this tutorial"]');
    expect(acceptance).toContain("tutorialDismissed");
    expect(acceptance).toContain("activateHitTestedControl");
    expect(acceptance).toContain("document.elementFromPoint");
    expect(acceptance).toContain('await waitForVoice(account, 4, "active", firstStored.id)');
    expect(acceptance).toContain('await waitForVoice(account, 4, "completed", firstStored.id)');
    expect(acceptance).toContain("cleanup.accountErased = cleanup.sessionInvalidated && cleanup.emailReleased && cleanup.displayNameReleased");
    expect(workflow).toContain("Run disposable production Voice acceptance");
    expect(workflow).toContain("run: npm run acceptance:production-voice");
    expect(packageJson).toContain('"acceptance:production-voice"');
    expect(archive).toContain('data-testid="voice-session-archive"');
    expect(archive).toContain('data-testid={`voice-session-record-${session.id}`}');
  });
});
