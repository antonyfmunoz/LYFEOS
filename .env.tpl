# Copy this file to .env locally. Keep real values in your deployment secret store.
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
SESSION_SECRET=generate-a-long-random-value-for-each-environment
AI_INTEGRATIONS_ANTHROPIC_BASE_URL=http://localhost:1106/modelfarm/anthropic
AI_INTEGRATIONS_ANTHROPIC_API_KEY=replace-with-provider-key
GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
GOOGLE_OAUTH_REDIRECT_URI=https://lyfeos.net/api/google/callback
VITE_CLERK_PUBLISHABLE_KEY=pk_live_or_test_value
CLERK_SECRET_KEY=sk_live_or_test_value
CLERK_WEBHOOK_SIGNING_SECRET=whsec_value_from_clerk
SENTRY_DSN=https://public-key@o0.ingest.sentry.io/project-id
SENTRY_ENVIRONMENT=development_or_production
SENTRY_RELEASE=git-commit-or-semantic-release
