# Mentor Economic Foundation (S0.2P.4)

This source is locally implemented but not released. `CAISSA_MENTOR_RESERVATIONS_ENABLED` is default-off; production migration, activation, and deployment require separate authority.

## Lifecycle

Shared Mentor authenticates and validates, claims capacity, binds a browser UUID `Idempotency-Key`, reserves one credit, marks the single provider attempt, calls the provider, stores an AES-256-GCM result, marks value available, and atomically consumes. Delivery confirmation marks `VALUE_DELIVERED`. BYO and Premium behavior are unchanged; BYO never reserves, and Premium reservations have zero reserved cost.

`users.credits` remains the wallet. Active `RESERVED` rows reduce availability without changing the wallet. Only consumption and compensation mutate the wallet and append `credit_events`.

Allowed transitions are `RESERVED -> CONSUMED|RELEASED|EXPIRED_RELEASED` and `CONSUMED -> COMPENSATED`. Terminal repeats are idempotent and other transitions fail.

## Result and privacy boundary

Results are encrypted with `CAISSA_MENTOR_RESULT_ENCRYPTION_KEY`, a base64-encoded 32-byte server secret. AES-GCM additional authenticated data binds schema, operation, and internal user. Plaintext is limited to 320 KiB and expires after 15 minutes by default (bounded to 5–60). No plaintext is written to economic events or logs.

Economic events have an exact schema and no metadata/payload column. The validator rejects unknown, content-bearing, identity, secret, network, error, prototype-pollution, and normalized alias field names. Missing provider usage is recorded as `USAGE_UNAVAILABLE`; it is never fabricated and no pricing weights are active.

## Operations and recovery

Run `node scripts/reconcile-mentor-reservations.mjs [batch]` with a service-role environment in an approved environment. The database RPC uses bounded `SKIP LOCKED` batches. Stale no-result reservations release, valid results consume, and consumed/unconfirmed/unavailable results compensate once.

Before disabling the feature after activation, operators must first reconcile and verify there are no `RESERVED` operations. Never fall back to the legacy debit when the reservation path fails. Rollback removes only the new functions/tables/columns after reconciliation; it must never edit `users.credits` or historical ledger deltas.
