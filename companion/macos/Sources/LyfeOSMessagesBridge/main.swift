import AppKit
import Combine
import Foundation
import ServiceManagement
import SQLite3
import SwiftUI

private struct BridgeConfig: Codable, Sendable {
  var server: String
  var deviceToken: String
  var lastRowID: Int64
  // A local label only; Messages remains the source of truth for the actual
  // Apple Account address or phone number used to send.
  var displayIdentity: String?
}

private struct ClaimResponse: Decodable { let deviceToken: String }
private struct CommandResponse: Decodable { let commands: [BridgeCommand] }
private struct BridgeCommand: Decodable { let id: String; let kind: String; let payload: CommandPayload }
private struct CommandPayload: Decodable { let recipientHandle: String; let body: String }

private enum BridgeError: LocalizedError {
  case message(String)
  var errorDescription: String? { if case let .message(value) = self { return value }; return nil }
}

private let configURL: URL = {
  let directory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/LyfeOSMessagesBridge", isDirectory: true)
  try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  return directory.appendingPathComponent("bridge.json")
}()

private func loadConfig() throws -> BridgeConfig {
  guard let data = try? Data(contentsOf: configURL) else { throw BridgeError.message("No paired Mac yet.") }
  return try JSONDecoder().decode(BridgeConfig.self, from: data)
}

private func saveConfig(_ config: BridgeConfig) throws {
  try JSONEncoder().encode(config).write(to: configURL, options: [.atomic])
  try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
}

private func request<T: Decodable>(_ url: URL, method: String = "GET", token: String? = nil, body: [String: Any]? = nil) throws -> T {
  var request = URLRequest(url: url)
  request.httpMethod = method
  request.setValue("application/json", forHTTPHeaderField: "Accept")
  if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
  if let body {
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
  }
  let semaphore = DispatchSemaphore(value: 0)
  var result: Result<Data, Error> = .failure(BridgeError.message("Network request did not start."))
  URLSession.shared.dataTask(with: request) { data, response, error in
    defer { semaphore.signal() }
    if let error { result = .failure(error); return }
    guard let response = response as? HTTPURLResponse, let data else { result = .failure(BridgeError.message("Bridge did not receive a response.")); return }
    guard (200..<300).contains(response.statusCode) else {
      let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "HTTP \(response.statusCode)"
      result = .failure(BridgeError.message(message)); return
    }
    result = .success(data)
  }.resume()
  guard semaphore.wait(timeout: .now() + 30) == .success else { throw BridgeError.message("LyfeOS did not respond. Check the connection and try again.") }
  return try JSONDecoder().decode(T.self, from: result.get())
}

private func post(_ url: URL, token: String, body: [String: Any]) throws {
  struct Empty: Decodable {}
  let _: Empty = try request(url, method: "POST", token: token, body: body)
}

private func quote(_ value: String) -> String { "\"\(value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n"))\"" }

private func sendMessage(to handle: String, body: String) throws {
  let script = """
  tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy \(quote(handle)) of targetService
    send \(quote(body)) to targetBuddy
  end tell
  """
  var error: NSDictionary?
  guard NSAppleScript(source: script)?.executeAndReturnError(&error) != nil else {
    throw BridgeError.message(error?[NSAppleScript.errorMessage] as? String ?? "Messages could not send this message.")
  }
}

private func isoDate(_ appleDate: Double) -> String {
  ISO8601DateFormatter().string(from: Date(timeIntervalSinceReferenceDate: appleDate > 100_000_000_000 ? appleDate / 1_000_000_000 : appleDate))
}

private func sync(_ config: inout BridgeConfig) throws {
  let path = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Messages/chat.db").path
  var database: OpaquePointer?
  guard sqlite3_open_v2(path, &database, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let database else {
    throw BridgeError.message("Full Disk Access is needed to import Messages history. Grant it to LyfeOS Messages in System Settings, then try again.")
  }
  defer { sqlite3_close(database) }
  let sql = """
  SELECT m.ROWID, m.guid, COALESCE(m.text, ''), m.is_from_me, m.date,
    c.chat_identifier, COALESCE(NULLIF(c.display_name, ''), h.id, c.chat_identifier), h.id
  FROM message m JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
    JOIN chat c ON c.ROWID = cmj.chat_id LEFT JOIN handle h ON h.ROWID = m.handle_id
  WHERE m.ROWID > ? AND c.chat_identifier NOT LIKE 'chat%' ORDER BY m.ROWID ASC LIMIT 200
  """
  var statement: OpaquePointer?
  guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw BridgeError.message("Messages history could not be read.") }
  defer { sqlite3_finalize(statement) }
  sqlite3_bind_int64(statement, 1, config.lastRowID)
  let endpoint = URL(string: "\(config.server)/api/message-bridge/events")!
  var last = config.lastRowID
  while sqlite3_step(statement) == SQLITE_ROW {
    let rowID = sqlite3_column_int64(statement, 0)
    let guid = String(cString: sqlite3_column_text(statement, 1))
    let text = String(cString: sqlite3_column_text(statement, 2))
    let fromMe = sqlite3_column_int(statement, 3) == 1
    let timestamp = sqlite3_column_double(statement, 4)
    let thread = String(cString: sqlite3_column_text(statement, 5))
    let title = String(cString: sqlite3_column_text(statement, 6))
    let handle = sqlite3_column_text(statement, 7).map { String(cString: $0) }
    try post(endpoint, token: config.deviceToken, body: [
      "threadId": thread, "title": title, "recipientHandle": handle ?? NSNull(), "providerMessageId": guid,
      "direction": fromMe ? "outbound" : "inbound", "body": text, "occurredAt": isoDate(timestamp),
      "status": fromMe ? "sent" : "received",
    ])
    last = rowID
  }
  config.lastRowID = last
  try saveConfig(config)
}

private func deliver(_ config: BridgeConfig) throws {
  let endpoint = URL(string: "\(config.server)/api/message-bridge/commands")!
  let commands: CommandResponse = try request(endpoint, token: config.deviceToken)
  for command in commands.commands where command.kind == "send" {
    let completion = URL(string: "\(config.server)/api/message-bridge/commands/\(command.id)/complete")!
    do {
      try sendMessage(to: command.payload.recipientHandle, body: command.payload.body)
      try post(completion, token: config.deviceToken, body: ["state": "sent", "providerMessageId": NSNull(), "failureCode": NSNull()])
    } catch {
      try? post(completion, token: config.deviceToken, body: ["state": "failed", "providerMessageId": NSNull(), "failureCode": "MACOS_MESSAGES_SEND_FAILED"])
      throw error
    }
  }
}

@MainActor
private final class BridgeController: NSObject, ObservableObject {
  @Published var server = "https://lyfeos.net"
  @Published var pairingCode = ""
  @Published var displayIdentity = ""
  @Published private(set) var status = "Not connected"
  @Published private(set) var detail = "Pair this Mac from LyfeOS to keep your Messages relay private."
  @Published private(set) var isPaired = false
  @Published private(set) var isSyncing = false
  @Published private(set) var hasMessagesAccess = false
  @Published var launchAtLogin = false
  private var config: BridgeConfig?
  private var timer: Timer?

  override init() {
    super.init()
    launchAtLogin = SMAppService.mainApp.status == .enabled
    if let saved = try? loadConfig() { activate(saved) }
  }

  func pair() {
    let host = server.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let code = pairingCode.trimmingCharacters(in: .whitespacesAndNewlines)
    let identity = displayIdentity.trimmingCharacters(in: .whitespacesAndNewlines)
    guard URL(string: host)?.scheme == "https", code.count >= 32 else { status = "Pairing needs attention"; detail = "Enter an HTTPS LyfeOS address and the one-time code from Profile → Connections."; return }
    status = "Pairing Mac…"; detail = "Creating the private link."
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      do {
        let name = Host.current().localizedName ?? "My Mac"
        let claim: ClaimResponse = try request(URL(string: "\(host)/api/message-bridge/claim")!, method: "POST", body: ["pairingCode": code, "displayName": name, "publicKey": NSNull()])
        let paired = BridgeConfig(server: host, deviceToken: claim.deviceToken, lastRowID: 0, displayIdentity: identity)
        try saveConfig(paired)
        Task { @MainActor [weak self] in self?.activate(paired) }
      } catch {
        let reason = error.localizedDescription
        Task { @MainActor [weak self] in self?.status = "Could not pair"; self?.detail = reason }
      }
    }
  }

  func syncNow() {
    guard let current = config, !isSyncing else { return }
    isSyncing = true; status = "Syncing…"
    DispatchQueue.global(qos: .utility).async { [weak self] in
      var updated = current
      do {
        try sync(&updated); try deliver(updated)
        let checkedAt = Date().formatted(date: .omitted, time: .shortened)
        let syncedConfig = updated
        Task { @MainActor [weak self] in
          self?.config = syncedConfig; self?.isSyncing = false; self?.hasMessagesAccess = true; self?.status = "Connected"; self?.detail = "Private relay active · last checked \(checkedAt)"
        }
      } catch {
        let reason = error.localizedDescription
        Task { @MainActor [weak self] in self?.isSyncing = false; self?.hasMessagesAccess = false; self?.status = "Needs permission"; self?.detail = reason }
      }
    }
  }

  func saveIdentity() {
    guard var saved = config else { return }
    saved.displayIdentity = displayIdentity.trimmingCharacters(in: .whitespacesAndNewlines)
    do { try saveConfig(saved); config = saved; detail = "Local identity label saved. Apple Messages controls the actual sending identity." } catch { detail = error.localizedDescription }
  }

  func setLaunchAtLogin(_ enabled: Bool) {
    do { if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }; launchAtLogin = enabled }
    catch { launchAtLogin = false; detail = "Could not update launch at login: \(error.localizedDescription)" }
  }

  func disconnect() {
    timer?.invalidate(); timer = nil
    do { if FileManager.default.fileExists(atPath: configURL.path) { try FileManager.default.removeItem(at: configURL) }; config = nil; isPaired = false; pairingCode = ""; displayIdentity = ""; status = "Disconnected"; detail = "This Mac no longer holds a LyfeOS relay token. Revoke it in LyfeOS if you no longer recognize this device." }
    catch { detail = error.localizedDescription }
  }

  func openFullDiskAccess() { if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles") { NSWorkspace.shared.open(url) } }

  private func activate(_ saved: BridgeConfig) {
    config = saved; server = saved.server; displayIdentity = saved.displayIdentity ?? ""; isPaired = true; pairingCode = ""; status = "Connected"; detail = "Private relay enabled. Messages data flows only between this Mac and your LyfeOS account."
    if timer == nil {
      timer = Timer.scheduledTimer(timeInterval: 10, target: self, selector: #selector(runScheduledSync), userInfo: nil, repeats: true)
    }
    syncNow()
  }

  @objc private func runScheduledSync() { syncNow() }
}

private struct MainView: View {
  @ObservedObject var bridge: BridgeController
  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 6) { Text("LyfeOS Messages").font(.system(size: 28, weight: .semibold)); Text("Private iPhone Messages relay").foregroundStyle(.secondary) }
        Spacer(); StatusPill(label: bridge.status, healthy: bridge.isPaired && bridge.hasMessagesAccess)
      }
      GroupBox("Connection") {
        VStack(alignment: .leading, spacing: 12) {
          Text(bridge.detail).font(.callout).foregroundStyle(.secondary)
          if !bridge.isPaired {
            TextField("LyfeOS address", text: $bridge.server); SecureField("One-time pairing code", text: $bridge.pairingCode)
            Button("Pair this Mac") { bridge.pair() }.buttonStyle(.borderedProminent).disabled(bridge.pairingCode.isEmpty)
          } else { HStack { Button(bridge.isSyncing ? "Syncing…" : "Sync now") { bridge.syncNow() }.disabled(bridge.isSyncing); Spacer(); Button("Disconnect", role: .destructive) { bridge.disconnect() } } }
        }.padding(.vertical, 4)
      }
      if bridge.isPaired { GroupBox("Your iPhone number") { VStack(alignment: .leading, spacing: 8) { Text("Select your phone number in Messages → Settings → iMessage → Start new conversations from. LyfeOS never receives your Apple Account password.").font(.callout).foregroundStyle(.secondary); HStack { TextField("Optional local label, e.g. +1 555 0100", text: $bridge.displayIdentity); Button("Save") { bridge.saveIdentity() } } }.padding(.vertical, 4) } }
      GroupBox("Permissions & reliability") { VStack(alignment: .leading, spacing: 10) { Label("Full Disk Access lets this app import one-to-one Messages history from this Mac.", systemImage: bridge.hasMessagesAccess ? "checkmark.shield.fill" : "lock.shield"); HStack { Button("Open Full Disk Access") { bridge.openFullDiskAccess() }; Toggle("Launch at login", isOn: Binding(get: { bridge.launchAtLogin }, set: { bridge.setLaunchAtLogin($0) })).toggleStyle(.switch) }; Text("macOS asks separately before LyfeOS can automate Messages to send. You can revoke either permission or disconnect this Mac at any time.").font(.footnote).foregroundStyle(.secondary) }.padding(.vertical, 4) }
      Spacer(minLength: 0)
    }.padding(24).frame(minWidth: 620, minHeight: 560)
  }
}

private struct StatusPill: View { let label: String; let healthy: Bool; var body: some View { Text(label).font(.caption.weight(.medium)).padding(.horizontal, 10).padding(.vertical, 6).background(healthy ? Color.green.opacity(0.16) : Color.orange.opacity(0.16)).foregroundStyle(healthy ? .green : .orange).clipShape(Capsule()) } }
private final class AppDelegate: NSObject, NSApplicationDelegate { func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false } }

@main
private struct LyfeOSMessagesBridgeApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var bridge = BridgeController()
  var body: some Scene {
    WindowGroup("LyfeOS Messages") { MainView(bridge: bridge) }
    MenuBarExtra("LyfeOS Messages", systemImage: "message.badge") { VStack(alignment: .leading, spacing: 8) { Text(bridge.status).font(.headline); Text(bridge.detail).font(.caption).foregroundStyle(.secondary); Divider(); Button("Sync now") { bridge.syncNow() }.disabled(!bridge.isPaired || bridge.isSyncing); Button("Open LyfeOS Messages") { NSApp.activate(ignoringOtherApps: true) }; Button("Quit") { NSApp.terminate(nil) } }.padding() }
  }
}
