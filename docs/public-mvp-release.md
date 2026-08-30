# Public MVP release gate

LyfeOS is ready to be considered a public-MVP candidate only after every item below is complete in the target environment. The supported launch journey is: sign up or sign in through Clerk, complete onboarding, create and manage missions, and view the dashboard.

## Pre-deploy configuration

Store these as deployment secrets, not in Git:

```text
DATABASE_URL
SESSION_SECRET
CLERK_SECRET_KEY
CLERK_WEBHOOK_SIGNING_SECRET
GOOGLE_OAUTH_CLIENT_ID                 # only if Google Calendar is enabled
GOOGLE_OAUTH_CLIENT_SECRET             # only if Google Calendar is enabled
GOOGLE_OAUTH_REDIRECT_URI              # https://lyfeos.net/api/google/callback in production
INTEGRATION_PROVIDER_CREDENTIAL_KEY     # independent random 32 bytes, base64; required for Google
HEALTH_PROVIDER_CREDENTIAL_KEY          # independent random 32 bytes, base64; required for direct Health OAuth
OURA_CLIENT_ID                          # only if direct Oura sync is enabled
OURA_CLIENT_SECRET                      # only if direct Oura sync is enabled
OURA_REDIRECT_URI                       # https://lyfeos.net/api/health-connections/oura/callback in production
SENTRY_DSN                             # enable server and browser error reporting
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=<immutable release id>
LYFEOS_MONITOR_TOKEN                  # same independent 32+ character value in Fly and GitHub Actions
POSTHOG_PROJECT_KEY                   # optional; public LYFEOS project token
POSTHOG_HOST                          # optional; HTTPS ingestion origin, for example https://us.i.posthog.com
POSTHOG_PROJECT_ID                    # optional; exact LYFEOS project ID
POSTHOG_PERSONAL_API_KEY              # optional; server-only project:read/person:read/person:write key
POSTHOG_ADMIN_HOST                    # optional; HTTPS API origin, for example https://us.posthog.com
UMH_FEDERATION_INSTALLATION_ID         # only if UMH is enabled
UMH_FEDERATION_TENANT_ID               # only if UMH is enabled
UMH_FEDERATION_KEY_ID                  # only if UMH is enabled
UMH_FEDERATION_SHARED_SECRET           # only if UMH is enabled
UMH_CONTROL_PLANE_URL                  # only for outbound UMH delivery
```

Build the client with a production Clerk publishable key. Provide it through the deployment runtime configuration; `fly.toml` intentionally contains no publishable key.

## Database and Clerk

1. Publish approved Terms of Service and Privacy Policy at the registration links before collecting contractual consent. Do not substitute placeholder content.
2. Back up the production database.
3. The Fly release command applies the idempotent release migrations before the new app version receives traffic, including `0025_ai_context_preferences`, `0026_mission_deferrals`, `0027_mission_dependencies`, and `0028_mission_evidence_confidence`. Confirm the release output records each new migration ID on first release and reports success on later releases. Apply any older, untracked migrations deliberately before enabling a new environment.
4. In Clerk, configure the production origin, redirect URLs, and a webhook at `https://<public-host>/api/webhooks/clerk` subscribed exactly to `user.created`, `user.updated`, and `user.deleted`.
5. Put Clerk's `whsec_...` signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`. The webhook fails closed until configured; first authenticated login still provisions a LyfeOS account if webhook delivery is delayed.
6. With a disposable authorized account, verify create and update result in one canonical LyfeOS user, stats record, profile, integration record, and daily log. Verify provider-only deletion invokes complete LyfeOS account erasure, while deletion of a Clerk identity linked to a local-password account preserves the locally owned account and unlinks only Clerk.

## Verification

Run this before deploying:

```bash
npm run verify
```

The client uses route-level code splitting. Keep the initial route bundle separate from feature pages; review the production build output when adding a new eager import.

The standard suite deliberately skips live API tests unless a running, isolated test environment is supplied:

```bash
LYFEOS_TEST_ENV=isolated LYFEOS_TEST_API_URL=https://staging.example.com npm test
```

The API-auth suite creates and deletes one test account. It will not run unless `LYFEOS_TEST_ENV=isolated` is set explicitly; never point it at production.

Run this acceptance pass on staging and production:

1. Create an account, sign in, and sign out.
2. Complete onboarding and refresh the page.
3. Create, edit, complete, restore, and delete a mission; confirm the dashboard and mission list agree after refresh.
4. Confirm one user cannot request another user's records by altering a user ID in a request.
5. Send an invalid Clerk webhook and confirm it returns `401`; send a signed, non-mutating `user.deleted` provider example and confirm successful delivery. Exercise create/update/delete only with a disposable user and confirm the lifecycle outcomes in the preceding section.
6. Complete all onboarding missions and confirm the dashboard shows one reviewable Transformation Thread derived from the saved onboarding profile. Activate it and confirm exactly three linked starter missions are created; verify no second active thread can be activated.
7. Add a prerequisite to a second mission and confirm it cannot be completed before its prerequisite; confirm a cycle is rejected. On a low-capacity day, defer an over-capacity recommended mission and confirm its due date changes while an audit row is recorded. Complete one linked mission, add the declared mission evidence, and record a positive review. Confirm activity XP appears on completion but skill XP, reviewed Thread evidence, and any capability progress appear only after the review. Save one daily reflection, record a weekly review, pause and resume the thread, then complete it with a closing reflection only after the readiness requirements are met.
8. From Profile settings, export data, clear chat history in a test account, reset the generated AI profile, and confirm account deletion requires the exact confirmation phrase.
9. Rename the AI companion and confirm its selected name is used by the chat and generated AI responses after refresh.
10. If UMH is enabled, perform one signed `lyfeos.mission.create.v1` command and confirm exactly one mission and one outbound event are recorded.
11. On an active Thread, create a mission with one or more unlocked skills selected. Confirm it receives a proof plan, its activity XP is awarded on completion, and its skill XP is applied only after evidence and a positive review. Confirm locked skills cannot be selected, and completed missions cannot have their skill mapping changed.
12. Ask the AI to make a medium-risk change (for example, edit or terminate a mission). Confirm it appears as a pending approval in Profile, approving it executes exactly once, and declining or expiry makes no change.
13. If product analytics is enabled, first verify the provider project discards client IPs, disables autocapture, replay, heatmaps, web vitals, console/performance/error capture, and enforces the approved raw-event retention. Then prove one explicit user opt-in, one allow-listed content-free event, withdrawal, the delayed deletion receipt, provider-side subject/event deletion, and fail-closed behavior when any provider setting drifts.

## Current immutable qualification receipt

As of 2026-08-30, Fly release 183 serves source `1c954b73221bcc6327ac0c14ad5e42ecb12c3ec6` from image `deployment-01M197J23VZEF7GBRZNC0A4J8R` with digest `sha256:334a8f88fef1aa1c59745519ef1482a43fe4217a8690a0429024f7c6f4892497`. Exact CI `33309328431` passed both required lanes, all 135 release migrations through `0143_cross_product_consent_lifecycle`, the authenticated and recovery journeys, collaboration, and deterministic logical backup/isolated restore. Monitor `33309678715` passed readiness, anonymous-auth isolation, immutable release/migration identity and protected Health integrity.

Protected production run `33309676126` passed all 88 desktop/mobile route-viewports and every domain journey: truthful Mission progression and reversal, onboarding, AI memory, Voice, Pattern Explorer, Personal Finance, Tables/Forms, Calendar, Sheets v11 with governed local XLSX and ODS review/import/export, Canvas, Search, Messages, Projects, Mission safety and two six-account collaboration lifecycles. Every step and evidence upload succeeded, and every disposable account/session/identifier cleanup passed. This receipt qualifies the automated source/CI/database/deployment/monitor/Chromium boundary. It does not qualify disabled providers, approved legal language, operating-system-native file behavior, physical devices, observed human assistive-technology use, managed-production scale, field performance or longitudinal outcomes.

Acceptance-only source `055e737271c79ef4beb0d64818efc2bd0907c325` subsequently passed both protected CI lanes in `33311579114` and protected production run `33311789197` without changing the deployed release-183 runtime. The source-pinned `lyfeos.production-mission-source-acceptance.v1` artifact proves fresh deployed canonical convergence for UI, onboarding, automatic To-Do conversion, concurrent Inbox retries, concurrent automation follow-up and Thread-created system Missions; exact export provenance; exactly one `mission_created` receipt per canonical Mission; replay/conflict guarantees; and complete account/session/identifier cleanup. AI, Google and signed UMH remain separate provider or external-ingress gates and are not qualified by this receipt.

Acceptance harness `35abe0190432ad848675eac47dc337e7df590664` passed protected CI `33314833191` and full protected production run `33315311965` against the unchanged release-183 runtime. The retained artifact at `.tmp-acceptance-33315311965/` verifies 88/88 route-viewports, zero failures or recoveries, every domain report, and real same-account second-tab conflicts for Sheets v12, Canvas v3 and Projects v2 on desktop and mobile: the second tab committed a competing revision and the stale first-tab save was visibly refused in all six journeys, followed by exact erasure of all six owner pairs. This is automated Chromium conflict-refusal evidence, not real-time coauthoring, physical-device, human assistive-technology, scale, field-latency or longitudinal evidence.

Calendar acceptance harness `ce585ada6c2a2c9fbfd332121679d686711a0ae8` passed protected CI `33317048258` and full protected production run `33317319275` against the same release-183 runtime. Retained artifact `.tmp-acceptance-33317319275/` verifies 88/88 route-viewports with zero failures or recoveries, every domain report, and Calendar v2 in desktop and mobile: an already-open second same-account tab committed a competing canonical Mission revision, the first tab's queued stale edit stopped as a visible conflict, explicit apply converged, both queues drained, and both disposable owners were erased with sessions invalidated and identifiers released. This is automated Chromium sequential-conflict and reconciliation evidence, not simultaneous active field editing, real-time coauthoring, service-worker/storage-eviction, physical-device, human assistive-technology, live-Google, scale, field-latency or longitudinal evidence.

## Launch scope

Calendar, Google, AI, document imports, and UMH are optional integrations for this MVP. Leave each disabled unless it has its own credentials, consent flow, and staging acceptance pass. The app remains functional as a standalone mission and life-organization product.
