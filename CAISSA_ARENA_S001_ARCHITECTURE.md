# CAISSA Arena S001 Architecture

Status: locally certified application candidate; remote beta environment not provisioned  
Branch: `feature/caissa-online-arena-s001`  
Baseline: `6df4c2bf4be00fea72f88d63cae726e8515c4380` (`origin/main`)  
Application candidate: `86224d33f67ac7343e84a2406caac6c01b264843`

## Scope

Season 001 adds a private, unrated, four-member Arena to the existing `/online`
product. It reuses the current server-authoritative chess engine, game rows,
clocks, identity projection, polling recovery, and private Realtime invalidation.
It does not add Swiss or round-robin formats, Chess960, streak scoring, chat,
public organizers, public discovery, or a second board/game authority.

## Audit and dependency map

| Existing owner | Reused contract | Arena addition |
| --- | --- | --- |
| `api/online.js` | authenticated command boundary, common request limits, rollout mode | gated tournament create/join/withdraw/sync commands |
| `online-service.js` | service-role RPC adapter and safe projection | four Arena RPC adapters |
| `online-game-engine.js` | legal chess moves, canonical result and PGN projection | no fork; Arena games are ordinary Online games |
| native Online migration | games, clocks, events, ratings, presence, tournaments | lifecycle columns, pairings, exact-once scoring, audit events |
| `online-realtime.js` | authenticated private topic and resync coalescing | `online-tournament:<uuid>` subscription |
| `online-clock.js` | browser interpolation of server clock anchors | unchanged |
| persistent CAISSA board | one board DOM and Quiet Drag | contextual panel only; no board recreation |
| public identity service | canonical display names and redaction | standings/game projection through the same resolver |

The initial schema already contained tournament, participant, and tournament-game
tables and an Arena format value. The missing production-quality contracts were:
the seven-state lifecycle, participant/pairing states, transactional pairing,
exact-once 2/1/0 scoring, private Arena RPCs and Realtime authorization, beta
authorization, recovery, and a real tournament user interface.

## Runtime flow

1. An authenticated non-guest request reaches the existing Online API.
2. The server checks the non-production rollout, both Arena gates, and the exact
   beta-subject allowlist. Creation also checks its separate administrator list.
3. The service-role adapter calls an invoker-rights PostgreSQL RPC. Browser roles
   have no execute privilege on the Arena RPCs and no direct Arena-table access.
4. The RPC takes a tournament-scoped transaction advisory lock. Creation also
   takes an event-scoped advisory lock.
5. Lifecycle reconciliation scores completed games, expires disconnected waiters,
   transitions time-based states, and pairs eligible waiters transactionally.
6. A pairing creates a normal `caissa_online_games` row with the configured
   authoritative clock, plus durable pairing and tournament-game associations.
7. Database triggers and the API emit private invalidation messages. Clients
   always recover through a canonical state read; Realtime payloads are not game
   or tournament authority.
8. The UI projects the returned Arena into Lobby discovery/details and a
   contextual Standings/Games tab while retaining the existing board instance.

## Lifecycle and invariants

Tournament states:

`draft -> scheduled -> registration_open -> active -> finishing -> completed`

`registration_open -> cancelled` occurs when the minimum of four is not met.

Participant states are `registered`, `waiting`, `playing`, `withdrawn`, and
`disconnected`. Pairing states are `waiting`, `assigned`, `ready`, `active`,
`finished`, and `expired`.

Core invariants:

- All time transitions use PostgreSQL timestamps.
- Tournament and event locks serialize cross-instance work.
- Row locks and `FOR UPDATE SKIP LOCKED` claim waiting participants.
- A participant is moved to `playing` before the next pairing iteration.
- Active-game checks and partial unique indexes provide defense in depth.
- A withdrawn participant is never requeued automatically.
- An expired presence moves a waiting participant to `disconnected`; an
  authenticated later sync may restore `waiting` before tournament close.
- Completed games are guarded by `scored_at is null` and a unique pairing link.
- At expiry, the Arena enters `finishing`, stops new pairings, lets active games
  resolve, then calculates stable final ranks and enters `completed`.

## Pairing policy

The queue order is waiting time followed by stable user ID. Candidate ordering
then prefers:

1. a player other than the immediately previous opponent;
2. the smallest rating distance;
3. the deterministic queue order.

Color selection minimizes the combined absolute color imbalance. A stable user-ID
tie break makes equal-cost choices reproducible. Safety and liveness take priority
over rating similarity and rematch avoidance.

## Scoring

The explicit contract identifier is `arena-s001-2-1-0`:

- win: 2 points;
- draw: 1 point;
- loss: 0 points.

The legacy tournament helper remains unchanged. Ranking order is points, wins,
draws, join time, then user ID. The same ordering is used during the event and
for final ranks.

## Time controls

The only accepted controls are `1+0`, `1+1`, `3+0`, `3+2`, `5+0`, `5+5`,
`10+0`, and `10+5`. The Founders Beta defaults to 3+2 Blitz, 15 minutes,
unrated, capacity four, minimum four, late join enabled, no chat, and private
directory visibility. Tournament countdowns use server `startsAt`/`endsAt`;
game clocks continue to use the existing Online clock anchor.

## API contract

All commands use the existing versioned Online event envelope and authenticated
`POST /api/online` endpoint.

| Event | Payload | Authority |
| --- | --- | --- |
| `tournament.create` | `name`, `startsAt`, `durationMinutes`, `timeControlId` | beta member plus organizer allowlist and creation flag |
| `tournament.join` | `tournamentId` | beta member only |
| `tournament.withdraw` | `tournamentId` | joined beta member only |
| `tournament.sync` | `tournamentId` | beta member only |

`GET /api/online?action=state` reconciles Arena state before reading ordinary game
state so a newly created tournament game is returned in the same recovery read.
The response adds `state.arena` with the private directory and selected canonical
tournament snapshot.

## Feature flags

All values default off or empty:

- `CAISSA_ONLINE_TOURNAMENTS=1`
- `CAISSA_ONLINE_ARENA=1`
- `CAISSA_ONLINE_ARENA_BETA_USERS=<four Clerk subjects>`
- `CAISSA_ONLINE_ARENA_CREATE=1`
- `CAISSA_ONLINE_TOURNAMENT_ADMINS=<organizer Clerk subjects>`

`isArenaEnabled` returns false for the production rollout even if every flag is
present. The public config advertises only capability booleans, never allowlists or
credentials.

## Database migration

`supabase/migrations/20261120033413_caissa_online_arena_s001.sql` is forward-only.
It normalizes legacy `upcoming`/`live` tournament rows to the expanded lifecycle,
adds the minimum lifecycle/stat/audit columns, creates durable pairing and event
tables, installs RPCs/triggers/private Realtime policy, and grants only the needed
table operations and RPC execution to `service_role`.

The migration has been applied to a disposable PostgreSQL 17 database together
with the three prerequisite Online migrations. It has not been applied to any
remote or production database.

## UI architecture

Lobby -> Tournaments provides authorized directory search/filtering, status,
control, duration, participant count, details, rules, join, and withdraw. Joining
reveals one contextual top-level Tournament tab with Standings and Games bodies.
All user-derived strings are inserted with `textContent`.

The board root is not replaced when navigating. Desktop retains the established
board-left/workspace-right layout. Mobile keeps the Mobile 2.0 destination header,
board first, and tournament context below. The existing synthetic demo route is
retained and visibly labeled as a demo; it is never mixed with canonical state.

## Changed application and test files

- API: `api/online.js`, `api/_lib/online-arena.js`, Online service/projection/
  Realtime helpers.
- Client: `online.html`, `css/online.css`, Online page/protocol/Realtime/tournament
  modules.
- Database: the S001 migration above.
- Tests/config: Arena API/engine/migration/PostgreSQL/browser tests, native shell
  and browser regression updates, package scripts, and Playwright Online config.

## Deployment boundary

No Vercel project, Supabase project, or environment file is linked in the isolated
worktree. No remote deployment, database migration, production variable change,
push, PR, merge, or production action was performed.
