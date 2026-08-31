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

As of 2026-08-30, Fly release 202 serves source `0cab8758af99e64144492b758ba097787b898cd2` from image `deployment-01M1ATJBXNRZRJM1SH3NWR25R7` with digest `sha256:79a0e0dcdde5f004202485f90a2400db13ffe56dc6259ba6fb22e7d512abe640` and release ID `rel_76njzd04kxooyko3`. Exact runtime CI `33350738152` passed both required lanes, all 135 release migrations through `0143_cross_product_consent_lifecycle`, authenticated/recovery journeys and deterministic logical backup/isolated restore. Monitor `33351157983` passed readiness, anonymous-auth isolation, immutable release/migration identity and protected Health integrity.

Protected production run `33352407887` passed all 88 desktop/mobile route-viewports and every domain journey from the truthful Mission core loop through Search, including onboarding-derived Missions, Calendar offline/conflict recovery, Sheets, Canvas, Health offline and sparse Health Trends. It stopped in Messages when a valid route-chunk recovery raced a one-time harness marker read; both accounts were erased. Qualified harness `4491103c2f0954e7ef810d4578fd2126d922a080` passed both protected CI lanes in `33354362620`. Exact direct release-202 reports then passed Messages, Projects, Mission safety and both six-account collaboration lifecycles with every disposable account/session/identifier cleanup. This is honest composite qualification, not a claim that one monolithic run was green. It qualifies the automated source/CI/database/deployment/monitor/Chromium boundary; it does not qualify disabled providers, approved legal language, operating-system-native interactions, physical devices, observed human assistive-technology use, managed-production scale, field performance or longitudinal outcomes.

Acceptance-only source `055e737271c79ef4beb0d64818efc2bd0907c325` subsequently passed both protected CI lanes in `33311579114` and protected production run `33311789197` without changing the deployed release-183 runtime. The source-pinned `lyfeos.production-mission-source-acceptance.v1` artifact proves fresh deployed canonical convergence for UI, onboarding, automatic To-Do conversion, concurrent Inbox retries, concurrent automation follow-up and Thread-created system Missions; exact export provenance; exactly one `mission_created` receipt per canonical Mission; replay/conflict guarantees; and complete account/session/identifier cleanup. AI, Google and signed UMH remain separate provider or external-ingress gates and are not qualified by this receipt.

Acceptance harness `35abe0190432ad848675eac47dc337e7df590664` passed protected CI `33314833191` and full protected production run `33315311965` against the unchanged release-183 runtime. The retained artifact at `.tmp-acceptance-33315311965/` verifies 88/88 route-viewports, zero failures or recoveries, every domain report, and real same-account second-tab conflicts for Sheets v12, Canvas v3 and Projects v2 on desktop and mobile: the second tab committed a competing revision and the stale first-tab save was visibly refused in all six journeys, followed by exact erasure of all six owner pairs. This is automated Chromium conflict-refusal evidence, not real-time coauthoring, physical-device, human assistive-technology, scale, field-latency or longitudinal evidence.

Calendar acceptance harness `ce585ada6c2a2c9fbfd332121679d686711a0ae8` passed protected CI `33317048258` and full protected production run `33317319275` against the same release-183 runtime. Retained artifact `.tmp-acceptance-33317319275/` verifies 88/88 route-viewports with zero failures or recoveries, every domain report, and Calendar v2 in desktop and mobile: an already-open second same-account tab committed a competing canonical Mission revision, the first tab's queued stale edit stopped as a visible conflict, explicit apply converged, both queues drained, and both disposable owners were erased with sessions invalidated and identifiers released. This is automated Chromium sequential-conflict and reconciliation evidence, not simultaneous active field editing, real-time coauthoring, service-worker/storage-eviction, physical-device, human assistive-technology, live-Google, scale, field-latency or longitudinal evidence.

Calendar v3 source and harness `8fc791941dd4a828b5024db8969d49d6dc0b6612` passed protected CI `33320223528` and the exact deployed report at `.tmp-acceptance-calendar-cold-start-exact-8fc79194/calendar-report.json`. In both desktop and mobile, a successful online load primed a bounded same-origin app shell, an offline create entered the private IndexedDB queue, Chromium stopped all service workers, a new offline page loaded `/calendar`, the queued item remained visible, reconnect converged, the real second-tab conflict stopped the stale write, explicit apply converged, the queue drained, and both disposable owners were erased. This proves stopped-worker cold-start recovery after a successful online load. It does not prove first-ever offline use, storage-eviction recovery, simultaneous active field editing, real-time coauthoring, physical-device or human assistive-technology behavior, live Google behavior, scale, field latency or longitudinal outcomes.

Calendar v4 source and harness `0d7c9fc88a6f08f62cb3ae93c76d47cc6dea5c72` passed protected CI `33321032203` and the exact deployed report at `.tmp-acceptance-calendar-storage-exact-0d7c9fc8/calendar-report.json`. LyfeOS requests persistent browser storage before writing each new or coalesced offline Calendar mutation and visibly distinguishes granted persistence from best-effort or unavailable protection. The desktop/mobile journey compares that disclosure with `navigator.storage.persisted()`, then repeats the v3 stopped-worker, reconnect, two-tab conflict, explicit apply, queue-drainage and exact-erasure proof. This reduces automatic-eviction risk and tells the truth about it; it cannot recreate an unsynced change after the browser or user deletes every local copy.

## Launch scope

Calendar, Google, AI, document imports, and UMH are optional integrations for this MVP. Leave each disabled unless it has its own credentials, consent flow, and staging acceptance pass. The app remains functional as a standalone mission and life-organization product.
