# ENGINE18-001 — Play + Coach Migration Baseline & Contract Freeze

Status: complete
Captured: 2026-09-14
Production deployment: not changed
Stockfish 18 gameplay activation: not performed

## 1. Verified repository baseline

`git fetch origin` completed successfully before the worktree was created.

| Item | Verified value |
| --- | --- |
| Real `origin/main` | `197d5e26ec408a6ffdc97078724f2c4f3c07fdac` |
| Isolated branch | `feature/engine18-001-play-coach-baseline` |
| Isolated worktree | `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-engine18-001` |
| Worktree base/HEAD | `197d5e26ec408a6ffdc97078724f2c4f3c07fdac` |
| Initial isolated status | clean |

The existing Market Reader worktree remained at
`C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2`, branch
`feature/caissa-market-reader-staging`, HEAD
`8f27ebf7ed6b4c7200e782054b7073c52e16cdd3`. Its pre-existing tracked and
untracked changes were not modified.

## 2. Scope and non-change proof

Only tests, fixtures, and this audit document were added. No production
JavaScript, HTML, CSS, engine asset, board renderer, dependency, environment,
route, or deployment configuration was changed.

| Acceptance boundary | Result |
| --- | --- |
| Play Game engine changed | NO |
| Play Coach active engine changed | NO |
| Play Bots engine changed | NO |
| Play Bots personality/search policy changed | NO |
| Play/Bots/Coach layout changed | NO |
| `CaissaBoardAdapter` changed | NO |
| `CaissaPersistentRenderer` changed | NO |
| Production deployed | NO |

The executable manifest stores normalized-LF SHA-256 guards for the active
engine asset, registry, adapter, gameplay controller, Bots policy/session/catalog,
Coach policy/review/manual-analysis files, board adapter/renderer, evaluation rail,
and current `index.html`. These guards make an accidental production change fail
the Engine18 contract suite.

## 3. Engine identity matrix

| Role | Current provider | Current identity | Worker | Future disposition |
| --- | --- | --- | --- | --- |
| Play Game | `stockfish` | Stockfish 2019-08-15 Multi-Variant | `/engine/stockfish-working.js` | migrate to Stockfish 18 later |
| Play Coach active game | `stockfish` | Stockfish 2019-08-15 Multi-Variant | `/engine/stockfish-working.js` | migrate to Stockfish 18 later |
| Play Bots | `stockfish` | Stockfish 2019-08-15 Multi-Variant | `/engine/stockfish-working.js` | FROZEN; no migration target |
| Coach Review / Manual Analysis | `stockfish-18-lite` | Stockfish 18 Lite WASM | `/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js` | already implemented; do not migrate |

The real Worker handshake observed the exact legacy UCI name and author for
Play and Coach, and the exact configured SF18 Lite name and author for Review.

## 4. Play Game baseline

The required target policy and a real legal-move corpus are frozen. The real
Worker corpus used the canonical mate-in-one FEN
`7k/5Q2/6K1/8/8/8/8/8 w - - 0 1`, so even depth 20 remains deterministic and
bounded on mobile-class hardware.

| Target | Search | MultiPV | Book eligible | Captured legacy bestmove | Legal |
| ---: | --- | ---: | --- | --- | --- |
| 250 | depth 1 | 1 | no | `f7g7` | yes |
| 500 | depth 2 | 1 | no | `f7g7` | yes |
| 800 | depth 3 | 1 | no | `f7g7` | yes |
| 1200 | depth 5 | 1 | no | `f7g7` | yes |
| 1600 | depth 8 | 1 | no | `f7g7` | yes |
| 2000 | depth 12 | 1 | no | `f7g7` | yes |
| 2400 | depth 16 | 1 | no | `f7g7` | yes |
| 2800 | depth 20 | 1 | no | `f7g7` | yes |
| 3200 | movetime 2000 ms | 1 | yes | `f7g7` | yes |

The captured move is a legacy-baseline observation, not a migration parity
requirement. Stockfish 18 may choose a different legal move. The future parity
requirement is canonical request FEN, policy, attribution, legality, and commit
acceptance—not exact move equality between engine versions.

## 5. FEN integrity and race baseline

The request fixture proves `position fen` receives the canonical `App.game.fen()`
unchanged. Before commit, the frozen layers require request/result attribution,
generation, purpose, current position token/canonical FEN, and a legal
`chess.js` move.

| Case | Expected terminal response | Result |
| --- | --- | --- |
| normal move | accepted | pass |
| superseded engine search | stale request | pass |
| Undo | canceled | pass |
| Reset | stale session | pass |
| rematch | stale session | pass |
| route change | canceled | pass |
| mode change | canceled | pass |
| game over | canceled | pass |

Acceptance counters from the deterministic suite are:

```text
stale canonical commits = 0
illegal engine commits = 0
wrong-FEN commits = 0
```

## 6. EngineAdapter and ownership baseline

The suite freezes UCI initialization, exact configured provider identity,
`position fen`, depth/movetime `go`, `stop`, `isready`/`readyok`, generation
barriers, attributed bestmove and MultiPV parsing, White-POV score conversion,
PV delivery, and termination.

Normal Play/Coach gameplay creates one `App.engine` / `EngineAdapter` Worker.
The measured Play-to-Coach route transition disposed the previous Worker. The
explicit Coach-to-Review probe then observed this order:

```text
legacy gameplay active = 1
terminate gameplay      = 0
start SF18 Review       = 1
terminate Review        = 0
maximum observed        = 1
```

No universal singleton architecture was introduced.

## 7. Coach active-game baseline

| Coach level | Opponent target | Current depth |
| --- | ---: | ---: |
| Casual | 500 | 2 |
| Beginner | 800 | 3 |
| Intermediate | 1200 | 5 |
| Advanced | 1600 | 8 |
| Expert | 2000 | 12 |
| Master | 2400 | 16 |
| Grandmaster | 2800 | 20 |

Player-turn evaluation requests depth 20 and settles at depth 12. Hint evidence
must match the current canonical FEN. Before-move evidence requires depth at
least 10 and the intended transition. After-move evidence is attributed to the
exact resulting FEN, completes at depth 11, and has the current 1800 ms bound.

Classification thresholds remain unchanged (pawns):

| Phase | Precise | Good | Inaccuracy | Mistake | Otherwise |
| --- | ---: | ---: | ---: | ---: | --- |
| plies 1–12 | `<0.20` | `<0.65` | `<1.15` | `<2.25` | blunder |
| later | `<0.10` | `<0.45` | `<1.00` | `<2.00` | blunder |

Played, Best, evaluation, PV, and commentary remain tied to one intended
position; stale evidence cannot update another Coach HEAD or CONTENT position.

## 8. Coach Review, Guided Review, and Manual Analysis

Review remains on `stockfish-18-lite`, primary depth 12, retry depth 8, and a
10,000 ms per-position timeout. Positions are evaluated sequentially. Any
incomplete position coverage clears review arrays and prevents a partial
accuracy claim.

Guided Review continues to consume completed Review evidence for Played, Best,
Evaluation, Commentary, and Next Moment. Navigation does not authorize a new
engine search.

Manual Analysis remains an independent sandbox:

| Effort | Depth |
| --- | ---: |
| Quick | 10 |
| Balanced | 14 |
| Deep | 18 |

Acceptance requires request FEN = engine FEN = sandbox FEN = rendered FEN.
Engine Off invalidates/cancels and clears Best/evaluation/PV. Back to Review
cancels the sandbox search, releases the analysis owner, discards sandbox state,
and invokes the canonical restore callback.

## 9. Play Bots frozen-provider proof

The provider asset and identity are SHA-pinned. The executable smoke corpus also
freezes:

- `PlayV2BotPersonalityPolicy@1.1.0`;
- Beginner/Casual/Tactical/Solid MultiPV counts and depths;
- loss windows `260/100/70/55` cp;
- deliberate-error rates `60/10/0/0` percent;
- the 63-profile `classic-target-model-1` ladder from 100 through 3200;
- representative model depths `1/2/6/9/13/18/20`;
- fixed-seed repeatability and illegal-candidate rejection;
- BotSession source and seed behavior;
- bot catalog/category/rating-label source.

```text
Play Bots provider changed: NO
Bot search policy changed: NO
Bot personality code changed: NO
Bot UI changed: NO
```

No SF18 Bot calibration was performed or implied.

## 10. Evaluation baseline

EngineAdapter converts raw side-to-move Stockfish scores to White POV: Black to
move inverts both centipawn and mate signs. One pawn is 100 cp. EvaluationRail
clamps presentation at ±1500 cp, maps it through
`1 / (1 + exp(-clampedCp / 200))`, and presents mate using ±1400 cp. Initial
Play analysis preserves the synthetic `+0.20` display while retaining the raw
engine evidence in `App.currentEvaluation`.

## 11. Mobile performance baseline

Measurements are one local baseline sample, not a deterministic benchmark.
Executable gates use deliberately wider bounds (10 seconds for startup/search,
5 seconds for route transition, and 15 seconds for Review handoff) to detect
hangs without treating normal machine variance as a regression.

| Profile / role | uciok | readyok | startup | depth-4 results |
| --- | ---: | ---: | ---: | --- |
| desktop Chromium / Play | 177.2 ms | 178.1 ms | 178.5 ms | 39.1 / 19.8 / 9.4 ms |
| desktop Chromium / Coach | 174.7 ms | 175.1 ms | 175.5 ms | 35.0 / 20.1 / 10.4 ms |
| mobile-emulated Chromium / Play | 183.2 ms | 183.7 ms | 184.1 ms | 36.1 / 21.3 / 10.6 ms |
| mobile-emulated Chromium / Coach | 179.1 ms | 179.6 ms | 179.9 ms | 35.5 / 20.1 / 9.1 ms |

| Profile | Play-to-Coach route | Coach-to-Review handoff | Maximum Workers |
| --- | ---: | ---: | ---: |
| desktop Chromium | 161 ms | 164.3 ms | 1 |
| mobile-emulated Chromium | 152 ms | 167.3 ms | 1 |

The complete nine-target real Worker sample ranged from 4.9 ms to 656.4 ms on
the deterministic mate fixture. No optimization was attempted.

## 12. Current DOM/layout protection

The new baseline is captured from the real current `origin/main`, not from
historical checkpoint `b3a733a…`. It pins desktop 1440×1000 and mobile-emulated
390×844 Chromium geometry (within 1.5 px), mode/layout attributes, one board,
exact Play tab labels, and direct HEAD/BODY/FOOT order for Play, Bots, and Coach.
It also pins the mobile Coach FOOT as fixed and desktop Coach FOOT as static.
Every run attaches full-page screenshots.

The production HTML and both persistent board implementation files are
SHA-pinned. In addition, the existing board suite proved 64 persistent squares,
zero mutations for identical FEN, identity-preserving quiet/capture/castle/en
passant updates, bounded promotion replacement, orientation stability, 50/100
update soak stability, and no portrait/landscape geometry drift.

## 13. Verification results

### Authoritative Engine18 additions

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Engine18 unit contracts | 11 | 0 | 0 |
| Engine18 Chromium browser contracts | 4 | 0 | 0 |
| Added total | 15 | 0 | 0 |

### Full and adjacent regression runs

| Suite | Passed | Failed | Skipped | Total |
| --- | ---: | ---: | ---: | ---: |
| Full Play unit suite after additions | 833 | 17 | 0 | 850 |
| Engine18 Chromium browser suite | 4 | 0 | 0 | 4 |
| Selected existing engine/Coach/Bots/Review browser tests | 26 | 3 | 1 | 30 |
| Persistent board unit suite | 23 | 0 | 0 | 23 |
| Persistent board Chromium suite | 8 | 0 | 1 | 9 |
| Unique verification total | 894 | 20 | 2 | 916 |

The untouched pre-change Play unit baseline was 822 passed, 17 failed, 0
skipped, 839 total. After adding 11 passing tests it became 833/17/0/850.
Therefore new unit failures = 0.

The three selected-browser failures are existing current-main expectations in
`play-engine-request-isolation.spec.js`: New Game expects a different printable
session ID after the boundary is recreated, and two evaluation cases expect
`+1.3` at the initial position while current runtime intentionally presents the
synthetic `+0.2`. No production source was changed by ENGINE18-001; the new
browser contract tests all pass. The two skips are WebKit-specific cases run
under the Chromium-only projects.

Known current-main failures (20 total, 17 unit + 3 browser):

1. bundled asset provenance, digest, embedded GPL attribution, and notice are pinned
2. production-equivalent output contains exact Worker and notice assets
3. corrective SQL is forward-only and preserves the applied migration byte-for-byte
4. forward-only volatility correction changes only the exact helper disposition to STABLE
5. dedicated public entry excludes invite runtime and prohibited resource graph
6. isolated resource group cannot load the contaminated Mentor graph
7. vendored dependency bytes match the pinned manifest
8. Play board visual assistance uses one adapter-owned presentation pipeline
9. last move comes from authoritative history and review keeps AnalyzeSection ownership
10. Simplified Play visual boundary contains no foreign product branding or external visual assets
11. every exact manifest test reference exists
12. closure artifacts are release-only, passive, private, and absent from runtime registration
13. verification artifacts are release-only and not registered in production pages
14. artifact inventory SHA-256 checksums reproduce from exact UTF-8 files
15. packaging has no runtime, dependency, environment, secret, tag, push, or deployment side effect
16. release artifacts are audit-only and cannot mutate runtime, environment, routes, transport, or deployment
17. coverage manifest declares every required subsystem with an exact status
18. New Game rotates session and rejects delayed prior bestmove
19. accepted live evaluation preserves score, mate, flip, worker retention, and storage
20. raw old info cannot borrow a superseding evaluation callback identity

New failures = 0. No new failure exists in canonical FEN, stale-result
protection, worker ownership, Play Game, Coach, Review, Manual Analysis, frozen
Bots behavior, or the persistent renderer.

## 14. Risks and next phase

- The legacy registry does not configure an `expectedUci` allowlist; this baseline
  compensates by asserting the observed UCI identity. ENGINE18-002 should keep an
  exact expected identity on the new inactive provider.
- Source hashes are intentionally sensitive. Approved future runtime changes must
  explicitly recapture the relevant contract rather than bypass the guard.
- Performance samples are host-specific and should be compared directionally;
  the executable bounds detect hangs and gross regressions.
- The strength bestmove corpus uses a simple mate fixture to keep depth 20 stable.
  It protects request policy/FEN/legality, not playing-strength calibration.
- Existing current-main failures remain outside this test-only phase and were not
  repaired because runtime and release behavior changes were prohibited.

Recommended next phase: ENGINE18-002 — Stockfish 18 Play + Coach Inactive
Provider. It should introduce a versioned, role-aware, disabled-by-default SF18
provider for Play Game and active Coach only. It must not replace the legacy
asset in place and must leave Bots explicitly on `stockfish`.
