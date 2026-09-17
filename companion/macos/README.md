# LyfeOS Messages for Mac

LyfeOS Messages is a native, user-owned Mac companion for the unified LyfeOS
Messages inbox. It pairs from a one-time code generated in **Profile →
Connections**, remains available from the Mac menu bar, and starts at login when
the person chooses that option. No one should need to use Terminal to pair or
operate it.

## What the person does

1. On iPhone and Mac, sign in to Messages with the same Apple Account and enable
   the iPhone number in Messages. In iPhone Settings, turn on **Text Message
   Forwarding** for the Mac when the person also wants their phone text history
   available there.
2. In LyfeOS, open **Profile → Connections → iMessage → Pair Mac**.
3. Open **LyfeOS Messages.app**, paste the one-time code, and choose **Pair this
   Mac**.
4. Grant **Full Disk Access** only if message-history sync is desired. macOS asks
   separately before the app can automate Messages to send.

The one-time pairing code expires in ten minutes. The bridge token is stored
locally in the person's Application Support folder with owner-only permissions.
Disconnecting in LyfeOS revokes the server-side token; disconnecting in the Mac
app removes its local token.

## Privacy and platform boundary

- This is a private local relay: it never asks for, stores, or transmits an
  Apple Account password.
- The selected sending identity is controlled in **Messages → Settings →
  iMessage** on the Mac. The optional label in LyfeOS Messages is local display
  context only; it is not a claim that LyfeOS verified a telephone number.
- The current relay imports one-to-one Messages rows and sends iMessages through
  the person's installed Messages app. It does not claim direct iPhone access,
  group-thread support, attachments, or personal RCS access.

## Release packaging

The source builds as the `LyfeOSMessages` macOS application binary. A user
release must be distributed as a notarized `LyfeOS Messages.app` / DMG signed
with the LyfeOS Apple Developer **Developer ID Application** certificate. That
certificate and notarization credentials are intentionally not present in this
repository.
