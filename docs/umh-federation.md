# LyfeOS UMH federation bridge

LyfeOS remains the source of truth for its life-domain state. UMH communicates through this HTTPS boundary; it must never write LyfeOS tables directly.

## Configuration

Federation is intentionally disabled unless all four inbound settings are present:

```text
UMH_FEDERATION_INSTALLATION_ID=...
UMH_FEDERATION_TENANT_ID=...
UMH_FEDERATION_KEY_ID=...
UMH_FEDERATION_SHARED_SECRET=...
```

Set `UMH_CONTROL_PLANE_URL=https://...` to enable durable outbound delivery. Keep the secret in the deployment secret store; it is never persisted in LyfeOS.

## HTTP endpoints

- `GET /api/umh/v1/manifest` — public, reports capability and enabled state.
- `GET /api/umh/v1/health` — public, reports bridge readiness without secrets.
- `POST /api/umh/v1/commands` — signed command ingress.

LyfeOS posts signed domain events to `${UMH_CONTROL_PLANE_URL}/api/umh/v1/events` from its transactional outbox.

## Signature and replay protection

Send these headers with commands and events:

```text
x-umh-key-id: configured key ID
x-umh-timestamp: epoch milliseconds
x-umh-nonce: 16-256 character random URL-safe nonce
x-umh-signature: lowercase hex HMAC-SHA256
```

The HMAC input is `timestamp.nonce.canonical-json-body`, where canonical JSON recursively sorts object keys. Timestamps have a five-minute skew window. LyfeOS persists both command IDs and nonces, and enforces a scoped idempotency key.

## First supported capability

`lyfeos.mission.create.v1` creates a confirmed mission after checking installation, tenant, local user, Clerk identity, expiry, signature, nonce, and idempotency. This narrowly allow-listed capability is low-risk and records `not_required` approval. Any expanded capability — external effect, financial operation, destructive action, configuration change, or elevated risk — must add LyfeOS-local approval policy before it is exposed in the manifest.
