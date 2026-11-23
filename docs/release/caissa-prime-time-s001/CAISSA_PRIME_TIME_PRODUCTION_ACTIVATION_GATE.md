# CAISSA PRIME TIME ARENAS — PRODUCTION ACTIVATION GATE

Status: **candidate prepared; Production unchanged**

Production Supabase: `jczauvkfkweuvdpurpem`

Production Vercel project: `tv-lavin-chess-game2`

Current Production baseline: `44cd2a07d15f94ae2de6a36ef227a34cfd244d3b`

## Mandatory evidence

- Supabase Production is `ACTIVE_HEALTHY` on PostgreSQL 17.6.
- Seven physical daily backups are `COMPLETED`. The latest verified restore
  point is backup `2344093493` at `2026-11-22T08:49:59.723Z`.
- PITR is disabled; the accepted RPO must therefore account for the daily
  backup interval.
- Production currently has one official Saturdays series, disabled, with zero
  generated occurrences. It has no Prime Time series and no tournament rows.
- The existing scheduler Cron remains active once per minute and was not
  changed.
- The current Production schema accepts only `finish_active_games`; none of the
  strict-deadline helpers or migrations is installed yet.
- The strict-deadline migrations and Saturdays audit hardening were applied and
  certified only in isolated Beta `imtwlzicxaaqjyvrkdsv`.
- The 14-series dry run contains 27 weekly slots and 108 four-week Prime Time
  occurrences, with no Saturday 19:00 duplicate.
- The repository-local Vercel link points to the isolated Beta project. It must
  never be used for a Production command. Production release commands require
  an explicit project and team scope.

## Reviewed database release order

After a separate owner authorization, apply exactly these forward migrations
in timestamp order:

1. `20261123023000_caissa_prime_time_deadline_s001.sql`
2. `20261123024955_caissa_saturdays_operator_audit_hardening.sql`
3. `20261123031500_caissa_prime_time_deadline_race_hardening.sql`

Immediately verify migration history, the `finishing_policy` constraint,
strict-deadline helper definitions, RPC grants, scheduler ownership, and that
historical results did not change. Keep every new recurring series disabled.

## Controlled application release

1. Verify the release checkout HEAD equals the reviewed PR SHA.
2. Re-list Production backups and require a current `COMPLETED` physical
   restore point inside the owner-approved RPO.
3. Link or target `tv-lavin-chess-game2` explicitly under team
   `elcriollitos-projects`; do not inherit this worktree's Beta `.vercel` link.
4. Build the exact candidate and create a Production-target deployment without
   moving the public domains (`--skip-domain`).
5. Run protected smoke checks against that immutable deployment.
6. Promote only after the database checks and strict-deadline certification
   pass. Independently confirm the resulting deployment SHA and aliases.

The current known-good application rollback target is the READY Production
deployment built from `44cd2a07d15f94ae2de6a36ef227a34cfd244d3b`.

## Engine certification while the calendar is disabled

Verify, using controlled test records authorized for Production certification:

- a result committed before `ends_at` remains scored;
- an unfinished or late-settled game becomes `aborted` with
  `termination_reason='tournament_deadline'` and `result=NULL`;
- neither player receives tournament points or an Elo update;
- multiple simultaneous games, move/deadline races, reconnect, retry and Cron
  recovery are idempotent;
- pairing and Next Arena Game stop at the deadline;
- ordinary Arena, Daily and unrelated games retain their existing behavior;
- Saturdays morning retains `finish_active_games`, while the evening occurrence
  resolves to `abort_at_deadline`.

Do not enable or create the calendar until these assertions pass.

## Disabled calendar preparation

After a second explicit authorization:

1. Regenerate `scripts/prime-time-arenas-s001-plan.mjs` at execution time. If a
   proposed first occurrence has passed, advance only that definition to its
   next valid local occurrence; never backfill.
2. Compare all 14 definitions, 27 weekly slots, time controls, capacity 64,
   minimum 4, one-hour duration, timezone and stable slugs with the approved
   plan.
3. Invoke `scripts/manage-official-tournament-series.mjs --execute` only with
   service-role credentials, expected project ref `jczauvkfkweuvdpurpem`, and
   unique audited event IDs. Every create payload must keep `enabled=false`.
4. Confirm exactly 14 new disabled official series, 27 weekly slots, audit rows,
   no materialized past occurrence, and no Saturday 19:00 Prime Time slot.

## Activation requiring a third authorization

1. Resume the 14 Prime Time series with new idempotency event IDs.
2. Enable the existing Saturdays series using only
   `scripts/manage-saturdays-of-chess.mjs`, with the owner's real administrative
   actor ID and a unique event ID.
3. Verify scheduler and ledger output, one occurrence per key, exact local
   times, 60-minute `ends_at`, official identity, and policy assignment.
4. Confirm Schedule and Current are chronological and that Join, registration
   permissions and the public information panel work without exposing operator
   controls.
5. Record all new series IDs, first occurrences, Cron logs and duplicate checks
   before declaring the calendar active.

## Rollback and recovery

- First contain: pause the new series with audited operator commands and stop
  materialization. Cancel only unstarted future occurrences; preserve history.
- Application: restore the known-good Production deployment/aliases from the
  baseline SHA above.
- Database: these are forward migrations, so automatic down-migration is not
  the primary rollback. Prefer feature deactivation and a reviewed corrective
  migration.
- Disaster recovery: if corruption makes restoration unavoidable, obtain an
  explicit destructive-restore authorization, select the closest completed
  physical backup, announce downtime, restore through Supabase, then reverify
  migrations, application secrets, custom role passwords and all post-backup
  writes. Backup restoration does not restore Storage object bodies.

No step in this document authorizes a Production write. Database release,
disabled-series creation and activation are three separate approval gates.
