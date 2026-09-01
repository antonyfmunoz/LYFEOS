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

LyfeOS posts signed domain events to `${UMH_CONTROL_PLANE_URL}/api/umh/projections/lyfeos/events` from its transactional outbox.

## Signature and replay protection

Signed commands into LyfeOS use these headers:

```text
x-umh-key-id: configured key ID
x-umh-timestamp: epoch milliseconds
x-umh-nonce: 16-256 character random URL-safe nonce
x-umh-signature: lowercase hex HMAC-SHA256
```

The HMAC input is `timestamp.nonce.canonical-json-body`, where canonical JSON recursively sorts object keys. Timestamps have a five-minute skew window. LyfeOS persists both command IDs and nonces, and enforces a scoped idempotency key.

Outbound events use the same key ID plus an epoch-seconds timestamp and sign the
exact serialized request bytes. A successful HTTP status alone is not delivery
evidence. The control plane must return a JSON `umh.event-receipt.v1` body with
the exact event, projection, installation, and tenant IDs, a status of
`accepted` or `duplicate`, and these response headers:

```text
x-umh-key-id: configured key ID
x-umh-timestamp: epoch seconds
x-umh-nonce: 16-256 character random URL-safe nonce
x-umh-signature: lowercase hex HMAC-SHA256 over the exact response body
```

LyfeOS settles the durable outbox record only after validating the receipt
signature, five-minute timestamp window, strict schema, and exact scope. A
missing, malformed, stale, oversized, wrong-key, or mis-correlated receipt is
retryable and can never be reported as delivered. `duplicate` is success
because the transport is explicitly at-least-once and the event ID is the
consumer idempotency key.

## First supported capability

`lyfeos.mission.create.v1` creates a confirmed mission after checking installation, tenant, local user, Clerk identity, expiry, signature, nonce, and idempotency. This narrowly allow-listed capability is low-risk and records `not_required` approval. Any expanded capability — external effect, financial operation, destructive action, configuration change, or elevated risk — must add LyfeOS-local approval policy before it is exposed in the manifest.

The public `lyfeos.umh-capability-manifest.v2` separately declares direction,
LyfeOS authority, local effect, approval, consent boundary, delivery semantics,
data class, event idempotency, and the mandatory receipt contract. Publishing a
contract does not activate federation or prove consumer conformance.

## Connected-app model

UMH, EntrepreneurOS, and CreativesOS appear in LyfeOS **Connected Apps**. UMH
is the system-managed signed route; it is never a user data grant.
EntrepreneurOS and CreativesOS are separate, owner-controlled integrations.
Connecting or authorizing one cannot connect or authorize the other.

Each product starts with every share capability off. The user independently
enables only `Linked work coordination` and/or `Capacity pattern insights` for
that product. Outbound events are filtered by the receiving product's own
grant—not merely by a broad ecosystem switch. Account-level approval and
future-action defaults apply to these app records exactly as they do to other
connected apps. Until UMH routing is configured, the UI reports the apps as
unavailable and LyfeOS sends no ecosystem data.
