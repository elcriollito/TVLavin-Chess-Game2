# Simplified Play Unit-Test Coverage Manifest

Manifest version: 1.0.0
Audit date: 2026-07-30

## Ownership

Unit tests own contracts, pure transformations, state transitions, policy decisions, validation, immutability, security boundaries, deterministic failures, and resource counters. Browser tests own rendered DOM, real event order, navigation history, layout, accessibility-tree behavior, and cross-browser interaction. Manual QA owns physical devices, subjective play feel, certified screen-reader behavior, and real external services.

## Inventory

- Unit test files before consolidation: 42
- Static `test(...)` declarations before consolidation: 435
- Executed cases in the authoritative top-level run: 429
- Unit `.skip` declarations: 0
- Exact duplicate titles: 0
- Test-only fixture modules: 5
- Production fixture references: 0
- Tests removed: 0
- Expectations weakened: 0

## Coverage matrix

| Subsystem | Authoritative unit tests | Contract | Covered paths | Uncovered or deliberate exclusions | Owner | Browser/manual dependency | Status |
|---|---|---|---|---|---|---|---|
| Routing | `play-route-controller.test.js`, `simplified-play-shell.test.js` | Route 1.0.0 | canonical paths, QA modes, unknown paths, legacy query, Analyze handoff, history intent, disposal | real Back/Forward event order | unit | browser | complete |
| Mode state | `simplified-play-shell.test.js`, panel suites | Shell 1.0.0 | availability, geometry, one active mode, invalid input, restoration boundary | rendered show/hide and focus | unit | browser | complete |
| FairPlay | `fair-play-policy.test.js`, `human-fair-play.test.js` | 1.0.0 | machine, coach, training, human, assisted, post-game, unknown, forgery, reason codes | provider certification | unit | external | complete |
| Bots | `bots-foundation.test.js`, `bots/calibration-contract.test.js` | 1.0.0 | catalog, identity, presets, validation, calibration, immutability, reset/rematch | subjective strength | unit | manual | complete |
| Coach | `coach-foundation.test.js`, `coach-intervention-quality.test.js`, `endgame-coach-foundation.test.js` | 1.x | profiles, policies, cooldowns, templates, fixtures, false-positive controls | subjective instructional quality | unit | manual | complete |
| Players | `presence-contracts.test.js`, `challenge-contracts.test.js`, `players-panel.test.js`, `human-play-infrastructure.test.js` | 1.0.0 | provider identity, freshness, challenges, hostile data, resource-free adapters, production block | real provider runtime | unit | external | complete |
| GameLifecycle | `game-lifecycle.test.js` | 1.0.0 | state derivation, transitions, session rotation, history, disposal, invalid snapshots | rendered transition timing | unit | browser | complete |
| Results | `game-record.test.js`, `post-game-experience.test.js` | 1.x | checkmate, stalemate, resignation, unknown result, FEN/PGN mismatch, validation | subjective copy review | unit | manual | complete |
| Clocks | `clock-service.test.js` | 1.0.0 | monotonic elapsed time, switch, increment, pause, timeout, RAF cleanup | real background-tab throttling | unit | browser | complete |
| GameRecord | `game-record.test.js`, `game-record-persistence.test.js` | 1.x | normalization, immutability, serialization, consent, retention, recovery, corruption | browser quota variance | unit | browser | complete |
| EvaluationRail | `evaluation-rail.test.js` | 1.0.0 | score mapping, mate, policy denial, orientation, lifecycle, hostile decisions | visual geometry | unit | browser | complete |
| PostGame | `post-game-experience.test.js` | 1.x | hydration, Rematch, Analyze, PGN, persistence, Mentor, disposal | clipboard/download browser APIs | unit | browser | complete |
| Mentor | `mentor-foundation.test.js`, `mentor-review-request.test.js`, `educational-analysis-pipeline.test.js`, `critical-moment-selector.test.js`, `guided-replay.test.js`, `knowledge-integration.test.js`, `mentor-summary.test.js` | 1.x | request correlation, analysis, selection, replay, mapping, summary, cancellation, security | visual review interaction | unit | browser | complete |
| Worker | `worker-lifecycle.test.js`, `engine-request-isolation.test.js`, `engine-adapter-attribution.test.js` | 1.0.0 | init, readiness, request isolation, restart, stale responses, owner disposal, attribution | external Worker URL | unit | external | complete |
| Lazy loading | `play-lazy-loader.test.js` | 1.0.0 | registry, dependency order, duplicate promise, QA denial, retry, disposal, static boundary | network scheduling | unit | browser | complete |
| Event lifecycle | `event-lifecycle.test.js` | 1.0.0 | scopes, duplicates, listeners, timers, observers, stale guards, disposal | native browser listener implementation | unit | browser | complete |
| Performance | `play-performance-budget.test.js` | 1.0.0 | vocabulary, thresholds, evaluator, hard invariants, probe, privacy boundary | field data and physical-device heap | unit | manual | complete |
| Visual and themes | `play-visual-components.test.js`, `play-visual-identity.test.js`, `play-themes.test.js` | 1.x | factories, tokens, identity, theme registry, hostile input, static boundaries | rendered contrast/layout | unit | browser | complete |
| Accessibility | `play-accessibility.test.js`, `play-harness-contract.test.js` | 1.0.0 | focus, announcements, bounded regions, hostile selectors, ownership, fixture validity | screen-reader certification | unit | browser/manual | complete |

## Duplicate and fixture analysis

No exact duplicate test titles exist. Near duplicates around immutability, hostile input, resource ownership, and SPA registration are retained because each protects a different contract or production boundary. No test was removed.

The five fixture modules remain subsystem-owned and immutable or factory-created. They are not registered by production HTML or imported by production JavaScript. GameRecord, profile, Worker, Mentor, and accessibility fixtures were not centralized because their semantics and ownership differ.

## Skip policy

The Play unit suite contains no `.skip`. Repository-level external gates remain explicit: external Worker URL (integration owner; closes when `WORKER_URL` is supplied), local FICS gateway (FICS owner; closes when the gateway is running), and live tablebase opt-in (Endgame owner; closes with explicit network permission). Browser-only characterization skips remain owned by their existing browser files and are not converted into unit skips.

## Audit conclusion

All listed Season 10 Play subsystems have authoritative unit owners and strict contract, failure, boundary, or resource coverage. Integration sequencing, responsive closure, consolidated regression, manual chess QA, physical devices, and external services remain assigned to later roadmap stages.
