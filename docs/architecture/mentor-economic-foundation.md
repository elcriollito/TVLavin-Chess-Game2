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

## Single-user canary controls

Reservations remain default-off. A Shared Mentor request enters the reservation path only when `CAISSA_MENTOR_RESERVATIONS_ENABLED` is exactly `true` **and** its immutable internal `users.id` is present in the server-only `CAISSA_MENTOR_RESERVATION_CANARY_USER_IDS` list. The list accepts at most ten unique lowercase UUIDs in no more than 512 bytes. Missing or malformed configuration fails before capacity, reservation, or provider dispatch. Email, Clerk subject, browser fields, request headers, and membership state are not canary authority. BYO remains outside reservations.

The result key is a canonical padded Base64 encoding of exactly 32 random bytes. Whitespace, junk suffixes, URL-safe encoding, missing padding, non-canonical aliases, and other decoded lengths fail closed. Store `CAISSA_MENTOR_RESULT_ENCRYPTION_KEY` only as a Production-scoped Vercel secret. The current result schema has no key-version column: before rotation, turn reservations OFF, reconcile active state, allow replayable results to expire, run cleanup until the result table is empty, replace the key, redeploy, and verify readiness. Do not rotate across live ciphertext.

## Scheduled maintenance

Vercel invokes `/api/cron/mentor-economic-maintenance?mode=execute&batch=100` daily at 04:17 UTC. `CRON_SECRET` authenticates the request. Execution additionally requires all of the following server-only controls:

- `CAISSA_MENTOR_MAINTENANCE_TARGET` equals the current `VERCEL_ENV`;
- `CAISSA_MENTOR_MAINTENANCE_SUPABASE_PROJECT_REF` matches the configured Supabase URL hostname;
- `CAISSA_MENTOR_MAINTENANCE_EXECUTE_ENABLED` is exactly `true`.

The authenticated `mode=dry-run` path reports only bounded aggregate action counts. Execute reconciles first and cleans expired results second. Database RPC transactions remain atomic and idempotent; a runner failure cannot partially mutate an RPC, change eligibility, or expose content. Operators may invoke dry-run or execute manually with the same authentication and guards. Batch values are integers from 1 through 500.

## Operation inspection and emergency OFF

Use `node scripts/inspect-mentor-operation.mjs <operation-uuid> <production|preview> <project-ref>` with process-local service credentials. It selects state, quantities, linkage, timestamps, and result metadata only. It never selects identity, chess content, provider payload, ciphertext, IV, or authentication tag.

Emergency OFF sequence:

1. Set `CAISSA_MENTOR_RESERVATIONS_ENABLED` to `false` or remove it.
2. Redeploy Production and wait until the canonical deployment is READY.
3. Verify new requests use legacy Mentor and cannot create reservations.
4. Invoke authenticated maintenance dry-run, then execute if terminal work is reported.
5. Re-run aggregate inspection until no non-terminal reservation state remains.

OFF affects new invocations after deployment propagation. Already-running invocations may finish. Replay and confirmation remain available while encrypted results are unexpired; reconciliation resolves interrupted reservation state independently of the feature flag.

Before disabling the feature after activation, operators must first reconcile and verify there are no `RESERVED` operations. Never fall back to the legacy debit when the reservation path fails. Rollback removes only the new functions/tables/columns after reconciliation; it must never edit `users.credits` or historical ledger deltas.
