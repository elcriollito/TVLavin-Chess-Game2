# CAISSA puzzle difficulty, training estimate, and account progress

These are three separate concepts and must remain visibly and technically
separate.

## Puzzle difficulty

`puzzles.rating` is the rating published by Lichess for that puzzle. It describes
source difficulty. It is never a CAISSA account rating and is never rewritten by
CAISSA.

## Visit-only training estimate

The current Progress tab maintains an in-memory training estimate. It starts at
1800, uses the versioned `session-rating.js` calculation, and disappears when the
page is left. It is labeled as an estimate and must not be described as Elo,
official rating, account rating, or cross-device progress.

- A clean solve records one positive/negative calculation.
- The first legal but incorrect move records the failed outcome once.
- Further moves, skip/Next, hint, and solution reveal do not create another
  rating event.
- A revealed solution never masquerades as a solve.
- Anonymous visitors get only this in-memory behavior. No puzzle history is put
  into cookies, localStorage, IndexedDB, analytics, or Supabase.

## Proposed account progress contract

Persistence is not enabled in this cycle. Before it can be enabled, the isolated
Supabase rehearsal must prove the existing identity path: Clerk bearer/session
verification in the Vercel function, server-side mapping from Clerk subject to
`public.users.id`, and service-role-only database access.

The minimum future event should store: internal user UUID, source version,
PuzzleId, outcome, assisted/revealed flags, incorrect-attempt count, coarse
duration bucket, calculation version, estimate before/after, and an idempotency
key. It should not store IP addresses, raw Clerk tokens, complete move telemetry,
FEN, or the solution line.

Rules for a persisted attempt:

1. The first terminal classification is authoritative: clean solve, failed,
   revealed, or skipped.
2. A hint makes the attempt assisted and ineligible for a positive adjustment.
3. Reveal makes it unrated. A later replay is practice, not a second result.
4. An incorrect move locks the rated outcome as failed even if the user later
   completes the line; completion may still be recorded separately.
5. One idempotency key can commit at most once. A unique constraint must also
   prevent two rated results for the same user, puzzle, source version, and
   training window.
6. Network retries return the original result. They never apply another rating
   change.
7. Re-training the same puzzle becomes rating-eligible again only under a
   separately approved spaced-review rule; the initial proposal is 30 days.
8. Calculation changes require a new version. Historical before/after values are
   immutable and are not silently recomputed.

The persisted number should be called a **CAISSA training estimate** until solve
data, calibration, anti-abuse behavior, and expert review justify a stronger
claim. It must not be presented as federation, Lichess, or official Elo.

## Security boundary

The browser must never receive a Supabase secret or `service_role`. Proposed
progress tables remain RLS-forced and grant no access to `anon` or
`authenticated`; a Clerk-authenticated Vercel endpoint performs ownership checks
and writes through `service_role`. This matches the repository's actual identity
architecture and avoids incorrect `auth.uid()` policies for a non-Supabase JWT.
