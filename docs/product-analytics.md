# Product analytics contract

LyfeOS product analytics is optional and off by default. It is separate from the private Tracker/Analytics screens that analyze a user's own LyfeOS records.

## Collected after explicit opt-in

- app session started;
- coarse app area viewed;
- onboarding completed;
- mission created, completed, or reopened;
- mission evidence submitted;
- mission review completed, with only the bounded outcome;
- transformation focus completed.

No event includes message, mission, evidence, Health, profile, journal, document, or AI content. Automatic click capture, session replay, browser exception capture, precise URLs, and person properties are disabled. The client removes URL, referrer, campaign, location, and IP properties from its event payload; the PostHog project must also enable **Discard client IP data** as an operational control.

## Consent and deletion

Every enablement creates a new random analytics subject. Withdrawal stops client capture, retires that subject, and queues provider-side person/event deletion. Account deletion queues every subject before removing the local account. A subject queued for deletion is never reused.

PostHog processes event deletion asynchronously. The LyfeOS deletion worker waits at least 15 minutes for in-flight ingestion, requires an exact distinct-ID match, requests person, event, and recording deletion, and retains a content-free retry receipt until PostHog accepts the request or an exact lookup confirms that no matching person exists.

## Required production configuration

Capture stays unavailable unless all five values are configured:

- `POSTHOG_PROJECT_KEY` — public project token;
- `POSTHOG_HOST` — HTTPS ingestion origin, such as `https://us.i.posthog.com`;
- `POSTHOG_PROJECT_ID` — PostHog project ID;
- `POSTHOG_PERSONAL_API_KEY` — server-only key authorized to read/delete persons;
- `POSTHOG_ADMIN_HOST` — HTTPS API origin, such as `https://us.posthog.com`.

The personal API key is never included in browser runtime configuration or logs. Production activation additionally requires a received-event check, withdrawal/deletion drill, deletion-status receipt, retention decision, access review, and approved privacy language.

## Provider control-plane state (2026-08-26)

The dedicated PostHog project exists, but production capture remains intentionally unavailable. A live provider audit found that the project still permits automatic capture, client IP retention, console/performance capture, session recording, and heatmaps. Those provider defaults conflict with this contract even though the LyfeOS SDK also disables the corresponding browser features. No LyfeOS event has been ingested, and Fly does not yet hold the five required PostHog values. Do not configure only the public project token: provider-side deletion requires the server-only project ID, personal API key, and admin host as one complete activation unit.

A restricted, pinned provider dashboard named **LYFEOS Privacy-Safe Lifecycle** now contains three saved definitions: consented lifecycle event volume, a post-consent session-to-Mission activation funnel, and bounded Mission-review outcomes. Their descriptions explicitly distinguish consented telemetry from registrations or total product activity. All currently return zero because collection is disabled; this is expected and is not evidence of zero application use.

Activation is complete only after an authorized project administrator disables autocapture, session recording, console/performance capture and heatmaps; enables client-IP discard; chooses and records provider retention; creates a least-privilege deletion-capable personal API key; installs all five Fly secrets together; approves the privacy language; opts in a test account; observes one allowed event and no blocked content/properties; withdraws consent; and retains the accepted person/event/recording deletion receipt. If any step fails, remove the five secrets together and keep capture unavailable.
