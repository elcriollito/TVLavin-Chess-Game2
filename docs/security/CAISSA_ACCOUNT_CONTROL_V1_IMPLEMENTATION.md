# CAISSA Account Control v1.0 — implementation and release contract

**Track:** Issue #81, stacked on Identity Organization Issue #80  
**Environment authorized for this release:** protected Vercel Preview, Clerk Development, Supabase Staging  
**Production state:** not enabled and not modified

## Authority boundary

Every operation begins with a server-verified Clerk JWT. The server fixes the
accepted authority and Supabase project from environment configuration, then
resolves the internal UUID through the verified identity binding. Request bodies
cannot select a user, subject, email, or nickname. Ownership conflicts,
quarantined bindings, active recovery challenges, incident holds, storage
references, active entitlements, or in-flight economic reservations fail closed.

Sensitive operations require Clerk's signed first-factor verification age to be
no more than five minutes, an exact browser origin, JSON, an idempotency key,
and a persistent HMAC-scoped rate-limit decision. No raw Clerk subject is stored
in the account-control ledger or its rate-limit table.

Every current table with a direct `users` foreign key has a same-transaction
write barrier. It takes the same advisory lock used by deletion and rechecks the
durable account state after acquiring the lock. The legacy Online rate-limit
table is subject-keyed rather than UUID-keyed, so it has an explicit equivalent
barrier; unknown member subjects fail closed while UUID guest subjects remain
ephemeral. A schema-inventory regression fails when a new direct user table is
added without the barrier. The erasure transaction uses a narrowly validated,
transaction-local capability before participant locks so simultaneous deletion
of players sharing a game cannot deadlock.

## Operations

| Operation | Data changed | Data preserved |
|---|---|---|
| Private export | None | Returns only the verified owner's projection; no public URL is created |
| Reset chess progress | Puzzle progress and attempts | Login, UUID, nickname, credits, entitlements, Online ratings, games and audit evidence |
| Delete account | Owner-only training, library, Scanner metadata, Mentor result payload, Insights, public identity, Online profile/rating and beta activity | Internal UUID tombstone, shared games/events/tournament participation, required economic evidence and sanitized audit history |

The private download preserves the nested `caissa.account-export.v1` contract.
Its database RPC accepts only a fixed section allowlist and at most 100 rows per
page, revalidating the verified owner and ACTIVE state on every page. The
serverless handler writes JSON incrementally with response backpressure and the
browser consumes the response as a Blob without parsing and serializing a
second copy. This avoids the Vercel buffered-response limit without publishing
an export artifact or URL.

Scanner records with a non-empty storage reference are not deleted
automatically in v1. They enter manual review so storage cleanup cannot be
silently skipped. Active entitlements and active credit reservations are also
manual-review blockers.

## Deletion state machine

1. `PREPARED`: one expiring, owner-bound confirmation exists.
2. `LOCKED`: the account state becomes `DELETION_PENDING`; old and concurrent
   sessions can no longer resolve ownership.
3. `AUTH_DELETION_PENDING`: a single PostgreSQL transaction has erased or
   anonymized the approved data classes.
4. The backend deletes exactly the authenticated user from the configured Clerk
   instance, which revokes that user's sessions.
5. `COMPLETED`: the durable account state is `DELETED`.

Failures before data erasure roll back the erasure transaction and enter
`REVIEW_REQUIRED`. A Clerk failure after erasure preserves the tombstone and
enters `FAILED_REVIEW`; it never restores data or unlocks the account. A failure
after Clerk deletion leaves `AUTH_DELETION_PENDING` for privileged reconciliation
and cannot resurrect the profile from an old token.

## Re-registration

Re-registration remains unavailable while Clerk Production is Invite-only and
Issue #78 is open. In a future authorized Open-access release, the same email
may create a new Clerk subject and CAISSA UUID. Email and nickname are never
used to recover the deleted UUID, credits, ratings, bindings, or progress.

## Release gates

- When ownership and migration enforcement are both enabled, `/api/user/sync`
  may consume only a server-side `APPROVED_NEW` resolution for a Production
  subject. It provisions through the restricted RPC and then resolves ownership
  again before updating the user. Historical, unresolved, Development, crossed,
  and raced bindings continue to fail closed.
- Apply `20261018174754_caissa_account_control_v1.sql` only after exact-hash,
  ledger, schema, lock and baseline checks.
- Exercise destructive paths only with synthetic data or transaction rollback.
- Keep Preview protected by Vercel SSO and bound to Clerk Development and
  Supabase Staging.
- Require an independent security review and a verified Production backup /
  restore path before any Production migration or real-user operation.
- Production enablement, account deletion, registration reopening and changing
  Clerk Invite-only each require separate owner authorization.

