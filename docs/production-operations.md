# LyfeOS production operations

## Release gate

Before a production release, run `npm run verify`, review `git diff --check`, and confirm the public `/api/ready` endpoint returns `{"status":"ready"}` after deployment. The included GitHub Actions workflow enforces the same build and test gate once it is pushed to the repository's `main` branch or used from a pull request.

## Availability and sessions

Fly checks `/api/ready`, which verifies a live database query. Authentication sessions are stored in Postgres table `session`, so a machine restart does not sign users out. The release migration `0009_postgres_sessions.sql` must be applied before enabling a release that uses the Postgres session store.

## Backup and restore

The database provider remains the authoritative backup system. Before changing schema or destructive data, create a provider snapshot and record its timestamp and restore point in the release notes. At least quarterly, restore a snapshot into an isolated non-production database and verify: schema, one login, one account creation, and one mission read/write. Never run a restore against production without an explicit change window and approval.

## Incident response

1. Confirm `/api/health` and `/api/ready`.
2. Inspect Fly logs using the `x-request-id` returned to the affected user.
3. If a release is the cause, roll back to the last healthy Fly image before modifying data.
4. If data integrity is affected, freeze writes, take a snapshot, and restore only through the provider-approved procedure.

## External operating gates

These controls require separate provider configuration or ownership before claiming mature SaaS operations: a production Clerk instance/key, central error monitoring and alert routing, database-provider backup retention, automated off-site recovery evidence, product analytics consent and retention policy, billing/entitlement controls, support intake, and a named operational owner.
