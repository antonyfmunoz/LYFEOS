# LyfeOS Android Messages Bridge

This is the user-owned Android companion for the unified LyfeOS Messages inbox.
It pairs with a short-lived code from **Profile → Connections → Phone text
messages**, stores only its device token locally, and sends/receives **SMS** on
the paired phone after the person grants Android’s SMS permissions.

## Accuracy boundary

- It is an SMS bridge, not an assertion that LyfeOS can read or send RCS through
  Google Messages. Android does not offer third-party apps general access to
  Google Messages RCS history or delivery controls.
- It never accepts a carrier, Google, or phone-account password.
- The foreground notification makes the running bridge visible. Disconnecting
  the phone in LyfeOS revokes its token immediately.
- SMS delivery is only marked **sent** after Android accepts the dispatch. A
  carrier delivery confirmation is not yet represented as delivered or read.

## Build

Open `companion/android` in Android Studio, install on the person’s Android
phone, create a pairing code in LyfeOS, then paste it into the companion. The
phone asks for its permissions; declining them leaves that capability disabled.
