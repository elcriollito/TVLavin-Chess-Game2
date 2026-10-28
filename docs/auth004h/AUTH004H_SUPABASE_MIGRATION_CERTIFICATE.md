# AUTH-004H Supabase age-gate migration certificate

Audit date: October 27, 2026

Status: **CERTIFIED FOR SEPARATELY APPROVED PRODUCTION EXECUTION — NOT APPLIED**

## Artifact identity

| Item | Value |
| --- | --- |
| File | `supabase/migrations/20261027120000_registration_age_gate.sql` |
| SHA-256 | `92CBBCBF64251EEBD3CEFE6B96EEB437C8317106373349DD599190D2B242831C` |
| Production project | `jczauvkfkweuvdpurpem` (`CAISSA-PRODUCTION-DO-NOT-DELETE`) |
| Region / health | `us-east-1` / `ACTIVE_HEALTHY` |
| Production state | Both tables and both functions absent at read-only check |

No production SQL or migration was executed.

## Schema review

- Adds two new tables only: single-use nonce consumptions and HMAC-keyed rate windows.
- Stores no birth month/year, raw IP address, raw email, Clerk ID, or CAISSA user ID.
- Uses check constraints for 64-character lowercase hex digests, policy length, buckets, expiry, window sizes, and quota bounds.
- Enables RLS and grants no table policy/access to `anon` or `authenticated`.
- Revokes function execution from `public`, `anon`, and `authenticated`; grants only `service_role`.
- Both functions use `SECURITY DEFINER` with fixed empty `search_path`, and every referenced table is schema-qualified.
- Capacity claims are atomic through `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE attempt_count < max`.
- Nonce consumption is atomic through a primary key and `ON CONFLICT DO NOTHING`.
- `create table if not exists`, `create index if not exists`, and `create or replace function` make the artifact operationally idempotent, but checksum identity must still be enforced.
- Existing rows/tables are not rewritten; no foreign keys or user-data backfill are added.

Supabase's current guidance requires RLS on exposed-schema tables and a fixed `search_path` for `SECURITY DEFINER`; the artifact follows those controls. An “RLS enabled, no policy” informational advisory is expected for service-role-only tables.

## Rehearsal evidence

Disposable rehearsal project: `vspfqglzqvwxlgjlvyms`

| Test | Result |
| --- | --- |
| Concurrent capacity claims, max 5 | Exactly 5 true / 15 false |
| Concurrent identical nonce consumption | Exactly 1 true / 19 false |
| Expired/far-future nonce | Rejected |
| RLS | Enabled |
| `anon` / `authenticated` table access | Denied |
| `anon` / `authenticated` function execution | Denied |
| `service_role` function execution | Allowed |
| Transaction rollback rehearsal | Clean; no residual test rows |
| Failure recovery | Retry safe under the same immutable artifact |

## Production execution plan — prepare only

1. Reconfirm project ID/name/region and a current backup/restore point.
2. Recompute the exact SHA-256 and compare to this certificate.
3. Reconfirm all four objects are absent or match the expected definitions.
4. Begin an explicit transaction; apply the exact artifact with the authorized migration mechanism.
5. Verify tables, constraints, RLS, owners, function definitions, `prosecdef`, empty `proconfig` search path, and ACLs.
6. Test only synthetic digests under `service_role`; verify `anon`/`authenticated` denial.
7. Commit only if every verification passes. Otherwise roll back the transaction.
8. Keep registration release flags disabled.
9. Record migration version/checksum and run bounded cleanup/observability checks.

## Rollback posture

Preferred rollback is feature disablement, not immediate object deletion. If the transaction has not committed, roll it back. After commit, leave the additive dormant objects in place while the application remains disabled. Dropping functions/tables is destructive and requires a separate approval after confirming no production rows or dependencies.

Official references:

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
