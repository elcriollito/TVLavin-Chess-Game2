# ENGINE18-003 — STOCKFISH 18 PLAY GAME PREVIEW ACTIVATION

Audit date: 2026-09-14 (America/New_York)

Automated disposition: **PASS in isolated Preview; physical iPhone certification remains pending.**

## 1. Real `origin/main`

After a fresh final `git fetch origin`, `origin/main` is
`197d5e26ec408a6ffdc97078724f2c4f3c07fdac`.

## 2. ENGINE18-002 base commit

The branch was created from the certified checkpoint
`4ecc1c7fb78e9fc77abbdc8ce1ca6f93cab2bf29`. The ENGINE18-001 checkpoint remains
`31fd8fd0fe548495cbad3270d3d27af2e8c0922a`.

## 3. Branch and worktree

- Branch: `feature/engine18-003-play-game-sf18-preview`
- Worktree: `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-engine18-003`
- Base: `4ecc1c7fb78e9fc77abbdc8ce1ca6f93cab2bf29`
- Deployed implementation commit: `dc6ad73d7212b7b25fe10dfe3170108dd84c44c2`
- The existing Market Reader worktree and all release worktrees were left untouched.

## 4. Files changed

- `api/_lib/play-gameplay-preview-config.js`
- `middleware.js`
- `server.js`
- `js/engine-registry.js`
- `app.js`
- `js/play/play-v2-public-beta-ui.js`
- `tests/fixtures/engine18/engine18-001-contracts.json`
- `tests/fixtures/engine18/engine18-002-provider.json`
- `tests/fixtures/engine18/engine18-003-preview.json`
- `tests/play/engine18-002-inactive-provider.test.js`
- `tests/play/engine18-003-preview-activation.test.js`
- `tests/browser/engine18-003-preview-activation.spec.js`
- `docs/engine18/ENGINE18-003_PREVIEW_ACTIVATION.md`

No Bot session, personality, strength, catalog, board adapter, persistent renderer, layout,
clock, navigation, or Analyze implementation file changed.

## 5. Preview activation mechanism

The server resolves the activation only when both values match exactly:

```text
VERCEL_ENV=preview
CAISSA_PLAY_SF18_GAMEPLAY=true
```

An enabled Preview response receives a server-owned marker containing the provider,
`ENGINE18-003` activation ID, and `preview` environment. The Play client validates all three
values before passing an explicit role-aware gate to `EngineRegistry`. Missing values, boolean
instead of string input, case changes, whitespace, an incorrect activation ID, and Production all
fail closed to legacy. The deployment-specific variables do not alter Production or `main`.
A final live `HEAD https://www.caissa-chess.org/play` returned HTTP 200 with no
`X-Caissa-Gameplay-Provider` activation header, confirming Production was not changed.

## 6. Runtime role/provider matrix

| Role | Preview provider | Production/default |
| --- | --- | --- |
| Play Game | `stockfish-18-gameplay` | `legacy-stockfish-2019` |
| Play Coach active | `legacy-stockfish-2019` | `legacy-stockfish-2019` |
| Play Bots | `legacy-stockfish-2019` | `legacy-stockfish-2019` |
| Coach Review | `stockfish-18-lite` Analyze | `stockfish-18-lite` Analyze |
| Manual Analysis | `stockfish-18-lite` Analyze | `stockfish-18-lite` Analyze |

Game → Bots and Game → Coach route changes cancel the current isolation session, terminate the
current adapter, and construct the provider for the new explicit role.

## 7. Actual UCI identities

The protected deployed Preview was opened with the existing Vercel automation bypass and real
workers, not mocks:

| Surface | UCI name | Result |
| --- | --- | --- |
| Play Game | `Stockfish 18 Lite WASM` | PASS |
| Play Bots | `Stockfish 2019-08-15 Multi-Variant` | PASS |
| Play Coach active | `Stockfish 2019-08-15 Multi-Variant` | PASS |
| Coach Review role | `Stockfish 18 Lite WASM` | PASS |
| Manual Analysis role | `Stockfish 18 Lite WASM` | PASS |

The SF18 initialization trace was `new Worker → uci → exact identity → MultiPV 1 → Hash 16 →
Threads 1 → isready → readyok`. No pthread, SharedArrayBuffer, COOP, or COEP change was introduced.

## 8. Search policy results by Play target

Deployed Preview position:
`r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3`.

| Target | Policy | Bestmove | Elapsed | Generation | Correctness |
| ---: | --- | --- | ---: | --- | --- |
| 250 | depth 1 | `d2d4` | 7.3 ms | 1 = result 1 | exact FEN, legal |
| 500 | depth 2 | `b1c3` | 6.7 ms | 2 = result 2 | exact FEN, legal |
| 800 | depth 3 | `b1c3` | 5.9 ms | 3 = result 3 | exact FEN, legal |
| 1200 | depth 5 | `b1c3` | 9.2 ms | 4 = result 4 | exact FEN, legal |
| 1600 | depth 8 | `d2d4` | 11.0 ms | 5 = result 5 | exact FEN, legal |
| 2000 | depth 12 | `d2d4` | 60.6 ms | 6 = result 6 | exact FEN, legal |
| 2400 | depth 16 | `d2d4` | 78.5 ms | 7 = result 7 | exact FEN, legal |
| 2800 | depth 20 | `f1b5` | 1,047.8 ms | 8 = result 8 | exact FEN, legal |
| 3200 | movetime 2000 | `f1b5` | 2,004.8 ms | 9 = result 9 | exact FEN, legal |

All nine used `stockfish-18-gameplay`; final canonical FEN remained the requested FEN in this
non-committing policy probe. The separate real-game test committed three legal SF18 replies.

## 9. Legacy versus SF18 comparison

All searches below used depth 8 and returned legal moves. Scores are raw White-relative engine
output. Move differences are observational, not regressions.

| Position | Legacy move / score / time | SF18 move / score / time |
| --- | --- | --- |
| Initial | `e2e4`, +0.60, 246.6 ms | `e2e4`, +0.21, 9.2 ms |
| Open game | `b1c3`, +1.39, 111.0 ms | `d2d4`, +0.44, 3.7 ms |
| Mate in one | `f7g7`, mate 1, 23.3 ms | `f7g7`, mate 1, 1.1 ms |

Both engines preserved depth, legal-result, mate-sign, generation, one-worker, and teardown
contracts. SF18's materially different node efficiency confirms that equal depth must not be
treated as equal playing strength.

## 10. Opening-book verification

- Eligible full-power position: book selected `g8f6`; SF18 `go` count stayed 0.
- Exhausted/non-book position at fullmove 13: exact FEN was sent to SF18 with
  `go movetime 2000`; SF18 returned legal `g8f6` and committed it.
- The existing 12-fullmove eligibility boundary was not extended or bypassed.

## 11. FEN integrity results

Every policy probe matched canonical `App.game.fen()` byte-for-byte. The real three-reply game sent
the exact post-player-move canonical FEN before each search. Results:

```text
stale canonical commits = 0
illegal commits = 0
wrong-FEN commits = 0
```

## 12. Stale/race results

ENGINE18-001's deterministic normal, superseded, Undo, Reset, rematch, route, mode, and game-over
matrix passed. The same attributed EngineAdapter and isolation boundary are used by the Preview
provider. Route exit and pagehide additionally terminate the active adapter. Late result ceilings
remain zero.

## 13. Worker-count results

- Active Preview Game: 1 SF18 gameplay worker, 0 legacy workers.
- Maximum simultaneous gameplay workers: 1.
- Three-reply real game: one SF18 worker reused for all searches.
- After search completion plus explicit game exit/pagehide: 0 active workers.
- `Threads=1`; searches are bounded depth or bounded 2,000 ms movetime.

## 14. Route/mode handoff results

The deployed route sequence Game → Bots → Coach passed with exact real identities. Each transition
terminated its predecessor before the successor started; audit maximum remained one. Pagehide
terminated the final worker and left zero active workers. No legacy+SF18 overlap occurred.

## 15. Bots freeze verification

Bots remained on `/engine/stockfish-working.js` with the 2019 UCI identity. Bots selected the SF18
gameplay provider zero times and created zero SF18 workers. The unchanged Bot policy/catalog/seed
unit coverage is included in the 863-test Play inventory; the 11-test Bots browser suite passed in
the Preview-enabled environment.

## 16. Coach freeze verification

Coach game start, playable opponent path, hints/evaluation behavior, long-game flow, review,
postgame, responsive layout, and accessibility passed in the 11-test Coach browser suite. Active
Coach used the real 2019 legacy identity. Review and Manual retained the real SF18 Analyze identity;
the standalone Analyze SF18 tests passed 2 with one intentional project skip.

## 17. Persistent-renderer results

Board unit: 23/23 passed. Chromium/WebKit renderer browser: 17 passed, 1 intentional project skip.
The soak includes 20 moves, a 50-update burst, and a 100-update run. The direct deployed Play proof
made three SF18 replies (`e7e5`, `d7d5`, `g8f6`) and retained the same board root, the same 64 square
nodes, and exact 0 px width/height/top/left drift. Board jitter regressions: 0.

## 18. Desktop performance

Deployed Chromium startup from worker construction to protocol milestone:

| Provider | `uciok` | `readyok` |
| --- | ---: | ---: |
| Legacy 2019 | 239.1 ms | 239.6 ms |
| SF18 (cold protected Preview fetch) | 536.8 ms | 538.5 ms |

After startup, SF18 depth-8 representative searches completed in 1.1–9.2 ms; legacy completed in
23.3–246.6 ms. No page error, event-loop timeout, duplicate worker, or visible board stall was
observed. Preview cold-fetch startup stayed well below the 10-second gate.

## 19. Mobile-emulated performance

Chromium at 390×844 with touch and an iPhone user agent:

| Provider | `uciok` | `readyok` | Initial / open / mate depth-8 |
| --- | ---: | ---: | --- |
| Legacy 2019 | 250.4 ms | 251.0 ms | 247.5 / 111.6 / 25.2 ms |
| SF18 | 552.0 ms | 553.9 ms | 8.2 / 3.3 / 1.3 ms |

Repeated bounded moves, route exit, and teardown passed with maximum one worker and zero retained
workers. This is browser emulation, not a substitute for physical iPhone thermal testing.

## 20. Preview deployment

- URL: `https://tv-lavin-chess-game2-ozdz697vt-elcriollitos-projects.vercel.app`
- Deployment: `dpl_ypxx8vmJaDA9o55FSiaSj6druTfT`
- Target: Preview
- State: READY
- Source commit: `dc6ad73d7212b7b25fe10dfe3170108dd84c44c2`
- Protection: existing Vercel SSO; authenticated CLI/automation bypass used for audit.

No `--prod`, promotion, production alias, or Production environment mutation was performed.

## 21. Preview runtime verification

Authenticated `HEAD /play` returned HTTP 200 and
`X-Caissa-Gameplay-Provider: stockfish-18-gameplay`. The deployed document contained the exact
ENGINE18-003 Preview marker. Seven deployed-browser tests then loaded actual WASM and proved the
five-role identity matrix, all target searches, opening book, three real engine replies, board
persistence, performance, route handoffs, and teardown.

## 22. Complete test counts

Unique relevant gate accounting:

| Suite | Passed | Failed | Skipped | Total |
| --- | ---: | ---: | ---: | ---: |
| Full Play unit inventory (includes ENGINE18-001/002/003 units) | 846 | 17 historical | 0 | 863 |
| ENGINE18-001/002 browser baselines, gate OFF | 6 | 0 | 0 | 6 |
| ENGINE18-003 deployed Preview browser | 7 | 0 | 0 | 7 |
| Bots + Coach + Analyze browser in Preview-enabled local runtime | 24 | 0 | 1 | 25 |
| Board unit | 23 | 0 | 0 | 23 |
| Persistent-renderer Chromium/WebKit browser | 17 | 0 | 1 | 18 |
| **Total** | **923** | **17 historical** | **2 intentional** | **942** |

Additionally, all eight changed JavaScript files/tests passed `node --check`; `git diff --check`
reported no errors.

## 23. Known historical failures

The full Play inventory's same 17 failures were already frozen in ENGINE18-001 and reproduced in
ENGINE18-002: two Bot asset raw-CRLF/provenance checks; two migration-volatility SQL checks; public
entry/resource isolation; vendored dependency bytes; two board/review ownership expectations;
visual identity external-asset expectation; missing regression-manifest reference; three Season 10
runtime-registration exclusions; one Season 10 checksum; two Season 10 side-effect exclusions; and
the CRLF-sensitive unit coverage manifest. None is in the ENGINE18-003 FEN, worker, role, race,
renderer, or WASM path.

## 24. New failures

```text
new Engine18 failures = 0
```

The full Play count advanced from ENGINE18-002's 857 total / 840 pass / 17 historical failures to
863 / 846 / 17 by adding six passing ENGINE18-003 unit tests.

## 25. Strength-drift observations

At equal depth 8, SF18 selected a different open-game move, reported materially different
centipawn values, and finished the sampled searches far faster after startup. That is expected
engine-version drift, but it means the current low/mid target labels cannot be certified as
strength-equivalent from this technical sample. No target was silently retuned.

The mapping is not technically broken—every search is bounded, legal, correctly attributed, and
policy-preserving—but a controlled playing-strength calibration is recommended before Production.

## 26. Remaining risks

- Physical iPhone Safari behavior and sustained thermal/CPU impact remain unmeasured.
- Current depth labels may feel stronger under SF18 despite identical depth policy.
- Preview cold-start latency includes protected network/WASM fetch and was higher for SF18, though
  still bounded and sub-second in this run.
- The Preview requires authorized Vercel access or a project-approved share mechanism.
- The 17 historical full-suite failures remain repository debt, with zero new failures added here.

## 27. Physical iPhone certification status

**PENDING.** Alexander must open the exact protected Preview on a physical iPhone and verify:

1. Play Game loads and the board geometry is correct.
2. There is no collective board jitter.
3. The first SF18 move and several later engine moves complete.
4. Undo works when applicable.
5. Resign/game end completes without a stuck engine.
6. Switching to Bots works and shows no double-worker symptoms.
7. Switching to Coach works and shows no double-worker symptoms.
8. There is no freeze, stuck search, excessive heat, or obvious thermal runaway.

## 28. Recommendation

Keep ENGINE18-003 enabled only on this Preview. Do not activate Play Coach or Production. Complete
the physical iPhone gate, then run **ENGINE18-003A — Play Game Stockfish 18 Strength Calibration**
before considering Production, because the technical migration passes but equal-depth strength
parity is not established.

## Final stop gate

```text
ENGINE18-003 AUTOMATED PREVIEW PASS

Play Game SF18:
ACTIVE IN PREVIEW

Play Coach active SF18:
NO

Play Bots SF18:
NO — LEGACY FROZEN

Verified origin/main:
197d5e26ec408a6ffdc97078724f2c4f3c07fdac

Preview:
https://tv-lavin-chess-game2-ozdz697vt-elcriollitos-projects.vercel.app / dpl_ypxx8vmJaDA9o55FSiaSj6druTfT

Automated regressions:
PASS

Physical iPhone certification:
PENDING

READY FOR PHYSICAL IPHONE CERTIFICATION

STOP — do not activate Stockfish 18 in Play Coach or production.
```
