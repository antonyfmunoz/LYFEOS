#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "$0")/.." && pwd)"
build_dir="$root_dir/.build/release"
output_dir="${OUTPUT_DIR:-$root_dir/dist}"
app_dir="$output_dir/LyfeOS Messages.app"
swift build --package-path "$root_dir" -c release
rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
cp "$build_dir/LyfeOSMessages" "$app_dir/Contents/MacOS/LyfeOSMessages"
cp "$root_dir/Resources/Info.plist" "$app_dir/Contents/Info.plist"
codesign --force --deep --sign "${DEVELOPER_ID_APPLICATION:--}" "$app_dir"
echo "Packaged $app_dir"
