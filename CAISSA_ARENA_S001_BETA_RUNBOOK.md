# CAISSA Arena S001 Founders Beta Runbook

Status: prepared; execute only after an isolated preview is verified  
Application candidate: `86224d33f67ac7343e84a2406caac6c01b264843`
Expected live session: 30–45 minutes including setup and evidence capture

## Roles

- Owner/organizer: Tester A.
- Participants: Tester A, Tester B, Tester C, Tester D.
- Observer/recorder: owner or a fifth non-playing operator if available.

Use four distinct real Clerk accounts owned by the intended testers. Do not alter
production accounts, copy production subject IDs into documents, or use a guest
account.

## Gate 1 — verify the environment before any write

An operator with existing deployment authority must verify and record:

1. the Vercel team and project ID;
2. that the deployment is a branch preview of the authoritative
   `tv-lavin-chess-game2` project, never a production deployment or alias;
3. the exact application commit above;
4. a separate non-production Clerk instance or test accounts;
5. a separate non-production Supabase project with no production data;
6. preview-only environment-variable assignments;
7. no production domain attached to the preview;
8. the current production deployment ID and rollback target, without changing it.

Stop immediately if any credential, project, database, account, or domain cannot
be proven non-production.

## Gate 2 — preview configuration

Because AUTH-004D signup is restricted, the operator must create or invite four
separate test users after the isolated backend exists. Give each tester a unique
account and private credential/recovery path; never share one password or browser
profile. Record only Tester A/B/C/D aliases and Clerk subject IDs in the private
branch configuration. Add all four subjects to both internal/beta allowlists and
only Tester A to the organizer allowlist. Each tester must complete AUTH-004D
Development sign-in in a separate browser profile before the session.

Set these only in the verified preview environment. Values below are names and
shapes, not credentials:

```text
CAISSA_ONLINE_ROLLOUT=internal
CAISSA_ONLINE_INTERNAL_USERS=<A,B,C,D Clerk subjects>
CAISSA_ONLINE_TOURNAMENTS=1
CAISSA_ONLINE_ARENA=1
CAISSA_ONLINE_ARENA_BETA_USERS=<A,B,C,D Clerk subjects>
CAISSA_ONLINE_ARENA_CREATE=1
CAISSA_ONLINE_TOURNAMENT_ADMINS=<Tester A Clerk subject>
```

Configure the existing non-production Clerk and Supabase variables required by
CAISSA Online. Never paste their values into this runbook, screenshots, chat, or
Git. Confirm `/api/online?action=config` exposes capability booleans and a
publishable Realtime key only—not the subject allowlists or service key.

Keep Vercel SSO/deployment protection enabled. For testers who are not team
members, issue the shortest practical authenticated share access and verify its
expiry before sending it privately. Do not attach a custom or Production domain.

Before the Git push, add exact branch-scoped overrides for all five inherited
Preview variables. Install the AUTH-004D Clerk pair; replace the Supabase/EAE
values with only the dedicated beta project values actually required; and use
inert branch overrides for unrelated Blob/Together capabilities. Do not allow
the branch to inherit main CAISSA Development identity or unrelated shared
Preview credentials.

## Gate 3 — database preparation

Apply migrations only to the verified isolated Supabase database. A clean
project must receive `supabase-schema.sql`, then `supabase-schema-v2.sql`, then
all files under `supabase/migrations/` in filename order. Confirm the target
project reference twice before every hosted batch. The terminal Arena migration
is:

```text
supabase/migrations/20261120033413_caissa_online_arena_s001.sql
```

Do not run any production migration. After apply, verify:

- Arena RPC execute is absent for `anon` and `authenticated`;
- Arena tables have RLS enabled and no browser write grants;
- `service_role` has only the intended table operations/RPC execution;
- the private tournament Realtime policy exists;
- no Arena tournament row exists yet unless intentionally created in this preview.

## Gate 4 — smoke test before inviting participants

1. Open the protected preview `/online` as Tester A.
2. Confirm the normal board, New Game, Games, and Lobby still load.
3. Confirm Lobby -> Tournaments shows the real empty beta directory, not the
   synthetic demo.
4. In desktop DevTools on the same authenticated origin, create the tournament:

```js
const { createOnlineApi } = await import('/js/online/online-api.js');
const api = createOnlineApi();
const startsAt = new Date(Date.now() + 5 * 60_000).toISOString();
await api.command('tournament.create', {
  name: 'CAISSA Arena S001 — Founders Beta',
  startsAt,
  durationMinutes: 15,
  timeControlId: 'blitz-3-2'
});
```

5. Refresh and confirm: private Arena, 3+2, unrated, 15 minutes, capacity/minimum
   four, late join, no chat.
6. Attempt access from a fifth non-allowlisted test account and confirm the Arena
   is not discoverable and tournament commands return authorization failure.

The console snippet uses the page’s existing authenticated API client; it does not
expose or require copying a bearer token.

## Four-player human acceptance

Use one browser profile/device per tester. Synchronize clocks and start recording
timestamps before joining.

- [ ] A, B, C, and D sign in to distinct authorized accounts.
- [ ] All four see the same named tournament, control, start/end, and player count.
- [ ] Each joins exactly once; one tester may retry Join to confirm harmless
      idempotency.
- [ ] At start, all four see two distinct games and no player appears twice.
- [ ] A/B and C/D make legal moves independently; clocks decrement from server
      anchors and increments are correct.
- [ ] Attempt one illegal move and confirm it is rejected without board corruption.
- [ ] Finish one game by checkmate or resignation.
- [ ] Finish the other with any valid canonical result, including a draw if agreed.
- [ ] All four see the same updated 2/1/0 standings.
- [ ] Eligible players receive subsequent server-confirmed pairings.
- [ ] Switch New Game -> Games -> Lobby -> Tournaments -> Tournament Standings ->
      Tournament Games and back; the active board and clocks survive.
- [ ] One player refreshes during an active game; membership, pairing, position,
      clocks, and countdown recover.
- [ ] One waiting player closes the page long enough for presence to expire; no
      unlimited replacement games are created. Reopen and verify safe recovery.
- [ ] If time permits, withdraw a waiting player and confirm no new assignment.
- [ ] At the configured end, confirm no new pairings appear.
- [ ] Let active games finish; the state remains `finishing` until results score.
- [ ] All four receive identical `completed` status and final ranks.
- [ ] Mobile tester confirms board first and tournament context below, with usable
      scroll, touch interaction, and no board distortion.

## Evidence to record

Record without secrets or unnecessary personal data:

- preview URL and deployment ID;
- exact Git commit and migration version;
- environment/project identifiers, redacting all values that are credentials;
- four tester aliases and PASS/FAIL only (not emails or tokens);
- tournament UUID;
- start/end timestamps;
- game UUIDs, pairings, results, and final standings;
- screenshots of directory, two simultaneous games, updated standings, recovery,
  finishing, final standings, desktop, and mobile;
- browser/OS and any console/network errors;
- owner’s explicit final PASS or FAIL.

## Failure rules

Mark the session FAIL and stop new play if any player is double-paired, an
unauthorized account sees private data, a browser can submit a result/clock,
scores duplicate, a withdrawn/disconnected player loops pairings, a refresh loses
canonical state, a post-expiry pairing appears, or identities/clocks diverge.

Do not repair data manually during the certification session. Preserve evidence,
turn the preview Arena flags off, and follow the rollback plan.

## Current blocker

The authorized data-less Supabase branch attempt failed closed after 15/36
Reader staging migrations at the staging-specific canonical bridge and was
deleted. A repeated branch would fail the same ledger contract. The only verified
backend path is one dedicated Supabase project, currently quoted at $10/month.
That new billable resource needs narrowly scoped owner approval.

AUTH-004D is verified as a separate Development application and is authorized by
the final mission only after backend and Vercel isolation. The Arena branch still
has no scoped variables/deployment and would otherwise inherit five shared
Preview credentials, including main CAISSA Development identity. No protected
Preview URL has been created. Do not advance to Gate 2 until the dedicated
project approval is recorded and all branch-scoped overrides are ready before
the Git push. See `CAISSA_ARENA_S001_FINAL_UNBLOCK_REPORT.md`.
