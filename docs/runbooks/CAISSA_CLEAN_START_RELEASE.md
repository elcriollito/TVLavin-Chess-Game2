# CAISSA Clean Start release runbook

Status: prepared, not executed.

This runbook replaces SEC-005 account recovery. It resets CAISSA account data only; it does not reset the chess catalog, D1/R2 assets, engines, opening data, Scanner corpus, FICS, Arena, Yahoo, TV, Cloudflare, Vercel team membership, Clerk Development, Supabase configuration, or CAISSA Online feature flags.

## Safety invariants

- Production project: `jczauvkfkweuvdpurpem` only.
- Staging project: `aqizagaskicotorfpwfn` only.
- Production account deletion is forbidden until a fresh registration, email verification, nickname selection, subsequent sign-in, and Puzzles persistence pass in Staging.
- `CAISSA_ONLINE_ROLLOUT` remains unchanged and off during the reset window.
- `CAISSA_ACCOUNT_RESET_NOTICE` remains disabled until the database and Clerk reset are complete.
- `CAISSA_ACCOUNT_SYSTEM_MODE=maintenance` must be effective before backup or deletion starts.
- `CAISSA_ACCOUNT_SYSTEM_MODE=clean_start` is invalid without `CAISSA_ACCOUNT_TOKEN_NOT_BEFORE`.
- The destructive SQL accepts only the certified Production ledger, an exact same-snapshot manifest, a restore-tested encrypted backup, and a finite retention date.
- The destructive SQL is hard-pinned to database `postgres` and Production PostgreSQL system identifier `7581440907192989109`; the operator-supplied project reference is not treated as proof of destination identity.
- No automatic retry is permitted for backup, restore, Clerk deletion, database reset, or first Production registration.

## 1. Staging certification

1. Deploy the candidate to a protected Preview with Clerk Development and Supabase Staging only.
2. Set branch-scoped Preview values:
   - `CAISSA_ACCOUNT_SYSTEM_MODE=clean_start`
   - `CAISSA_ACCOUNT_TOKEN_NOT_BEFORE=<UTC activation instant>`
   - `CAISSA_ACCOUNT_RESET_NOTICE=disabled`
   - `CAISSA_IDENTITY_MIGRATION_MODE=off`
3. Confirm `/api/public-auth-config` reports `clean_start`, registration open, notice false, a Clerk Development publishable key, and no owner-handoff metadata.
4. Create synthetic identity A through Clerk Development email verification. Confirm exactly one `public.users` row and one stable fallback public identity.
5. Require nickname selection before leaving `/auth/complete`. Verify Unicode, reserved-name rejection, collision rejection, safe rendering, later nickname change, and stable UUID.
6. Sign out and sign back in with the same email. Confirm the same Clerk subject and Supabase UUID.
7. Record one synthetic Puzzles attempt, sign out/in, and confirm persistence. Delete only synthetic run-tagged data through reviewed ownership-specific cleanup.
8. Verify a second identity cannot access A's progress or update A's nickname.
9. Verify a token with `iat` before the cutoff receives `SESSION_RESET_REQUIRED`; a current token succeeds.
10. Run Chromium, Firefox, and WebKit at desktop and mobile sizes. Confirm no SEC-005 recovery UI or `IDENTITY_*_REQUIRED` response appears.

Any failure stops the release before Production backup or deletion.

## 2. Restricted Production backup

The backup protects account-owned PostgreSQL rows and the pre-reset schema needed to inspect them. It is not a complete Supabase-project backup and does not include Clerk credentials, Vercel settings, Storage object bytes, Cloudflare/R2 objects, or third-party configuration.

Use PostgreSQL Direct with TLS `verify-full`, the certified Supabase CA, pinned client versions, and a private in-memory or owner-readable `PGPASSFILE`. Do not place the password in command history, environment reports, logs, or the repository.

Capture from one exported MVCC snapshot:

- schema definitions for the affected `public` tables, functions, triggers, constraints, owners, grants, RLS policies, publications, and extensions;
- data for `users`, public identities, identity bindings/challenges/audit, credits/reservations/usage, Stripe events, entitlements, Puzzles progress/attempts, Online account rows, Insights, Library, Mentor results, beta account audit, and the account link columns of Scanner rows;
- the exact aggregate preflight manifest and migration-ledger fingerprint;
- Clerk Production aggregate inventory and session/user deletion manifest, without passwords, OTPs, cookies, or tokens.

Encrypt before persistent storage to the owner's designated GPG recovery key. Store the encrypted artifact and sanitized manifest in an existing protected remote location that survives runner deletion. Record SHA-256, object generation/version, retention expiry, and key fingerprint; never record the private key or passphrase.

Restore the encrypted artifact into an isolated PostgreSQL destination whose outbound network is blocked before decryption. Validate table counts, schema objects, sample relational integrity, and the manifest fingerprint. Destroy the restored database and plaintext workspace after the attestation is hashed. File deletion is operational cleanup, not a claim of forensic erasure.

Proposed retention is 14 days, bounded by the reset script to 7–30 days. Delete the encrypted backup, old object generations, restore secret, and retained recovery artifacts at expiry after the owner confirms the new account path. If recovery remains unresolved, obtain a specific extension before expiry.

The certified baseline currently contains one active `beta_tester` entitlement, granted by the system with no expiry, and zero Stripe event rows. This is evidence of a non-billing feature grant, not evidence of an external recurring charge. Revalidate those facts immediately before backup/reset and stop if the entitlement, Stripe rows, or any external billing metadata has changed.

## 3. Coordinated Production reset

1. Reconfirm both Vercel projects serve the approved code and `CAISSA_ONLINE_ROLLOUT=off`.
2. Deploy the same candidate with `CAISSA_ACCOUNT_SYSTEM_MODE=maintenance` and reset notice disabled. Verify sign-in/sign-up do not mount Clerk and authenticated APIs fail with `ACCOUNT_SYSTEM_MAINTENANCE`.
3. Disable new Clerk Production sign-up during the maintenance window. Keep Google OAuth disabled; email code is the launch method.
4. Complete and restore-test the restricted backup.
5. Run `tools/clean-start/production-account-preflight.sql` over Direct/TLS and save its sanitized JSON. Require database `postgres` and system identifier `7581440907192989109` before continuing.
6. Compare it byte-for-byte as JSON with the reset manifest. Stop on any new user, entitlement, Online activity, ledger change, or other count divergence.
7. Execute `tools/clean-start/production-account-reset.sql` once with the seven non-secret evidence variables. Do not use `db reset`, migration repair, seed, or generic cleanup.
8. Run `tools/clean-start/production-account-postflight.sql`. Require zero accounts, identities, challenges, bindings, active entitlements, Puzzles account rows, Online queue/presence, and Scanner account links.
9. Revoke all Clerk Production sessions, then delete exactly the Clerk Production user records captured in the manifest. Do not touch Clerk Development or Vercel users.
10. Record the UTC instant after Clerk deletion as `CAISSA_ACCOUNT_TOKEN_NOT_BEFORE`.
11. Set Production configuration:
    - `CAISSA_ACCOUNT_SYSTEM_MODE=clean_start`
    - `CAISSA_ACCOUNT_TOKEN_NOT_BEFORE=<recorded UTC instant>`
    - `CAISSA_ACCOUNT_RESET_NOTICE=enabled`
    - `CAISSA_IDENTITY_MIGRATION_MODE=off`
12. Remove SEC-005 owner-handoff secrets and legacy origins only after both projects no longer depend on them. Preserve unrelated variables.
13. Re-enable Clerk Production sign-up with email code. Keep Google OAuth disabled until its independent incident is resolved.
14. Deploy the exact approved SHA to both Production integrations and verify the public domain serves it.

Rollback before database reset: redeploy the preceding Production deployment and restore the preceding environment values.

Recovery after database reset: return to maintenance; revoke sessions; restore the encrypted backup into an isolated destination; compare it; then use a separately reviewed recovery plan. Do not automatically replay account rows into hosted Production and do not reactivate old entitlements without owner approval.

## 4. First Production registration and postflight

From a fresh browser profile with no Clerk or Vercel session:

1. Register one real owner-approved email by email code.
2. Confirm `/auth/complete` creates exactly one user and requires a unique public nickname.
3. Confirm Home and My Account show the nickname while full name/email remain private.
4. Sign out and sign back in; confirm the same UUID and no 409/500 response.
5. Open Puzzles, perform the specifically authorized persistence check, and confirm cross-account denial with a second fresh test account if authorized.
6. Confirm stale pre-reset sessions cannot recreate deleted profiles.
7. Verify Home, Play, Puzzles, Analyzer, Endgame Trainer, Arena, FICS, Yahoo, TV, ECO/Openings, Scanner, and Online configuration/flags were not reset.
8. Verify the apology banner appears on Home, Sign In, and Sign Up only after the reset.

The banner is temporary. Its later removal requires a normal code/config release; it must not be hidden before the owner confirms users have had a reasonable notice period.

## Stop conditions

Stop without retry when identity authority, project identity, ledger, manifest, backup hash, restoration hash, retention, Clerk user inventory, deployment SHA, or any destructive result is missing or ambiguous.
