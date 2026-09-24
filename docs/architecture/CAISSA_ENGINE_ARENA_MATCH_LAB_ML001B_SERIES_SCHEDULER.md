# CAISSA Engine Arena Match Lab ML-001B Series Scheduler

## Scope

ML-001B adds deterministic Match Series orchestration to the approved Match Lab UI. It does not alter engine-provider truthfulness, the Runtime Manager, Tournament scheduling, clocks, ECO resolution, opening-set scheduling, or PGN/history serialization.

## Ownership

- `MatchSeriesController` (`js/arena-match-series.js`) owns the immutable series snapshot, schedule, series/game identities, score, completed game records, and series state.
- `CaissaArena` remains the authoritative owner of the live `Chess` game, board, move application, and Match controls.
- `ArenaRuntimeManager` remains the sole owner of engine instances and their lifecycle. The series controller never creates, searches, stops, or terminates a worker.
- Tournament retains its existing independent scheduler and result pipeline.

## State machine

The controller uses these states:

`IDLE -> PREPARING_GAME -> RUNNING_GAME -> BETWEEN_GAMES -> PREPARING_GAME`

Terminal and control transitions are:

- `RUNNING_GAME <-> PAUSED`
- any active state -> `STOPPING -> STOPPED`
- final completed game -> `COMPLETED`
- engine/readiness/transition failure -> `ERROR`

Starting a new series after `COMPLETED`, `STOPPED`, or `ERROR` creates a new `seriesId`, clears the prior score, and creates a new first-game identity. Starting while active is rejected.

## Configuration snapshot

Start Match captures and deeply freezes:

- title;
- Game 1 participants;
- validated game count (1 through 100);
- move limit in full moves and its derived ply count;
- resolved starting FEN;
- opening shell selection;
- time-control shell selection;
- Save PGN preference;
- deterministic Game 1 color order.

Match configuration controls are disabled while the series is active. Flip Board remains available because it changes only presentation. UI changes cannot mutate the frozen series snapshot.

## Color schedule

The participant selected as White is White in Game 1. The selected Black participant is Black in Game 1. Every later game swaps the prior assignment. Even schedules are exactly balanced; odd schedules differ by one White game at most. No randomization occurs.

## Game identity and stale-event protection

Every series has a unique `seriesId`. Every scheduled game has a unique `gameId` and monotonically increasing generation.

Move records, engine BESTMOVE callbacks, search timeouts, next-search timers, pause/resume continuations, and between-game transitions validate the active game generation. A callback from an older game cannot mutate the board, score, or next game. Existing per-search tokens remain an additional guard; role identity alone is not trusted.

## Results and scoring

Game records preserve:

- round, White, and Black;
- starting FEN;
- complete structured move list;
- `1-0`, `0-1`, `1/2-1/2`, or `*`;
- termination reason and timestamps.

Scoring is standard chess scoring: win 1, draw 0.5, loss 0. Score entries retain points and W-D-L for each original participant, independent of current color. An unfinished stopped/error game is retained as `*` and does not increment games completed or points.

## Move-limit semantics

The UI unit is full moves. The controller converts the configured value to plies (`fullMoves * 2`). After each legal move, natural terminal chess state is checked first. If the game is otherwise non-terminal and the exact ply limit has been reached, the game ends `1/2-1/2` with termination `move-limit`. Engine evaluation is never consulted for this decision.

## Between-game lifecycle and cleanup

At a game boundary Arena:

1. makes the current game terminal and rejects further work for its generation;
2. cancels the active search and stops all Runtime Manager roles;
3. stores the result and full move list;
4. creates the next unique game generation and applies its deterministic colors;
5. resets the authoritative Chess state to the frozen starting FEN;
6. issues the existing Runtime Manager `newGame` lifecycle for player/evaluator roles;
7. waits for all roles to report ready before starting the next engine loop.

The transition uses only a small deterministic scheduling turn. No decorative countdown is added. The final game leaves runtimes under the existing idle policy, with no active search, series timer, or loop.

## Stop and error behavior

Stop applies to the entire active series. It cancels pending transitions and searches, prevents a later game from starting, retains all completed records and score, marks the unfinished game `* / stopped`, and performs normal engine cleanup.

An engine/readiness failure marks the unfinished game `* / engine-error`, transitions the series to `ERROR`, preserves prior games, and terminates runtimes. The scheduler does not silently substitute an engine or continue.

## UI

Multi-game series use the existing Game Status live region for concise milestone announcements and add one compact score block inside Match. Single games do not show `Game 1 / 1` or the score block. The fixed board geometry is unchanged; the right workspace remains the scroll owner. Mobile remains board-first.

## Certification coverage

Unit coverage includes 1/2/6-game schedules, odd balance, bounded custom counts, scoring, full-move conversion, move-limit draws, stop, stale generations, immutable snapshots, game preservation, and new-series reset.

Chromium coverage includes existing single Match behavior; real two- and six-game automatic series with Runtime Manager roles; exact move-limit transition; pause/resume; stop during Game 3; configuration locking; board flip isolation; compact mobile presentation; Tournament and Game regressions; accessibility and console/page-error checks.

## Deferred work

- ML-001C: authoritative clocks, UCI time controls, and flag fall.
- ML-001D: ECO resolution and per-game opening-set scheduling.
- ML-001E: final multi-game PGN serialization and Game History integration.

The in-memory game records and configuration snapshot are intentionally structured so these phases can extend the scheduler without changing its current ownership boundaries.
