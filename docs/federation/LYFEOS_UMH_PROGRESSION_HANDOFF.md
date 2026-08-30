# LyfeOS ecosystem -> UMH handoff

## Authority and purpose

LyfeOS remains the authoritative owner of a person's missions, Threads, skill
evidence, XP, rank, badges, daily logs, reflections, and health-adjacent
check-ins. Those records are not a federation feed.

UMH is a signed transport and correlation boundary. It can make limited,
user-consented LyfeOS context available to an authorized EntrepreneurOS or
CreativesOS read model. No projection may write directly to another
projection's database.

## What can leave LyfeOS

| User purpose | Trigger | Event | Payload |
| --- | --- | --- | --- |
| Capacity pattern insights | A daily log is saved | `lyfeos.coordination-context.updated.v1` | Date, coarse `low`/`steady`/`high` capacity band, evidence-quality label, selected destinations |
| Linked work coordination | A user explicitly links a LyfeOS mission to an external work-item ID, or changes that mission's state | `lyfeos.work-item.updated.v1` | External work-item ID, local mission ID, the user's explicit 280-character summary, open/completed state, selected destinations |
| Consent lifecycle | A user enables, narrows, expands, or disables ecosystem sharing | `lyfeos.federation-consent.updated.v1` | Complete current enabled/disabled state, policy version, monotonic revision, current destinations/purposes, and the affected destination/purpose set that must reconcile the change |

XP, ranks, badges, skill graph state, raw sleep/workout/mental/emotional
ratings, mission titles, journal/reflection text, profile data, credentials,
and unlinked work do not leave LyfeOS through these events.

Correlation is an analytical hypothesis. A receiving product may show that
signals co-occur or invite a user to investigate a pattern; it must not claim
that LyfeOS data caused a business or creative outcome.

## Consent and revocation

Cross-product sharing is off by default. In Profile, the user must choose:

1. One or both destinations: `entrepreneuros`, `creativesos`.
2. One or both purposes: `coordination`, `correlation`.

Both the destination and the purpose are carried in every relevant event. A
work link can only target products already enabled for that user. Every real
preference change receives a monotonic, append-only local receipt. When the
signed receiver is configured, the complete new consent state and the union of
previously/currently affected products are queued atomically with that receipt,
so a removed product can retire its read model instead of merely disappearing
from future events. Turning sharing off clears the local allowed scopes and
prevents future data publication. It does not rewrite a consumer's audit
history; UMH and each consumer still enforce their approved retention and
deletion policy. If no receiver is configured, LyfeOS records that the change
is local-only rather than claiming delivery. When configuration returns, the
outbox worker queues only the latest complete local-only revision; superseded
receipts remain history and are not replayed out of order.

## Transport contract

LyfeOS sends signed `umh.v1` events through its durable outbox to:

`POST {UMH_CONTROL_PLANE_URL}/api/umh/projections/lyfeos/events`

Headers:

- `x-umh-timestamp`: Unix seconds
- `x-umh-nonce`: unique transport nonce
- `x-umh-key-id`: configured rotation-safe key ID
- `x-umh-signature`: HMAC-SHA256 of `timestamp + "." + nonce + "." + exact JSON body`

HTTP success is not treated as durable acceptance. UMH must return a signed,
strict `umh.event-receipt.v1` body naming the exact event, projection,
installation and tenant, with status `accepted` or `duplicate`. LyfeOS verifies
the response key ID, timestamp, nonce, exact-body signature and scope before it
settles the outbox event. Missing or mismatched receipts remain retryable. This
is LyfeOS-side enforcement; it does not claim the currently unconfigured UMH
receiver implements the receipt yet.

Required LyfeOS deployment configuration:

- `UMH_FEDERATION_INSTALLATION_ID`
- `UMH_FEDERATION_TENANT_ID`
- `UMH_FEDERATION_KEY_ID` (for signed UMH commands into LyfeOS)
- `UMH_FEDERATION_SHARED_SECRET`
- `UMH_CONTROL_PLANE_URL`

Federation remains inactive until those values are installed through the
deployment secret manager. The outbox is retryable and event-idempotent; a
failed delivery does not change local LyfeOS state.

Outbound events identify the user with a persisted random LyfeOS federation
subject. It is stable across transport-signing key rotation and is meaningful
only with the signed installation and tenant envelope. The local user ID,
secret, email, display name, and Clerk identifier are not emitted. UMH must
explicitly link that signed subject to an authorized cross-product identity;
receivers must not guess identity from names or contact details.

## UMH / consumer activation checklist

1. Register the LyfeOS installation ID and shared secret at UMH ingress.
2. Validate signature, key ID, nonce, timestamp, schema, tenant, and event-ID idempotency; return the matching signed receipt.
3. Enforce the event's purpose and allowed destinations alongside the user's
   ecosystem authorization.
4. Create consumer read models only; never issue direct LyfeOS database writes.
5. Prove the four paths end-to-end: no consent -> no context/work event;
   opt-in -> one revisioned consent event; opted-in daily log -> coarse context
   event; explicit linked mission completion -> work-state event visible to
   exactly one authorized consumer.
6. Narrow and revoke consent, verify the removed consumer receives the complete
   newer consent revision, retires its read model according to policy, and no
   later context/work event reaches it.
