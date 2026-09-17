# LyfeOS Messages Bridge for Mac

This is the local transport for the unified LyfeOS Messages inbox. It uses the
Messages database on a Mac already signed into the person's Apple Account; it
does not ask for, store, or transmit an Apple Account password.

## Privacy boundary

- The person pairs the bridge with a short-lived code generated inside LyfeOS.
- The bridge stores its device token locally in the person's Application Support
  folder with owner-only permissions.
- macOS requires the person to grant **Full Disk Access** before this program can
  read `~/Library/Messages/chat.db`, and **Automation > Messages** before it can
  send a message. Declining either permission keeps that capability unavailable.
- LyfeOS can revoke the paired device at any time from Profile > Connections.

## Local development use

On the paired Mac, install Xcode Command Line Tools, then run:

```sh
cd companion/macos
swift run LyfeOSMessagesBridge pair --server https://lyfeos.net --code YOUR_PAIRING_CODE
swift run LyfeOSMessagesBridge run
```

`run` imports new one-to-one message rows into the same LyfeOS Messages inbox
and executes explicit messages queued from that inbox. This is intentionally a
user-owned Mac companion, not a cloud credential relay or an App Store client.

Group threads and attachments are not enabled by this first companion build;
they are never silently dropped into another channel.
