# CAISSA Arena S001 Four-Person Human QA Runbook

Status: ready after automated hosted certification; Human QA pending
Protected origin: https://caissa-arena-s001-beta-isolated.vercel.app
Backend: Supabase `imtwlzicxaaqjyvrkdsv`
Identity: Clerk AUTH-004D Development

Use the time-limited private Vercel share URL from the owner handoff message.
Do not forward it outside the four-person test group. The stable origin remains
protected by Vercel Authentication.

## Assign identities

- Tester A: `caissa-arena-a+clerk_test@example.com`
- Tester B: `caissa-arena-b+clerk_test@example.com`
- Tester C: `caissa-arena-c+clerk_test@example.com`
- Tester D: `caissa-arena-d+clerk_test@example.com`

AUTH-004D is a Clerk Development instance. Use the Development email test code
`424242`. Each tester must use a separate browser profile/private context or a
separate device. Never sign two testers into the same profile.

## Preflight

The owner records:

- final commit and Vercel deployment ID from
  `CAISSA_ARENA_S001_HOSTED_BETA_HANDOFF.md`;
- the tournament UUID;
- browser/device for A, B, C, and D;
- session start/end times;
- one PASS/FAIL result per checklist item.

Stop if the URL is public without the private share parameter, the browser shows
a non-Development Clerk instance, the config hostname is not
`imtwlzicxaaqjyvrkdsv.supabase.co`, or any tester sees main/staging data.

## Sign in

1. Open the private Vercel share URL.
2. Go to `/signin`.
3. Enter the assigned email identifier.
4. Enter `424242` at the email-code prompt.
5. Continue to `/online`.
6. Confirm the account label is unique before proceeding.

## Create and join

Tester A opens Lobby -> Tournaments and creates one private Arena using an
approved control. Keep it unrated. A, B, C, and D join once. One tester repeats
Join to confirm idempotency. Do not create additional tournaments unless the
first test is formally marked FAIL and its evidence is recorded.

## Mandatory checklist

- [ ] All four see the same tournament name, control, start/end, and player count.
- [ ] At start, two different games contain exactly four unique players.
- [ ] Both boards accept legal moves concurrently.
- [ ] Clocks decrease from server anchors and increments match the selected control.
- [ ] One illegal move is rejected without changing the canonical position.
- [ ] Finish both games by canonical results and confirm 2/1/0 scoring exactly once.
- [ ] The next pairings avoid immediate rematches while unseen opponents remain.
- [ ] One tester refreshes during an active game and recovers pairing, position,
      clock, standings, and countdown.
- [ ] Navigate New Game -> Games -> Lobby -> Tournament -> Standings and back;
      the active board survives.
- [ ] Let one waiting presence expire, reopen it, and confirm safe recovery
      without unlimited replacement games.
- [ ] At tournament end, confirm no new games are created.
- [ ] Active games may finish while status is `finishing`.
- [ ] All four eventually see `completed` and identical final ranks.
- [ ] A mobile tester confirms board-first layout, usable touch interaction,
      reachable tournament context, and no horizontal distortion.

## Evidence

Capture screenshots of registration, the two simultaneous boards, standings
after scoring, re-pairing, reconnect recovery, `finishing`, and final
standings. Record tournament/game UUIDs and console/network errors. Do not record
tokens, Vercel share secrets, Supabase keys, or Clerk keys.

## Failure and rollback

Mark Human QA FAIL and stop new play for any authorization leak, duplicate
participant, double pairing, cross-game private update, client-controlled clock
or result, duplicate scoring, identity mismatch, post-end pairing, or recovery
failure.

Disable only the three isolated Preview flags
`CAISSA_ONLINE_ARENA_CREATE`, `CAISSA_ONLINE_ARENA`, and
`CAISSA_ONLINE_TOURNAMENTS`; preserve all evidence. Do not delete database
rows, reset the beta project, push, merge, promote, or touch Production/shared
staging.

The owner records the final decision. Automated certification does not count as
Human QA.
