# CAISSA Tournaments Expansion S001 — Release Candidate

Date: 2026-11-21 (America/New_York)

## Release state

This is a local, disabled-by-default candidate. It has not changed the protected Human QA tournament, the isolated Supabase project, the stable beta alias, production, or shared staging.

| Capability | Local status | Hosted status |
| --- | --- | --- |
| Arena capacity 100 | PostgreSQL, final-slot race, 100-player/50-game load and browser gates pass | Not migrated or enabled |
| Rated Arena | Exactly-once Elo transaction and separate-pool gates pass | Flag remains off; no existing unrated game is changed |
| Daily backend | Deadlines, timeout recovery, double round robin, advancement and Daily rating pool pass | Not migrated or enabled |
| Daily UX | Directory, create form, Games list, board reopen and refresh persistence pass in three engines | Not deployed with the capability enabled |
| Saturdays of Chess | Four-week generation, DST, lifecycle, admin controls and idempotency pass | Series row defaults to disabled; no occurrences have been created |

## Independent flags

- `CAISSA_ONLINE_ARENA_100`
- `CAISSA_ONLINE_TOURNAMENT_RATED`
- `CAISSA_ONLINE_DAILY`
- `CAISSA_ONLINE_DAILY_CREATE`
- `CAISSA_ONLINE_DAILY_RATED`
- `CAISSA_ONLINE_WEEKLY_ARENAS`
- `CAISSA_ONLINE_WEEKLY_ADMIN`

Every new flag is Preview-only and fail-closed. The weekly database configuration also has `enabled=false` and `launch_not_before=2026-11-28`.

## Reviewed migration plan

The only new database artifact is `supabase/migrations/20261121042618_caissa_tournaments_expansion_weekly_daily_s001.sql`.

1. Wait until the November 21 Human QA event is complete and the owner approves the expansion window.
2. Reconfirm the target is only Supabase project `imtwlzicxaaqjyvrkdsv`; record tournament `6575b2b1-550d-4309-ad85-ed47cff44204` before the migration.
3. Take a project backup or confirm point-in-time recovery appropriate to the plan before applying the forward migration.
4. Apply the exact reviewed file once. Do not fabricate migration history and do not run it against staging or production.
5. Verify RLS, grants, function ownership, `pg_cron`, the single named cron job and the disabled series row.
6. Verify the protected Human QA tournament row and participant/game counts are unchanged.
7. Deploy a unique isolated Preview with all expansion flags off. Enable one capability at a time only for its QA window.

The migration is additive and forward-only. It does not truncate, delete or reset application data.

## Automated evidence

- Online unit/integration: 149/149 pass.
- Browser matrix: 126/126 pass across Chromium, Firefox and WebKit, including Daily enrollment/reopen and organizer-only weekly management.
- PostgreSQL 17.11 isolated rehearsal: pass, including 100 entrants, 50 simultaneous games, Daily timeout, exactly-once rating retry, non-stalling two-player edge groups and eight DST-correct weekly occurrences.
- Final-slot two-session race: exactly one contender admitted; the other received `CAISSA_ONLINE_ARENA_FULL`; persisted count remained 4.
- Local load: 100-player standings projection plus 50 private Realtime broadcast requests completed within the 2-second test budget.
- Dependency audit: `npm audit --omit=dev --audit-level=moderate` reported zero vulnerabilities.
- Public artifact audit: pass for the exact default-deny allowlist.

The local PostgreSQL distribution does not include `pg_cron`; the exact migration was parsed through that final extension statement, and all preceding SQL plus the full behavioral harness passed. The cron installation/job block remains a hosted preflight gate.

## Disable and rollback procedure

The primary rollback is operational and non-destructive:

1. Turn off all expansion flags in the isolated Preview.
2. Pause the weekly series through the organizer-only operation; verify `enabled=false`.
3. If scheduler isolation is required, unschedule only the named job `caissa-tournament-scheduler-s001` after recording its job ID.
4. Leave completed and in-progress records intact. Do not drop tables while Daily games exist.
5. Revert the application deployment to the previous known isolated-beta deployment.
6. Use a reviewed forward-fix migration for schema corrections; do not rewrite applied history.

## Cost and persistence

No new project or paid service is required. The scheduler uses the existing isolated Supabase database and `pg_cron`. Daily games are long-lived and can add PGN, event and Realtime traffic; retention, backups and database quotas must be confirmed before enabling Daily or creating real seven-day-per-move events. A 100-player double round robin is intentionally prevented by bounded Daily groups; Live Arena can create up to 50 games per pairing wave.

## Human QA runbook

Use four normal AUTH-004D Development accounts on the protected isolated Preview.

1. Confirm the URL identifies the isolated Preview and that no expansion flag is enabled unintentionally.
2. For Arena 100, enable only the capacity flag, create an unrated 16-player test event, join/withdraw/rejoin, then repeat the final-slot race with the chosen capacity.
3. For Rated Arena, enable its flag only after recording all four starting Blitz ratings. Complete decisive and drawn games, reload, and verify one rating update per result and no Daily-pool change.
4. For Daily, enable Daily and Daily Create but keep Daily Rated off. Create a 1-day-per-move test with group size 4, join four accounts, open both colors, make legal moves, sign out, reconnect and confirm FEN/PGN/deadline persistence.
5. Use the injected-clock/staging procedure for timeout and round advancement; do not wait real days and do not create a long-lived test without retention approval.
6. For Saturdays of Chess, expose the featured schedule with the series still paused. Verify ordinary users cannot see admin controls. After explicit launch approval only, the sole organizer enables the series and confirms exactly eight upcoming occurrences, 11 AM/7 PM Eastern, starting no earlier than November 28.
7. Confirm cancellation under four entrants, late join during an active weekly Arena, no new pairing after 60 minutes, finishing of active games and final standings.
8. Turn the tested feature flags back off unless the owner separately authorizes continued beta operation.

## Remaining release gates

- The managed Codex Security diff scanner still rejects the valid worktree/range.
- The exact migration has not been applied to the hosted isolated database.
- The `pg_cron` extension and named job have not been verified on the hosted project.
- No expansion capability has completed hosted four-identity Human QA.
- The owner has not approved enabling the recurring series or the November 28 occurrence.

Therefore this document does not declare the expansion live or Human QA passed.
