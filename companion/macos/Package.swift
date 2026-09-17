// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "LyfeOSMessagesBridge",
  platforms: [.macOS(.v13)],
  products: [.executable(name: "LyfeOSMessages", targets: ["LyfeOSMessagesBridge"])],
  targets: [.executableTarget(name: "LyfeOSMessagesBridge", linkerSettings: [.linkedLibrary("sqlite3")])]
)
