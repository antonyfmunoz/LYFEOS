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
UMH_FEDERATION_INSTALLATION_ID         # only if UMH is enabled
UMH_FEDERATION_TENANT_ID               # only if UMH is enabled
UMH_FEDERATION_KEY_ID                  # only if UMH is enabled
UMH_FEDERATION_SHARED_SECRET           # only if UMH is enabled
UMH_CONTROL_PLANE_URL                  # only for outbound UMH delivery
```

Build the client with a production Clerk publishable key. The checked-in `fly.toml` currently contains a test publishable key and must be updated or overridden at deployment time before public traffic is accepted.

## Database and Clerk

1. Back up the production database.
2. Apply `migrations/0007_umh_federation.sql` together with any unapplied earlier migrations using the production `DATABASE_URL`.
3. In Clerk, configure the production origin, redirect URLs, and a `user.created` webhook at `https://<public-host>/api/webhooks/clerk`.
4. Put Clerk's `whsec_...` signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`. The webhook fails closed until configured; first authenticated login still provisions a LyfeOS account if webhook delivery is delayed.
5. Verify a new Clerk user results in one LyfeOS user, stats record, profile, integration record, and daily log.

## Verification

Run this before deploying:

```bash
npm run verify
```

The standard suite deliberately skips live API tests unless a running, isolated test environment is supplied:

```bash
LYFEOS_TEST_API_URL=https://staging.example.com npm test
```

Run this acceptance pass on staging and production:

1. Create an account, sign in, and sign out.
2. Complete onboarding and refresh the page.
3. Create, edit, complete, restore, and delete a mission; confirm the dashboard and mission list agree after refresh.
4. Confirm one user cannot request another user's records by altering a user ID in a request.
5. Send an invalid Clerk webhook and confirm it returns `401`; send a valid Clerk test webhook and confirm it is accepted.
6. Complete all onboarding missions and confirm the dashboard shows one reviewable Transformation Thread derived from the saved onboarding profile. Activate it and confirm exactly three linked starter missions are created; verify no second active thread can be activated.
7. Rename the AI companion and confirm its selected name is used by the chat and generated AI responses after refresh.
8. If UMH is enabled, perform one signed `lyfeos.mission.create.v1` command and confirm exactly one mission and one outbound event are recorded.

## Launch scope

Calendar, Google, AI, document imports, and UMH are optional integrations for this MVP. Leave each disabled unless it has its own credentials, consent flow, and staging acceptance pass. The app remains functional as a standalone mission and life-organization product.
