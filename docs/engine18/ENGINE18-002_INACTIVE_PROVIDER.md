# ENGINE18-002 — Stockfish 18 Play + Coach inactive provider

Status: COMPLETE — infrastructure only; no production activation or deployment

## Baseline and isolation

- Verified `origin/main`: `197d5e26ec408a6ffdc97078724f2c4f3c07fdac`
- ENGINE18-001 checkpoint: `31fd8fd0fe548495cbad3270d3d27af2e8c0922a`
- Branch: `feature/engine18-002-sf18-gameplay-provider`
- Worktree: `C:\Users\ALEXANDER\Alexander Projects\TVLavin-Chess-Game2-engine18-002`
- The dirty Market Reader worktree and all other worktrees were left untouched.

## Runtime outcome

Runtime behavior changed: **NO**.

The existing `EngineRegistry.createEngine('stockfish')` production path remains intact. No Play,
Coach, Bots, Analyze, board, renderer, HTML, CSS, server, CSP, asset, or search-policy caller was
rewired. No universal engine singleton was introduced.

| Role | Runtime provider after ENGINE18-002 |
| --- | --- |
| Play Game (`game`) | `legacy-stockfish-2019` → Stockfish 2019 Multi-Variant |
| Play Coach active (`coach-active`) | `legacy-stockfish-2019` → Stockfish 2019 Multi-Variant |
| Play Bots (`bots`) | `legacy-stockfish-2019` → Stockfish 2019 Multi-Variant |
| Coach Review (`analyze-review`) | existing `stockfish-18-lite` Analyze provider |
| Coach Manual Analysis (`manual-analysis`) | existing `stockfish-18-lite` Analyze provider |

## Inactive provider contract

- Provider key: `stockfish-18-gameplay`
- Name: `Stockfish 18 Lite WASM (Gameplay, inactive)`
- Version: `18.0.0`
- Eligible roles: `game`, `coach-active`
- Bots eligible: **NO**
- Enabled: `false`
- Selected by default: `false`
- Adapter: existing `EngineAdapter`
- Worker: `/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.js`
- WASM: `/assets/vendor/stockfish/18.0.0/stockfish-18-lite-single.wasm`
- Expected UCI name: `Stockfish 18 Lite WASM`
- Expected UCI author: `the Stockfish developers (see AUTHORS file)`
- Defaults: `MultiPV=1`, `Hash=16`
- Execution policy: single-threaded; no pthreads, SharedArrayBuffer, COEP, or cross-origin-isolation change
- Capabilities: attributed requests, analysis info, PV/bestmove parsing, no Chess960

The provider is metadata-only when the registry loads. Its sole construction seam in this phase is
`createInactiveGameplayProviderForVerification`, which requires the exact `ENGINE18-002` token and
rejects the `bots` role. It uses the existing adapter's approved same-origin Worker allowlist and
exact UCI identity check. An identity mismatch terminates the Worker with
`ENGINE_IDENTITY_MISMATCH`; it creates no legacy fallback Worker.

## Feature gate

`CAISSA_PLAY_SF18_GAMEPLAY` is an immutable internal build gate compiled to strict boolean `false`.
Missing, invalid, explicit `false`, and even caller-supplied `true` values resolve Play Game and
Coach active to legacy while this phase gate is OFF. Bots bypasses the gate and always resolves to
legacy. Normal production code does not call the new role-construction seam.

## Assets and delivery

| Asset | Normalized/raw bytes | SHA-256 | Browser MIME |
| --- | ---: | --- | --- |
| legacy `/engine/stockfish-working.js` (unchanged) | 1,579,948 normalized | `723fda70117bfa8d5053a7bc4ae50cdc96dc9e3fd41b57627e4dfa0a0025957a` | existing |
| SF18 Worker JS | 20,670 normalized | `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe` | `text/javascript` |
| SF18 WASM | 7,295,411 raw | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` | `application/wasm` |

The real browser test observed both versioned assets at the document origin with HTTP 200. The Play
CSP retained `worker-src 'self'` and no remote Worker source. No asset was copied or replaced.

## Worker, FEN, and result evidence

Gate-OFF browser checks visited `/play`, `/play/coach`, and `/play/bots`, started the existing runtime
engine, and observed **0 SF18 gameplay Workers** on every route. The inactive provider also created
zero Workers on registration and construction with `autoStart: false`.

The token-bound real-WASM smoke test performed:

`construct → uci → exact identity → MultiPV 1 / Hash 16 → isready → fixed FEN → go depth 8 → info → bestmove → isready → terminate`

- Fixed FEN: `r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3`
- Browser result: `bestmove d2d4`, legal in the exact requested position
- Deepest observed info: depth 8
- Request/result generation: `browser-fixed-fen:1` on both request and callback
- Engine `currentFen`: exact equality with requested canonical FEN
- Maximum simultaneous Workers during ordered legacy-to-smoke handoff: 1
- SF18 Worker terminations: 1; active Workers after termination: 0

The deterministic unit harness additionally asserts the exact outbound `position fen` and `go depth
8` commands, legal bestmove handling, info parsing, post-search readiness, and clean termination.

## Regression evidence

| Gate | Result |
| --- | --- |
| ENGINE18-002 unit | 7 passed, 0 failed |
| ENGINE18-002 browser/real WASM | 2 passed, 0 failed |
| ENGINE18-001 frozen contracts | 11 passed, 0 failed |
| ENGINE18-001 browser baselines | 4 passed, 0 failed |
| Focused Bots frozen policy/catalog/seed/strength | 24 passed, 0 failed |
| Bots browser | 11 passed, 0 failed |
| Board unit | 23 passed, 0 failed |
| Persistent renderer + Play board browser | 13 passed, 0 failed, 1 intentional project skip |
| Existing Analyze SF18 browser | 2 passed, 0 failed, 1 intentional project skip |
| Full Play unit inventory | 857 total, 840 passed, 17 historical failed |

The ENGINE18-001 full Play baseline was 850 total, 833 passed, 17 failed. ENGINE18-002 adds exactly
7 passing unit tests and **0 new failures**. Stale, illegal, and wrong-FEN commit ceilings remain zero.

The broad Bots run produced 79 passes and two historical Windows checkout failures in
`bot-worker-production-readiness.test.js`. The same two failures reproduce at the ENGINE18-001
checkpoint: those tests hash/count raw CRLF checkout bytes against normalized-LF constants. The
normalized legacy-worker hash passes, the Git asset is unchanged, and the focused Bot freeze and
browser suites are green.

The ENGINE18-001 source guard was advanced only for the intentionally extended
`js/engine-registry.js`; every other frozen engine, search-policy, Bot, Coach, Analyze, board,
renderer, layout, and DOM hash remains unchanged.

## Files changed

- `js/engine-registry.js`
- `tests/fixtures/engine18/engine18-001-contracts.json` (registry source guard only)
- `tests/fixtures/engine18/engine18-002-provider.json`
- `tests/play/engine18-002-inactive-provider.test.js`
- `tests/browser/engine18-002-inactive-provider.spec.js`
- `docs/engine18/ENGINE18-002_INACTIVE_PROVIDER.md`

## Risks and next phase

No `EngineAdapter` incompatibility was discovered. The only observed regression-harness risk is the
pre-existing raw-line-ending sensitivity noted above. Dependency installation reported four audit
findings (three moderate, one high) from the unchanged lockfile; no dependency changes were made.

Recommended next phase: **ENGINE18-003 — Stockfish 18 Play Game Preview Activation**. Activate Play
Game only in an isolated preview, with explicit approval; keep Coach active and Bots on legacy.
