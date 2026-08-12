# LyfeOS production operations

## Release gate

Before a production release, run `npm run verify`, review `git diff --check`, and confirm the public `/api/ready` endpoint returns `{"status":"ready"}` after deployment. The included GitHub Actions workflow enforces the same build and test gate once it is pushed to the repository's `main` branch or used from a pull request.

## Availability and sessions

Fly checks `/api/ready`, which verifies a live database query. Authentication sessions are stored in Postgres table `session`, so a machine restart does not sign users out. The release migration `0009_postgres_sessions.sql` must be applied before enabling a release that uses the Postgres session store.

## Monitoring and alerts

GitHub Actions runs the `Production monitor` workflow every five minutes against `https://lyfeos.net/api/ready` and the expected anonymous `401` response from `/api/auth/me`. A failed check opens one labelled `production-monitor` incident issue with the failing workflow receipt. The first successful subsequent check comments on and closes that incident. Configure GitHub notification delivery to **Email** and **Only notify for failed workflows** for the `antonyfmunoz/LYFEOS` repository so incident creation and monitor failures reach the operational owner.

The application emits structured request logs with `x-request-id`; Fly remains the live source for runtime logs and machine health. A dedicated error-tracking vendor has not been configured, so errors are not yet aggregated or alerted independently of the availability monitor.

## Backup and restore

Neon is the authoritative recovery provider. Its branch history supports point-in-time recovery; retain at least seven days of history (or 30 days on a plan that supports it). Before changing schema or destructive data, create a Neon snapshot and record its timestamp and restore point in the release notes. At least quarterly, create an isolated branch from a snapshot or a point in time and verify: schema, one login, one account creation, and one mission read/write. Delete the temporary branch after the evidence is recorded. Never run a restore against production without an explicit change window and approval.

## Incident response

1. Confirm `/api/health` and `/api/ready`.
2. Inspect Fly logs using the `x-request-id` returned to the affected user.
3. If a release is the cause, roll back to the last healthy Fly image before modifying data.
4. If data integrity is affected, freeze writes, take a snapshot, and restore only through the provider-approved procedure.

## External operating gates

These controls require separate provider configuration or ownership before claiming mature SaaS operations: central error monitoring beyond synthetic availability checks, Neon backup retention and quarterly recovery evidence, product analytics consent and retention policy, billing/entitlement controls, support intake, and a named operational owner.
