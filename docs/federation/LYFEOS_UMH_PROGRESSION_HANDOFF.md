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
work link can only target products already enabled for that user. Turning
sharing off prevents future publication; it does not rewrite a consumer's
previously ingested audit history. UMH and consumer products must enforce their
own retention/deletion policy when a user revokes consent.

## Transport contract

LyfeOS sends signed `umh.v1` events through its durable outbox to:

`POST {UMH_CONTROL_PLANE_URL}/api/umh/projections/lyfeos/events`

Headers:

- `x-umh-timestamp`: Unix seconds
- `x-umh-nonce`: unique transport nonce
- `x-umh-signature`: HMAC-SHA256 of `timestamp + "." + nonce + "." + exact JSON body`

Required LyfeOS deployment configuration:

- `UMH_FEDERATION_INSTALLATION_ID`
- `UMH_FEDERATION_TENANT_ID`
- `UMH_FEDERATION_KEY_ID` (for signed UMH commands into LyfeOS)
- `UMH_FEDERATION_SHARED_SECRET`
- `UMH_CONTROL_PLANE_URL`

Federation remains inactive until those values are installed through the
deployment secret manager. The outbox is retryable and event-idempotent; a
failed delivery does not change local LyfeOS state.

## UMH / consumer activation checklist

1. Register the LyfeOS installation ID and shared secret at UMH ingress.
2. Validate signature, nonce, timestamp, schema, tenant, and idempotency.
3. Enforce the event's purpose and allowed destinations alongside the user's
   ecosystem authorization.
4. Create consumer read models only; never issue direct LyfeOS database writes.
5. Prove the three paths end-to-end: no consent -> no event; opted-in daily log
   -> coarse context event; explicit linked mission completion -> work-state
   event visible to exactly one authorized consumer.
