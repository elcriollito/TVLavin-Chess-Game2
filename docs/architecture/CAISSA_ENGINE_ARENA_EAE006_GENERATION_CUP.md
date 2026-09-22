# CAISSA Engine Arena EAE-006 — Generation Cup Certification

Baseline: `bdbaed0e33297195eca4eacae9aad630978e82f4`

This is an engineering lifecycle certification run. It is not a scientific engine-strength
benchmark, and its standings must not be used as a strength ranking.

## Configuration

- Field: Stockfish 2019 MV, Stockfish 2019 MV Lite profile, Stockfish 18 Lite, and
  Stockfish 19 Lite.
- Format: deterministic circle-method single round robin.
- Schedule: three rounds, two games per round, six total games.
- Opening: the existing neutral `Free` setting and canonical starting position.
- Result policy: every Cup game reached legal engine activity and was then manually adjudicated
  as a draw. A separate deterministic insufficient-material position exercised automatic draw
  completion.
- Primary viewport: 1920×1080. Representative transition/stop/restart segments also ran at
  390×844 and 844×390.

A single round robin was selected instead of the suggested double round robin to keep the browser
certification bounded while still exercising every unordered pairing, every provider as both White
and Black, ten participant-role replacements, and same-provider reuse. Unit coverage additionally
certifies that rounds four through six reverse every first-cycle color assignment for a double
round robin.

## Deterministic pairings and results

| Game | White | Black | Result | Termination |
| ---: | --- | --- | --- | --- |
| 1 | Stockfish 2019 MV | Stockfish 19 Lite | ½–½ | Manual adjudication |
| 2 | Stockfish 2019 MV Lite profile | Stockfish 18 Lite | ½–½ | Manual adjudication |
| 3 | Stockfish 18 Lite | Stockfish 2019 MV | ½–½ | Manual adjudication |
| 4 | Stockfish 19 Lite | Stockfish 2019 MV Lite profile | ½–½ | Manual adjudication |
| 5 | Stockfish 2019 MV | Stockfish 2019 MV Lite profile | ½–½ | Manual adjudication |
| 6 | Stockfish 18 Lite | Stockfish 19 Lite | ½–½ | Manual adjudication |

Certification-run standings:

| Rank | Participant | Points | Games |
| ---: | --- | ---: | ---: |
| 1= | Stockfish 2019 MV | 1.5 | 3 |
| 1= | Stockfish 2019 MV Lite profile | 1.5 | 3 |
| 1= | Stockfish 18 Lite | 1.5 | 3 |
| 1= | Stockfish 19 Lite | 1.5 | 3 |

The live crosstable showed one `½` in each directed head-to-head cell, 12 played cells total.
After every game, UI points and games-played values matched Tournament state. Equal scores rendered
the shared tied rank `1=` in seed order.

## Runtime identity matrix

| Visible participant | providerId / requestedEngineId | UCI-reported name | Result |
| --- | --- | --- | --- |
| Stockfish 2019 MV | `stockfish` | `Stockfish 2019-08-15 Multi-Variant` | Matched |
| Stockfish 2019 MV Lite profile | `stockfish-lite` | `Stockfish 2019-08-15 Multi-Variant` | Matched; Lite provider/profile remained distinct |
| Stockfish 18 Lite | `stockfish-18-lite` | `Stockfish 18 Lite WASM` | Matched |
| Stockfish 19 Lite | `stockfish-19-lite` | `Stockfish 19 Lite WASM` | Matched |

Every game compared the visible names, scheduled providers, live manager roles, immutable runtime
identity records, UCI names, and identities frozen into the game record. No cross-generation or
profile mismatch occurred. Each changed role received a new runtime ID; consecutive same-provider
roles retained their validated runtime ID. The evaluator remained `stockfish` with one unchanged
runtime ID and never appeared in standings.

## Scheduler and transition observations

The prior score-sorted generator could repeat pairings and did not guarantee full field coverage.
EAE-006 introduced a pure circle-method scheduler. An odd field receives a rotating bye. A second
cycle reverses colors. The current Cup used the first three rounds.

For all six transitions:

1. Current searches stopped and all three diagnostic role states became `IDLE`.
2. The result and move history were preserved.
3. Standings and head-to-head cells updated before the next game.
4. Same-provider roles were reused; changed roles were terminated before replacement.
5. Each next runtime identity validated before READY.
6. White, Black, and evaluator received `ucinewgame` followed by the `isready` barrier.
7. The canonical next position loaded before legal engine activity resumed.

An explicit mid-Tournament stop terminated all roles. Starting a new Tournament reset games,
standings, ownership, and runtime IDs. Stopping after automatic completion also canceled the
pending next-game timer, preventing an unexpected restart.

## Worker and resource observations

- Runtime-manager acquisitions: 13.
- Same-provider acquisition reuses: 8.
- Participant-role replacements: 10.
- Terminations during pairing replacements: 10.
- Final terminations after Arena exit: 13 total.
- Maximum live Arena workers/records: 3/3.
- Maximum page workers: 4, including the application worker outside Arena.
- Final live Arena workers/records/runtime IDs: 0/0/0.
- Stale runtime records: 0.
- Orphan Arena workers: 0.

Live IDs did not grow monotonically: replaced IDs disappeared before successors were published.
Browser asset caching remained independent from worker ownership.

## Game presentation and stability

Every provider produced legal activity. The Moves panel and evaluation PV used SAN; no UCI
coordinate move leaked into either surface. Evaluation depth, score, PV, and graph updated for
every Cup game.

Desktop and both mobile orientations retained board drift at or below 0.5 px across engine-name,
standings, result, pairing, and PV changes. The Arena section had no horizontal overflow. The
desktop Cup had no serious/critical accessibility violation and no Arena-origin console error or
page exception.

## Failure injection

A test-only Worker wrapper caused the Stockfish 19 startup handshake to fail during the first Cup
pairing. The Tournament remained idle with its game unscored, Stockfish 19 was marked unavailable,
its failure stayed attributed to the Black role/provider, no fallback or relabeling occurred, and
all surviving Arena roles were terminated. Final live workers, records, and runtime IDs were zero.
No bundled engine asset was changed.

## Limitations

- Results were deliberately adjudicated after legal activity to bound CI duration; they measure
  lifecycle behavior, not playing strength.
- The existing `Free` opening configuration was used. EAE-006 did not add an opening suite or alter
  the unused `e4`/`d4` Tournament settings.
- Exact browser heap, NNUE, and native worker memory are not exposed reliably, so certification
  uses factual provider metadata and exact live-worker ownership rather than invented RAM figures.

## Verdict

**EAE-006 CERTIFIED** — deterministic all-pairing scheduling, identity truthfulness, standings,
SAN/PV SAN, evaluator isolation, three-worker budgeting, failure cleanup, stop/restart behavior,
mobile stability, and final zero-resource cleanup passed.
