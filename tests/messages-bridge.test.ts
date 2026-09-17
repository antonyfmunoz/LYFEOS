import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("private iMessage bridge", () => {
  it("normalizes the paired Mac into the existing Messages hub", () => {
    const routes = read("server/routes/message-bridge.ts");
    const hub = read("server/routes/messages.ts");
    expect(routes).toContain('app.post("/api/message-bridge/pairings", isAuthenticated');
    expect(routes).toContain('app.post("/api/message-bridge/claim"');
    expect(routes).toContain('app.post("/api/message-bridge/events"');
    expect(routes).toContain('app.get("/api/message-bridge/commands"');
    expect(routes).toContain('provider: "imessage_bridge"');
    expect(hub).toContain('binding.provider === "imessage_bridge"');
    expect(hub).toContain("messageBridgeCommands");
  });

  it("keeps the companion local and revocable", () => {
    const companion = read("companion/macos/Sources/LyfeOSMessagesBridge/main.swift");
    const profile = read("client/src/components/profile/IMessageBridgeConnection.tsx");
    expect(companion).toContain("Library/Messages/chat.db");
    expect(companion).toContain("tell application \"Messages\"");
    expect(profile).toContain("/api/message-bridge/devices/${id}/revoke");
    expect(profile).toContain("unified Messages inbox");
  });
});
