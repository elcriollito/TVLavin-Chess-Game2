# CAISSA Opening Trainer — Staging Security Gate

Date: 2026-10-21
Branch: `feature/opening-trainer-v1`
Scope: session-only v1 Preview and preservation of review-only v2 artifacts. Production is out of scope.

## Gate decision

Opening Trainer v1 no longer depends on Supabase. User-created analysis, saved repertoires, selected variations, training color and completed-session progress stay in identity-scoped browser `sessionStorage`, with in-memory fallback. The browser runtime makes no request to `/api/opening-trainer/repertoires`.

The retained cloud endpoint is feature-disabled by default and returns `404 OPENING_TRAINER_CLOUD_DISABLED` before authentication or database construction. The v1 code change does not apply or execute a migration or rollback. **Historical clarification:** a separate, explicitly authorized Staging gate already applied the retained schema SQL on 2026-10-22; its remote ledger version is `20261022034441`. Neither Production nor the v1 browser runtime uses this table.

## Verified environment boundary

- Supabase Staging expected project: `CAISSA-READER-STAGING`, ref `aqizagaskicotorfpwfn`.
- Production denylisted ref: `jczauvkfkweuvdpurpem`.
- The last read-only inspection found no Preview variables applicable to `feature/opening-trainer-v1`, including no opening-trainer staging-ref variable. No environment value was decrypted, pulled, printed, copied, regenerated or edited.
- Consequently, there is no service credential configured for this branch whose binding can be positively certified. This remains a safe negative result because v1 neither initializes cloud sync nor reaches Supabase.
- No migration, rollback, cleanup, row mutation or account creation is part of this gate.

## Session identity boundary

- Guest and each validated Clerk subject have independent repertoire and Analysis-draft session keys. Email-shaped or otherwise invalid user identifiers are rejected.
- The v1 runtime does not read or import retained localStorage v1/v2 repertoire namespaces and does not delete them.
- An identity switch captures the outgoing session draft, advances the workspace generation, terminates Stockfish, aborts WikiBook and Games/PGN work, cancels Explorer and active Quiet Drag, clears Practice, and restores only the incoming identity's legal session draft and saved repertoires.
- A new browser session receives no previous studies. Reloading the same tab restores that tab's current identity data.
- External WikiBook, ECO, Explorer and PGN integrations do not receive saved repertoire contents or training progress.

## Retained v2 controls

- `repertoire-cloud-sync.js`, the server API, sanitizer, Clerk-to-internal-user mapping, ownership scoping, database boundary check, migration and rollback remain tracked.
- API activation requires both `CAISSA_OPENING_TRAINER_STORAGE_MODE=cloud-v2` and `CAISSA_OPENING_TRAINER_CLOUD_V2_ENABLED=true`; neither flag is modified here.
- Preview database access would still require the exact staging ref, matching Supabase URL host and a server-only service credential. Non-production rejects the production ref.
- The retained endpoint uses a process-local serverless limiter. It is documented only as a bounded single-process safeguard and is not certified or represented as a distributed control.
- Full v2 prerequisites are documented in `docs/opening-trainer/SESSION_ONLY_STORAGE.md`.

## Migration status — reconciled against live Staging

- **Target:** `CAISSA-READER-STAGING`, Supabase ref `aqizagaskicotorfpwfn`, PostgreSQL 17.6.
- **Git source file:** `supabase/migrations/20261021214528_opening_trainer_repertoires.sql` (unchanged, reserved for possible v2).
- **Applied separately with human approval:** the source SQL was applied on 2026-10-22 using the Supabase migration capability and **recorded as `20261022034441_opening_trainer_repertoires`**, not as version `20261021214528`.
- **Verified 2026-10-22:** `public.opening_repertoires` exists with **0 rows**; RLS enabled; no RLS policies; `anon` and `authenticated` have no direct SELECT; user table remains at **13 rows**. No data migrated from users.
- **Privilege nuance:** although source SQL explicitly grants only `SELECT/INSERT/UPDATE/DELETE` to `service_role`, the resulting live **effective ACL** also includes privileges such as `TRUNCATE`; this is consistent with existing platform role defaults and must not be described as effective CRUD-only access. The service role bypasses RLS; actual API owner-scoping remains a separate application requirement for any future v2.
- **Rollback:** `supabase/rollback/20261021214528_opening_trainer_repertoires.rollback.sql` is destructive and was **not** run. Do not run it merely because v1 chose session-only storage.
- **Production:** neither migration nor release approved; do not apply the Staging operation to Production.
- **Migration-drift guard:** do not auto-sync the active `supabase/migrations/` directory to a Production database. The mismatched source/remote versions should be reconciled by a separately reviewed future v2 plan, never by blind reapplication or ledger repair.

## Current status

`HUMAN TESTS ACCEPTED — RELEASE PREPARATION ONLY / MAIN AND PRODUCTION BLOCKED`

See `docs/opening-trainer/FINAL_RELEASE_GATE.md` for the final release checklist and remaining controls.
