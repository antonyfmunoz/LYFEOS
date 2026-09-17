import Foundation
import SQLite3

struct BridgeConfig: Codable {
  var server: String
  var deviceToken: String
  var lastRowID: Int64
}

struct ClaimResponse: Decodable { let deviceToken: String }
struct CommandResponse: Decodable { let commands: [BridgeCommand] }
struct BridgeCommand: Decodable { let id: String; let kind: String; let payload: CommandPayload }
struct CommandPayload: Decodable { let recipientHandle: String; let body: String }

enum BridgeError: LocalizedError {
  case message(String)
  var errorDescription: String? { switch self { case .message(let text): return text } }
}

let configURL: URL = {
  let directory = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/LyfeOSMessagesBridge", isDirectory: true)
  try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
  return directory.appendingPathComponent("bridge.json")
}()

func loadConfig() throws -> BridgeConfig {
  guard let data = try? Data(contentsOf: configURL) else { throw BridgeError.message("No paired bridge found. Run `pair` first.") }
  return try JSONDecoder().decode(BridgeConfig.self, from: data)
}

func saveConfig(_ config: BridgeConfig) throws {
  let data = try JSONEncoder().encode(config)
  try data.write(to: configURL, options: [.atomic])
  try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
}

func request<T: Decodable>(_ url: URL, method: String = "GET", token: String? = nil, body: [String: Any]? = nil) throws -> T {
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
    guard let http = response as? HTTPURLResponse, let data else { result = .failure(BridgeError.message("Bridge did not receive a response.")); return }
    guard (200..<300).contains(http.statusCode) else {
      let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "HTTP \(http.statusCode)"
      result = .failure(BridgeError.message(message)); return
    }
    result = .success(data)
  }.resume()
  _ = semaphore.wait(timeout: .now() + 30)
  return try JSONDecoder().decode(T.self, from: result.get())
}

func postNoContent(_ url: URL, token: String, body: [String: Any]) throws {
  struct Empty: Decodable {}
  let _: Empty = try request(url, method: "POST", token: token, body: body)
}

func shellQuote(_ text: String) -> String { "\"\(text.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n"))\"" }

func sendMessage(to handle: String, body: String) throws {
  // Automation permission is requested by macOS on first use. This intentionally
  // delegates delivery to the user's Messages app rather than imitating Apple APIs.
  let source = """
  tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy \(shellQuote(handle)) of targetService
    send \(shellQuote(body)) to targetBuddy
  end tell
  """
  var error: NSDictionary?
  guard NSAppleScript(source: source)?.executeAndReturnError(&error) != nil else {
    throw BridgeError.message(error?[NSAppleScript.errorMessage] as? String ?? "Messages could not send this message.")
  }
}

func isoDate(_ appleDate: Double) -> String {
  // chat.db stores seconds or nanoseconds after the Apple epoch (2001-01-01).
  let seconds = appleDate > 100_000_000_000 ? appleDate / 1_000_000_000 : appleDate
  return ISO8601DateFormatter().string(from: Date(timeIntervalSinceReferenceDate: seconds))
}

func syncMessages(_ config: inout BridgeConfig) throws {
  let database = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Messages/chat.db").path
  var db: OpaquePointer?
  guard sqlite3_open_v2(database, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, let db else {
    throw BridgeError.message("LyfeOS needs Full Disk Access to read Messages on this Mac. Grant it in System Settings, then run again.")
  }
  defer { sqlite3_close(db) }
  let query = """
  SELECT m.ROWID, m.guid, COALESCE(m.text, ''), m.is_from_me, m.date,
         c.chat_identifier, COALESCE(NULLIF(c.display_name, ''), h.id, c.chat_identifier), h.id
  FROM message m
  JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
  JOIN chat c ON c.ROWID = cmj.chat_id
  LEFT JOIN handle h ON h.ROWID = m.handle_id
  WHERE m.ROWID > ? AND c.chat_identifier NOT LIKE 'chat%'
  ORDER BY m.ROWID ASC LIMIT 200
  """
  var statement: OpaquePointer?
  guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK, let statement else { throw BridgeError.message("Messages database could not be queried.") }
  defer { sqlite3_finalize(statement) }
  sqlite3_bind_int64(statement, 1, config.lastRowID)
  let endpoint = URL(string: "\(config.server)/api/message-bridge/events")!
  var highest = config.lastRowID
  while sqlite3_step(statement) == SQLITE_ROW {
    let rowID = sqlite3_column_int64(statement, 0)
    let guid = String(cString: sqlite3_column_text(statement, 1))
    let text = String(cString: sqlite3_column_text(statement, 2))
    let fromMe = sqlite3_column_int(statement, 3) == 1
    let date = sqlite3_column_double(statement, 4)
    let threadID = String(cString: sqlite3_column_text(statement, 5))
    let title = String(cString: sqlite3_column_text(statement, 6))
    let handle = sqlite3_column_text(statement, 7).map { String(cString: $0) }
    // Keep the local cursor only after LyfeOS acknowledges the normalized event.
    try postNoContent(endpoint, token: config.deviceToken, body: [
      "threadId": threadID, "title": title, "recipientHandle": handle ?? NSNull(),
      "providerMessageId": guid, "direction": fromMe ? "outbound" : "inbound",
      "body": text, "occurredAt": isoDate(date), "status": fromMe ? "sent" : "received",
    ])
    highest = rowID
  }
  config.lastRowID = highest
  try saveConfig(config)
}

func executeCommands(_ config: BridgeConfig) throws {
  let endpoint = URL(string: "\(config.server)/api/message-bridge/commands")!
  let response: CommandResponse = try request(endpoint, token: config.deviceToken)
  for command in response.commands where command.kind == "send" {
    let completion = URL(string: "\(config.server)/api/message-bridge/commands/\(command.id)/complete")!
    do {
      try sendMessage(to: command.payload.recipientHandle, body: command.payload.body)
      try postNoContent(completion, token: config.deviceToken, body: ["state": "sent", "providerMessageId": NSNull(), "failureCode": NSNull()])
    } catch {
      try? postNoContent(completion, token: config.deviceToken, body: ["state": "failed", "providerMessageId": NSNull(), "failureCode": "MACOS_MESSAGES_SEND_FAILED"])
      throw error
    }
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
do {
  guard let command = arguments.first else { throw BridgeError.message("Use `pair --server https://lyfeos.net --code CODE` or `run`.") }
  if command == "pair" {
    guard let serverIndex = arguments.firstIndex(of: "--server"), arguments.indices.contains(serverIndex + 1), let codeIndex = arguments.firstIndex(of: "--code"), arguments.indices.contains(codeIndex + 1) else { throw BridgeError.message("Pair needs --server and --code.") }
    let server = arguments[serverIndex + 1].trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    let code = arguments[codeIndex + 1]
    let name = Host.current().localizedName ?? "My Mac"
    let claim: ClaimResponse = try request(URL(string: "\(server)/api/message-bridge/claim")!, method: "POST", body: ["pairingCode": code, "displayName": name, "publicKey": NSNull()])
    try saveConfig(BridgeConfig(server: server, deviceToken: claim.deviceToken, lastRowID: 0))
    print("LyfeOS Messages Bridge paired. Grant Full Disk Access and Messages Automation, then run `swift run LyfeOSMessagesBridge run`.")
  } else if command == "run" {
    var config = try loadConfig()
    while true {
      do { try syncMessages(&config); try executeCommands(config) }
      catch { fputs("LyfeOS bridge: \(error.localizedDescription)\n", stderr) }
      Thread.sleep(forTimeInterval: 10)
    }
  } else { throw BridgeError.message("Unknown command: \(command)") }
} catch { fputs("LyfeOS bridge: \(error.localizedDescription)\n", stderr); exit(1) }
