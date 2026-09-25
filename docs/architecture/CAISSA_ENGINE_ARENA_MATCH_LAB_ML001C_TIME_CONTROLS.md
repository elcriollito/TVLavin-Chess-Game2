# CAISSA Engine Arena Match Lab ML-001C — Time Controls

## Scope

ML-001C gives Match and Match Series authoritative chess clocks for Bullet, Blitz, Rapid, and Long Game, plus a non-clock Fixed Depth mode. Tournament timing is unchanged. The implementation does not alter engine identities, strength policy, runtime binaries, Lc0, Clerk, ECO/opening-set behavior, or final PGN/history export.

## Authoritative model

`js/arena-match-clock.js` owns one `MatchClockController` per active Match game. Its state contains the selected immutable time-control snapshot, white and black remaining milliseconds, active color, monotonic turn start, authoritative deadline, search identity, pending accepted move, and flagged color.

The same state supplies:

- player-bar displays;
- UCI clock values;
- pause/resume reconciliation;
- the flag-fall decision.

The UI has no separate chess timer. One 100 ms render interval per active game projects the controller snapshot. It does not determine results. Fixed-width player-bar outputs use tabular numerals and expose an underlined active-state cue plus an accessible active label; clock ticks are not `aria-live` announcements.

## Presets

- Bullet: `1+0`, `1+1`
- Blitz: `3+0`, `3+2`, `5+0`, `5+3`
- Rapid: `10+0`, `10+5`, `15+10`
- Long: `30+0`, `30+20`, `60+30`
- Fixed Depth: `8`, `12`, `16`, `20`, `24`

Incomplete custom presets fail closed and are not offered. Browser automation may install a short QA-only clock when `navigator.webdriver === true`; those fixtures do not appear in production controls.

## UCI mapping and provider capabilities

Clock modes send the current color-owned state directly:

```text
go wtime <white ms> btime <black ms> winc <white increment ms> binc <black increment ms>
```

No implicit depth or `movetime` is appended to clock searches. Fixed Depth sends only:

```text
go depth <selected depth>
```

Stockfish 2019 MV, Stockfish 2019 MV Lite, Stockfish 18 Lite, and Stockfish 19 Lite declare `supportsClockTimeControl: true` and `supportsFixedDepth: true`. Match startup fails closed if either selected provider lacks the required capability. Engine/color alternation does not change clock ownership: `wtime` always belongs to the current White participant and `btime` to Black.

## Monotonic accounting and increment

The clock starts immediately before the actual player-engine search command. Worker startup, UCI initialization, readiness barriers, game setup, and between-game reset are therefore excluded. `performance.now()` supplies elapsed duration.

When a BESTMOVE callback arrives strictly before its deadline, the controller immediately subtracts elapsed search time and freezes that turn. After the move is proven legal and applied, it adds the increment. Illegal, stale, aborted, errored, or flagged moves receive no increment. A legal move that already ended the game receives no increment. Opening-book moves consume no thinking time and receive the configured increment after legal application. The configured visual move delay begins only after BESTMOVE accounting and never consumes chess time.

## BESTMOVE versus flag race

Every clock search creates one identity containing game ID, game generation, search generation, and active color. The independent deadline callback is guarded by that identity.

- BESTMOVE at a monotonic instant strictly earlier than the deadline is eligible for legal-move acceptance.
- BESTMOVE at or after the deadline loses the race.
- A deadline callback at or after the deadline records flag fall, stops the search, and completes the game.
- A stale deadline or late BESTMOVE cannot mutate the board, clock, or result.

White flag produces `0-1`; Black flag produces `1-0`; both store `termination: "time-forfeit"`. The initial product rule is intentionally straightforward: the flagged side loses without a new insufficient-mating-material timeout subsystem.

## Pause, resume, stop, and background tabs

Pause reconciles monotonic elapsed time immediately, cancels the deadline, and only then stops the engine search. Resume preserves both remaining times and starts a new search generation with a fresh monotonic start. Pre-pause duration is not subtracted twice.

Stop, game completion, errors, and series transitions cancel the deadline and the single render interval. A stopped game cannot flag later. Hidden tabs do not auto-pause. Timer throttling can delay paint or callback delivery, but the next event reconciles from monotonic timestamps, so elapsed chess time remains correct.

## Series integration

The ML-001B immutable series configuration already stores `timeControl`. Every scheduled game constructs a new controller from that same snapshot, so no remaining time carries into the next game. Color swaps use the newly scheduled White/Black assignment. Time-forfeit results flow through normal series scoring and advancement.

The per-game preparation record stores its time-control snapshot. On completion it also retains the final clock snapshot alongside result and termination in preparation for the later PGN/history phase.

## Verification

Unit coverage includes all approved preset parsing, decrement/increment, illegal moves, both flag colors, deterministic race order, late callbacks, pause/resume, stop cleanup, fresh series clocks, color ownership, fixed depth, provider capability rejection contract, background reconciliation, move-delay exclusion, book moves, and stale deadlines.

Chromium coverage exercises the requested A–I matrix: Bullet display and active state, Blitz increment, forced flag and late BESTMOVE, pause/resume, two-game reset/color swap, accelerated six-game cleanup, Fixed Depth 12, background-style reconciliation, and mobile Stop cleanup. The existing Match, Tournament, Game, and mobile Arena suites remain regression gates.

## Deferred work

ECO database integration, Opening Set scheduling, custom time-control entry, final PGN/history serialization, and Tournament adoption of the reusable clock controller remain outside ML-001C.
