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
SENTRY_DSN                             # enable server and browser error reporting
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=<immutable release id>
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
4. In Clerk, configure the production origin, redirect URLs, and a `user.created` webhook at `https://<public-host>/api/webhooks/clerk`.
5. Put Clerk's `whsec_...` signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`. The webhook fails closed until configured; first authenticated login still provisions a LyfeOS account if webhook delivery is delayed.
6. Verify a new Clerk user results in one LyfeOS user, stats record, profile, integration record, and daily log.

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
5. Send an invalid Clerk webhook and confirm it returns `401`; send a valid Clerk test webhook and confirm it is accepted.
6. Complete all onboarding missions and confirm the dashboard shows one reviewable Transformation Thread derived from the saved onboarding profile. Activate it and confirm exactly three linked starter missions are created; verify no second active thread can be activated.
7. Add a prerequisite to a second mission and confirm it cannot be completed before its prerequisite; confirm a cycle is rejected. On a low-capacity day, defer an over-capacity recommended mission and confirm its due date changes while an audit row is recorded. Complete one linked mission, add the declared mission evidence, and record a positive review. Confirm activity XP appears on completion but skill XP, reviewed Thread evidence, and any capability progress appear only after the review. Save one daily reflection, record a weekly review, pause and resume the thread, then complete it with a closing reflection only after the readiness requirements are met.
8. From Profile settings, export data, clear chat history in a test account, reset the generated AI profile, and confirm account deletion requires the exact confirmation phrase.
9. Rename the AI companion and confirm its selected name is used by the chat and generated AI responses after refresh.
10. If UMH is enabled, perform one signed `lyfeos.mission.create.v1` command and confirm exactly one mission and one outbound event are recorded.
11. On an active Thread, create a mission with one or more unlocked skills selected. Confirm it receives a proof plan, its activity XP is awarded on completion, and its skill XP is applied only after evidence and a positive review. Confirm locked skills cannot be selected, and completed missions cannot have their skill mapping changed.
12. Ask the AI to make a medium-risk change (for example, edit or terminate a mission). Confirm it appears as a pending approval in Profile, approving it executes exactly once, and declining or expiry makes no change.

## Launch scope

Calendar, Google, AI, document imports, and UMH are optional integrations for this MVP. Leave each disabled unless it has its own credentials, consent flow, and staging acceptance pass. The app remains functional as a standalone mission and life-organization product.
