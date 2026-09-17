import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("private device message bridges", () => {
  it("normalizes paired personal devices into the existing Messages hub", () => {
    const routes = read("server/routes/message-bridge.ts");
    const hub = read("server/routes/messages.ts");
    const migration = read("migrations/0165_multi_device_message_bridge_threads.sql");
    expect(routes).toContain('app.post("/api/message-bridge/pairings", isAuthenticated');
    expect(routes).toContain('app.post("/api/message-bridge/claim"');
    expect(routes).toContain('app.post("/api/message-bridge/events"');
    expect(routes).toContain('app.post("/api/message-bridge/conversations", isAuthenticated');
    expect(routes).toContain('app.get("/api/message-bridge/commands"');
    expect(routes).toContain('provider: "imessage_bridge"');
    expect(routes).toContain('provider: "android_sms_bridge"');
    expect(routes).toContain('channelKind: "sms"');
    expect(hub).toContain('binding.provider !== "native" && Boolean(binding.connectionRef)');
    expect(hub).toContain("messageBridgeCommands");
    expect(routes).toContain("draftThreadId");
    expect(routes).toContain("if (input.conversationId)");
    expect(hub).toContain("channelBindingId");
    expect(hub).toContain("ConversationChannelUnified.v1");
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS "message_bridge_threads_conversation_unique"');
    expect(migration).toContain('message_bridge_threads_device_conversation_unique');
  });

  it("keeps the companions local, capability-bounded, and revocable", () => {
    const companion = read("companion/macos/Sources/LyfeOSMessagesBridge/main.swift");
    const android = read("companion/android/app/src/main/java/net/lyfeos/messagesbridge/BridgeClient.kt");
    const androidReadme = read("companion/android/README.md");
    const profile = read("client/src/components/profile/IMessageBridgeConnection.tsx");
    expect(companion).toContain("Library/Messages/chat.db");
    expect(companion).toContain("tell application \"Messages\"");
    expect(companion).toContain("MenuBarExtra");
    expect(companion).toContain("SMAppService.mainApp");
    expect(companion).toContain("Pair this Mac");
    expect(profile).toContain("/api/message-bridge/devices/${id}/revoke");
    expect(profile).toContain("unified Messages inbox");
    expect(android).toContain("SmsManager.getDefault().sendTextMessage");
    expect(androidReadme).toContain("not an assertion that LyfeOS can read or send RCS");
  });

  it("ships the Mac bridge as an app-ready companion rather than a user terminal workflow", () => {
    const readme = read("companion/macos/README.md");
    const packageScript = read("companion/macos/scripts/package-app.sh");
    const infoPlist = read("companion/macos/Resources/Info.plist");
    expect(readme).toContain("No one should need to use Terminal");
    expect(packageScript).toContain("LyfeOS Messages.app");
    expect(infoPlist).toContain("net.lyfeos.messages");
  });
});
