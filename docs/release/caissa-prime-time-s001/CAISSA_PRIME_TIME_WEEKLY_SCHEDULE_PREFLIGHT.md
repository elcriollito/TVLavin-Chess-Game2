# CAISSA PRIME TIME ARENAS — WEEKLY SCHEDULE PREFLIGHT

Status: **HOLD for Production approval**

Timezone: `America/New_York`

Prepared from Production read-only state at `2026-11-23 02:13:19 UTC`

Implementation branch: `feature/caissa-prime-time-arenas-s001`

## Decision

The proposed schedule is internally consistent and the strict 60-minute engine
policy is certified in the isolated Beta database. Production was read only:
no series, tournaments, Cron settings, authentication configuration, or data
were changed. The 14 Prime Time series remain uncreated and disabled pending
the owner's separate execution approval.

Production activation is not ready yet. It requires a reviewed application and
database release of `abort_at_deadline`, a recoverable Production backup, the
owner's approval of the exact effective first date, and a second authorization
to create the disabled series and enable them.

## Production state

- Project ref: `jczauvkfkweuvdpurpem` (`CAISSA-PRODUCTION-DO-NOT-DELETE`).
- One official series exists: `saturdays-of-chess-s001` with id
  `deaf1f2d-516e-4468-98a2-6bb361da5ec5`.
- That Saturdays series is disabled, has generated zero occurrences, and has
  no `last_generated_at` or `next_generation_at` value.
- Its original configuration remains: Saturday 11:00 and 19:00, 5+0, 60
  minutes, capacity 100, minimum 4, unrated, late join enabled, 7-day lead.
- Production contains zero tournament rows, participants, or linked games.
- The existing `caissa-tournament-scheduler-s001` Cron job is active every
  minute. It was not changed.
- Production contains zero Prime Time series and zero strict-deadline events.

The Saturdays private administration RPC remains separate from the general
official-series operator. Its supplied `p_event_id` is not persisted in an
operator audit table. Before enabling Saturdays in Production, this audit and
idempotency gap must be corrected or explicitly accepted by the owner; the
series must not be recreated through the general operator.

## Grouped series definitions

Every series is weekly, has no automatic end, uses a 2-day generation lead,
has a 60-minute duration, capacity 64, minimum 4, unrated play, late join, and
the existing Arena 2/1/0 scoring contract. Initial creation payloads set
`enabled=false`.

| # | Stable slug | Local time | Weekdays | Control |
|---:|---|---:|---|---|
| 1 | `caissa-prime-time-bullet-1-0-1700-s001` | 17:00 | Sun, Mon, Thu | Bullet 1+0 |
| 2 | `caissa-prime-time-bullet-1-1-1700-s001` | 17:00 | Tue, Fri | Bullet 1+1 |
| 3 | `caissa-prime-time-bullet-2-1-1700-s001` | 17:00 | Wed, Sat | Bullet 2+1 |
| 4 | `caissa-prime-time-blitz-3-2-1800-s001` | 18:00 | Mon, Fri | Blitz 3+2 |
| 5 | `caissa-prime-time-blitz-5-0-1800-s001` | 18:00 | Sun, Tue | Blitz 5+0 |
| 6 | `caissa-prime-time-blitz-3-0-1800-s001` | 18:00 | Wed, Sat | Blitz 3+0 |
| 7 | `caissa-prime-time-blitz-5-5-1800-s001` | 18:00 | Thu | Blitz 5+5 |
| 8 | `caissa-prime-time-rapid-10-0-1900-s001` | 19:00 | Mon, Wed, Fri | Rapid 10+0 |
| 9 | `caissa-prime-time-rapid-10-5-1900-s001` | 19:00 | Sun, Tue, Thu | Rapid 10+5 |
| 10 | `caissa-prime-time-blitz-5-0-2000-s001` | 20:00 | Mon, Fri | Blitz 5+0 |
| 11 | `caissa-prime-time-blitz-3-0-2000-s001` | 20:00 | Tue | Blitz 3+0 |
| 12 | `caissa-prime-time-blitz-5-5-2000-s001` | 20:00 | Wed | Blitz 5+5 |
| 13 | `caissa-prime-time-blitz-3-2-2000-s001` | 20:00 | Sun, Thu | Blitz 3+2 |
| 14 | `caissa-prime-time-rapid-10-5-2000-s001` | 20:00 | Sat | Rapid 10+5 |

This yields 27 new events per week. Saturday 19:00 is intentionally absent;
it belongs to the existing Saturdays of Chess evening occurrence.

## Four-week dry-run calendar

The proposed anchor of November 23 is valid only if execution occurs before
that day's 17:00 start. If approval occurs later, the operator must regenerate
the plan using the next future local occurrence; it must not backfill or create
an event whose start has passed.

| Local date | 17:00 | 18:00 | 19:00 | 20:00 |
|---|---|---|---|---|
| Mon Nov 23 | Bullet 1+0 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Tue Nov 24 | Bullet 1+1 | Blitz 5+0 | Rapid 10+5 | Blitz 3+0 |
| Wed Nov 25 | Bullet 2+1 | Blitz 3+0 | Rapid 10+0 | Blitz 5+5 |
| Thu Nov 26 | Bullet 1+0 | Blitz 5+5 | Rapid 10+5 | Blitz 3+2 |
| Fri Nov 27 | Bullet 1+1 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Sat Nov 28 | Bullet 2+1 | Blitz 3+0 | Existing Saturdays 5+0 | Rapid 10+5 |
| Sun Nov 29 | Bullet 1+0 | Blitz 5+0 | Rapid 10+5 | Blitz 3+2 |
| Mon Nov 30 | Bullet 1+0 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Tue Dec 1 | Bullet 1+1 | Blitz 5+0 | Rapid 10+5 | Blitz 3+0 |
| Wed Dec 2 | Bullet 2+1 | Blitz 3+0 | Rapid 10+0 | Blitz 5+5 |
| Thu Dec 3 | Bullet 1+0 | Blitz 5+5 | Rapid 10+5 | Blitz 3+2 |
| Fri Dec 4 | Bullet 1+1 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Sat Dec 5 | Bullet 2+1 | Blitz 3+0 | Existing Saturdays 5+0 | Rapid 10+5 |
| Sun Dec 6 | Bullet 1+0 | Blitz 5+0 | Rapid 10+5 | Blitz 3+2 |
| Mon Dec 7 | Bullet 1+0 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Tue Dec 8 | Bullet 1+1 | Blitz 5+0 | Rapid 10+5 | Blitz 3+0 |
| Wed Dec 9 | Bullet 2+1 | Blitz 3+0 | Rapid 10+0 | Blitz 5+5 |
| Thu Dec 10 | Bullet 1+0 | Blitz 5+5 | Rapid 10+5 | Blitz 3+2 |
| Fri Dec 11 | Bullet 1+1 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Sat Dec 12 | Bullet 2+1 | Blitz 3+0 | Existing Saturdays 5+0 | Rapid 10+5 |
| Sun Dec 13 | Bullet 1+0 | Blitz 5+0 | Rapid 10+5 | Blitz 3+2 |
| Mon Dec 14 | Bullet 1+0 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Tue Dec 15 | Bullet 1+1 | Blitz 5+0 | Rapid 10+5 | Blitz 3+0 |
| Wed Dec 16 | Bullet 2+1 | Blitz 3+0 | Rapid 10+0 | Blitz 5+5 |
| Thu Dec 17 | Bullet 1+0 | Blitz 5+5 | Rapid 10+5 | Blitz 3+2 |
| Fri Dec 18 | Bullet 1+1 | Blitz 3+2 | Rapid 10+0 | Blitz 5+0 |
| Sat Dec 19 | Bullet 2+1 | Blitz 3+0 | Existing Saturdays 5+0 | Rapid 10+5 |
| Sun Dec 20 | Bullet 1+0 | Blitz 5+0 | Rapid 10+5 | Blitz 3+2 |

The plan generates 108 new occurrences in four weeks. When the existing
Saturday evening event is enabled, the 17:00–21:00 program totals 112 events;
including the separate Saturday morning event, all official weekly inventory
totals 116 occurrences over the same four weeks.

## Strict deadline contract

`abort_at_deadline` is opt-in and applies only to Prime Time slug namespace
occurrences and the existing Saturdays evening occurrence. Standard Arena,
Daily correspondence, unrelated games, and Saturdays morning remain on their
existing policies.

At `ends_at`, the server advisory-locks the tournament, blocks pairing and
Next Arena Game, preserves terminal results with an effective server timestamp
strictly before the cutoff, and aborts every other unfinished game with
`result=NULL`, `termination='tournament_deadline'`, and no Arena score or Elo.
Late terminal writes are recovered as audited aborts. The browser displays:
`Arena time expired — Game aborted. No points awarded.`

Cron remains a recovery mechanism. State, move, finish, scoring, and rating
boundaries independently enforce the cutoff using server timestamps.

## Certification evidence

- Both deadline migrations compiled transactionally and were applied only to
  isolated Beta project `imtwlzicxaaqjyvrkdsv`.
- The Beta test transaction rolled back all fixtures and covered multiple
  simultaneous games, valid pre-deadline completion, pre-deadline flag fall,
  delayed post-deadline result recovery, Elo isolation, idempotent retry,
  Next rejection, standard Arena isolation, and Daily isolation.
- Beta has zero strict tournaments and zero Prime Time series after testing;
  its eight pre-existing future tournaments remain present.
- `anon`, `authenticated`, and `public` have no execute permission on the new
  private helpers or replaced game mutation RPCs; `service_role` does.
- 194 Online tests and 39 Arena browser tests passed. Browser coverage includes
  Chromium, Firefox, WebKit, and the existing mobile accessibility case.
- The Supabase security advisor reported only the existing informational
  RPC-only/RLS-without-policy pattern; no new table exposure was introduced.
- The managed Codex Security diff scanner did not run. Exact error:
  `Review changes requires a non-bare Git worktree with a resolvable HEAD`.
  Git locally reported a valid linked worktree and resolvable HEAD. This is a
  scanner infrastructure HOLD, not a scanner PASS.

## Production execution requiring approval

1. Approve and deploy the reviewed application/database candidate to a
   protected Production release path, after a recoverable database backup and
   rollback rehearsal.
2. Reverify Production project ref, Clerk Production identity, RLS/RPC grants,
   Cron ownership, and zero conflicting occurrences.
3. Choose the first local date based on the actual approval time. Re-run the
   dry plan and compare all occurrence keys and times.
4. Approve creation of the 14 series as **disabled** through
   `scripts/manage-official-tournament-series.mjs`, with the expected project
   ref and stable audit event IDs.
5. Inspect the 14 stored definitions and audit rows. Confirm no Saturday 19:00
   duplicate and no past occurrence.
6. Separately approve enabling/resuming the 14 series. Use the dedicated
   Saturdays administrator only after resolving or accepting its audit gap.
7. Verify generated rows, strict policy, registration windows, exact 60-minute
   `ends_at`, occurrence-key uniqueness, and scheduler ledger.
8. If rollback is needed, pause the new series and cancel only unstarted future
   occurrences through audited controls. Do not delete history or alter the
   Saturdays identifiers.

## First-14-day measurement

Aggregate per occurrence and by local hour/control: active registrations,
distinct participants, linked games, completed scored games, deadline aborts,
no-shows (`joined` with zero played games), and low-turnout cancellation events.
Review the first 14 days before increasing capacity or adding overlaps. A
dedicated cancellation-reason metric should be confirmed before the program is
activated; do not infer all cancellations as low turnout.
