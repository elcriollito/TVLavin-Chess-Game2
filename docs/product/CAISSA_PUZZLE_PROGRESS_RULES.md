# CAISSA puzzle difficulty, training estimate, and account progress

These are three separate concepts and must remain visibly and technically
separate.

## Puzzle difficulty

`puzzles.rating` is the rating published by Lichess for that puzzle. It describes
source difficulty. It is never a CAISSA account rating and is never rewritten by
CAISSA.

## Guest training estimate

Anonymous practice maintains an in-memory training estimate. It starts at 1800
and disappears when the page is left. This is not an official rating.

- A clean solve records one positive/negative calculation.
- The first legal but incorrect move records the failed outcome once.
- Further moves, skip/Next, hint, and solution reveal do not create another
  rating event.
- A revealed solution never masquerades as a solve.
- Anonymous visitors get only this in-memory behavior. No puzzle history is put
  into cookies, localStorage, IndexedDB, analytics, or Supabase.

## Signed-in account progress contract

The account progress migration and API persist results after Clerk bearer
verification in the Vercel function, server-side mapping to `public.users.id`,
and a private service-role-only Supabase RPC. Apply and verify the migration,
then deploy the Worker puzzle lookup endpoint before deploying the Vercel page.
Until that rollout completes, this remains unshipped code.

The stored event includes internal user UUID, source version, PuzzleId, verified
source rating, outcome, assisted flag, calculation version, before/after values,
and an idempotency key. It omits IP, tokens, FEN, solution and move telemetry.
The signed-in browser keeps unacknowledged minimal outcomes in user-scoped local
storage and retries with the same operation IDs after a reload or reconnection.
It removes each outcome only after the server confirms it. Anonymous visitors
do not write practice history to browser storage.

Rules for a persisted attempt:

1. The first terminal classification is authoritative: clean solve, failed,
   revealed, or skipped.
2. A hint makes the attempt assisted and ineligible for a positive adjustment.
3. Reveal makes it unrated. A later replay is practice, not a second result.
4. An incorrect move locks the rated outcome as failed even if the user later
   completes the line; completion may still be recorded separately.
5. One idempotency key can commit at most once. Account-scoped transaction locking
   also prevents two rated results for the same puzzle and source within 30 days.
6. Network retries return the original result. They never apply another rating
   change.
7. Re-training the same puzzle becomes rating-eligible again after 30 days.
8. Calculation changes require a new version. Historical before/after values are
   immutable and are not silently recomputed.

The persisted number is called a **CAISSA training estimate** until solve
data, calibration, anti-abuse behavior, and expert review justify a stronger
claim. It must not be presented as federation, Lichess, or official Elo.

## Security boundary

The browser must never receive a Supabase secret or `service_role`. Proposed
progress tables remain RLS-forced and grant no access to `anon` or
`authenticated`; a Clerk-authenticated Vercel endpoint performs ownership checks
and writes through `service_role`. This matches the repository's actual identity
architecture and avoids incorrect `auth.uid()` policies for a non-Supabase JWT.
