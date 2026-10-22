# CAISSA Opening Trainer — Staging Security Gate

Date: 2026-10-21
Branch: `feature/opening-trainer-v1`
Scope: Preview and read-only staging inspection. Production is out of scope.

## Gate decision

The application-side identity remediation is ready for review. The database gate remains closed: no DDL was applied and no staging row was created, changed, or deleted. Cloud repertoire operations fail closed in Preview until a human approves the migration and the exact branch-scoped boundary variables are configured.

## Read-only environment evidence

- Supabase staging is `CAISSA-READER-STAGING`, ref `aqizagaskicotorfpwfn`, PostgreSQL 17.6, status `ACTIVE_HEALTHY`.
- The production denylisted ref is `jczauvkfkweuvdpurpem`; it was listed for boundary verification only and was not queried or modified.
- `public.opening_repertoires` is absent from staging. Migration `20261021214528_opening_trainer_repertoires` is not in the staging migration ledger.
- Staging `public.users.id` is a non-null UUID primary key and `public.users.clerk_id` is a non-null unique text identifier. The proposed foreign key is type-compatible.
- Clerk application `CAISSA Chess` has distinct development and production instances. The inspected development instance uses a test publishable key and a 60-second session lifetime. No Clerk configuration was changed and no test user was created.
- Vercel project `elcriollitos-projects/caissa-chess` was inspected by variable name and scope only. There are no Preview variables scoped to `feature/opening-trainer-v1`, including no `CAISSA_OPENING_TRAINER_SUPABASE_REF`. Existing variables are scoped to Production or other feature branches and must not be assumed to apply here.
- No environment value was decrypted, pulled, printed, copied, regenerated, or edited.

## Identity and data boundary

- Local persistence uses separate v2 namespaces for each validated Clerk subject and for the guest workspace. Email addresses are rejected as identity keys.
- The UI displays no private repertoire while Clerk identity is unresolved.
- Login, logout, and account switches abort active sync, advance an identity generation, clear the visible practice state, and then load only the new namespace. Persisted data belonging to the previous namespace is retained but not displayed.
- Ownerless v1 data remains in its original key. It is not shown or assigned to a user or guest automatically. Import is allowed only into the guest workspace through an explicit-consent API and guest data is never uploaded.
- Cloud requests require an explicit expected Clerk subject, obtain a fresh token per operation, and reject a response if the subject changes before or after the request. The request body cannot select `user_id`.
- The server verifies the Clerk token, maps `sub` to `public.users.clerk_id`, and applies the resulting internal UUID to every read, upsert, and delete.
- Authenticated burst limits are 120 GETs or 60 mutations per subject and method per minute. This is the repository's process-local serverless limiter; a distributed platform limiter remains a production-hardening option if abuse volume requires cross-instance enforcement.

## Preview fail-closed rule

When `VERCEL_ENV=preview`, the API requires all of the following before constructing a Supabase client:

1. `CAISSA_OPENING_TRAINER_SUPABASE_REF=aqizagaskicotorfpwfn`
2. the configured Supabase URL host resolves to ref `aqizagaskicotorfpwfn`
3. a server-only `SUPABASE_SERVICE_ROLE_KEY` is present

Any mismatch returns the generic sync-unavailable response. A non-production process also rejects the production ref explicitly. The service credential remains server-only; browser roles receive no table grant.

## Migration audit

The proposed migration creates one new table and does not alter existing tables or data.

| Control | Result |
| --- | --- |
| Owner key | `user_id uuid not null references public.users(id) on delete cascade` |
| Account-local identity | `unique (user_id, local_id)` |
| Query index | `(user_id, local_updated_at desc)` |
| RLS | enabled, with no browser policy |
| Browser privileges | all revoked from `public`, `anon`, and `authenticated` |
| Server privileges | only `select`, `insert`, `update`, and `delete` granted to `service_role` |
| Payload constraints | bounded identifiers/text plus JSON type checks; API enforces legal chess moves, 50 lines, 80 plies per line, and 350 kB serialized input |
| Existing objects | no existing table is altered |
| Rollback | `supabase/rollback/20261021214528_opening_trainer_repertoires.rollback.sql` drops only the new table |

The rollback is destructive by definition and is a review artifact only. It was not executed.

## Required human approval before any staging write

1. Approve the migration and rollback as a pair.
2. Apply migration `20261021214528_opening_trainer_repertoires` only to ref `aqizagaskicotorfpwfn`.
3. Configure only the `feature/opening-trainer-v1` Preview scope with the staging Supabase URL, its server-only credential, the explicit staging ref variable, and Clerk development credentials.
4. Re-run the authenticated A/B save, reload, update, and delete matrix against staging with disposable development identities.
5. Keep production migration, variables, deployment promotion, and merge to `main` behind separate explicit approvals.

## Current status

`SECURITY REMEDIATION COMPLETE — STAGING MIGRATION APPROVAL PENDING`
