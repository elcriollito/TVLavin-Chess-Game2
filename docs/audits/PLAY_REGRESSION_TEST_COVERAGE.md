# Season 10 Simplified Play Regression Coverage

Manifest version: 1.0.0

Audit date: 2026-07-31

## Ownership decision

The final local regression is layered. Unit tests own pure contracts and static
boundaries. The integration consolidation owns cross-module handoffs.
Responsive consolidation owns its immutable 15-profile matrix. The hard gate
owns release-blocking resource/default assertions. A compact browser smoke owns
critical cross-engine sequencing. Existing detailed Play specs remain the
authoritative exhaustive browser layer. The repository harness owns isolation
from non-Play systems and self-contained repository tests.

`npm run test:play:regression` runs those owners in that order, preserves child
output and exit codes, stops on the first failed required suite, and emits one
immutable JSON-safe summary. It never retries. External and manual gates are
reported but are not counted as local passes.

## Audit findings

| Layer | Existing owner | Overlap/gap before consolidation | Decision |
|---|---|---|---|
| Unit | `test:play:unit` | complete contracts; no final manifest/result contract | retain; add manifest validation |
| Integration | `test:play:integration` | complete handoffs; three cases also occur in full Play | retain explicit cross-browser owner |
| Responsive | `test:play:responsive` | complete and intentionally outside `play-*` prefix | reuse without redefining profiles |
| Browser | `test:play` | exhaustive Chromium; three documented characterization skips | retain unchanged |
| Hard invariants | scattered event/worker/shell tests | no single release-blocking assertion | add one focused Chromium owner |
| Cross-browser smoke | integration and responsive fragments | no compact end-to-end critical path | add one deterministic C/F/W smoke |
| Static | subsystem unit guards and manual shell scans | no final consolidated policy | add bounded static command |
| Repository | `test:regression` | complete self-contained repository test discovery | retain unchanged and run last |
| External | optional Worker/FICS/tablebase commands | intentionally unavailable locally | keep explicit, never fake-pass |
| Manual | chess, devices, screen readers | automation cannot certify | assign to Season 10.12.5/manual QA |

Some duplication is deliberate: the repository regression rediscovers Play
unit tests, while the full Play prefix contains three integration smoke cases.
Removing either would change an existing developer command or repository-wide
discovery contract. Responsive, hard-invariant, and final smoke filenames stay
outside `play-*`, eliminating avoidable browser duplication.

## Regression coverage manifest

Exact machine-readable ownership lives in
`tests/play/play-regression-manifest.js` and is validated by
`tests/play/regression-coverage-manifest.test.js`.

| Subsystem ID | Unit owner | Integration/browser owner | Responsive/static owner | External/manual requirement | Hard invariant | Status |
|---|---|---|---|---|---|---|
| navigation-routing | `play-route-controller.test.js` | `play-routing.spec.js` | `navigation-integrity.test.js` | direct-link review | Classic/Legacy defaults | complete |
| board-rules | `chessboard-adapter.test.js` | `play-chessboard-adapter.spec.js`; `play-game-state.spec.js` | `responsive-play-transitions.spec.js` | three characterization gaps | one board | complete |
| engine-worker | `worker-lifecycle.test.js`; `engine-request-isolation.test.js` | Worker/isolation browser specs | attribution guard | Worker URL external | Worker ≤ 1 | complete |
| clock-lifecycle | clock and lifecycle unit specs | clock/lifecycle browser specs | — | background throttling manual | one owner | complete |
| records-persistence | record and persistence unit specs | record/persistence browser specs | — | quota variance | no stale mutation | complete |
| fair-play | FairPlay and human policy units | FairPlay/human browser specs | — | provider external | deny before dispatch | complete |
| games | `games-panel.test.js` | Games and integration specs | responsive workflows | play feel manual | one CTA/lifecycle | complete |
| bots | `bots-foundation.test.js` | `play-bots.spec.js` | responsive workflows | strength manual | retained identity | complete |
| coach | Coach unit/quality specs | `play-coach.spec.js` | responsive workflows | instruction manual | no move/PV leak | complete |
| players-readiness | infrastructure/panel units | infrastructure/Players specs | responsive workflows | FICS external | blocked; zero starts | complete |
| evaluation-rail | `evaluation-rail.test.js` | evaluation rail spec | responsive consolidation | visual manual | human frozen | complete |
| postgame-analyze | PostGame/handoff units | PostGame/Analyze specs | responsive workflows | clipboard variance | one summary; opaque token | complete |
| mentor-pipeline | request/analysis/moment units | educational/moment specs | — | instruction manual | one analysis context | complete |
| guided-replay-summary | Replay/Knowledge/Summary units | Guided Replay spec | responsive workflows | instruction manual | hidden answer; zero writes | complete |
| lazy-loading | lazy-loader unit | lazy-loading browser spec | responsive workflows | scheduling variance | deferred boot | complete |
| event-lifecycle | event unit | event browser spec | — | none | zero growth/leaks | complete |
| performance | budget unit | performance browser spec | responsive consolidation | field/heap manual | hard budgets | complete |
| themes-visual | theme/identity units | theme/identity browser specs | responsive consolidation | subjective review | no global leakage | complete |
| accessibility | accessibility unit | accessibility browser spec | responsive consolidation | screen reader manual | two live regions | complete |
| responsive | profile contract | responsive consolidation | workflows/transitions | devices manual | 15 profiles | complete |
| classic-fics-analyze-isolation | compatibility unit | compatibility/Analyze specs | navigation guard | FICS external | independent ownership | complete |
| academy-knowledge | Knowledge integration unit | Mentor foundation spec | Knowledge release guard | editorial manual | pinned/protected | complete |
| endgame | Library/Trainer units | Endgame browser spec | library-reader guard | tablebase external | Play isolation | complete |
| static-release-boundaries | static regression guard | hard-invariant browser gate | public-release guard | authorization manual | no leaks/skips/artifacts | complete |

## Hard invariants

The final hard gate fails on any mismatch in:

- primary board count exactly one;
- Play Worker count at most one;
- listener growth exactly zero after mode cycles;
- scoped timers and observers zero after deactivation;
- exactly two live regions while Simplified Play is active;
- proprietary human games started exactly zero;
- Players `productionReady` false and `qaOnly` true;
- Simplified Play absent from unflagged Play;
- Classic root landing and Legacy Play defaults unchanged;
- deferred Bots, Coach, Players, Mentor, and Analyze groups absent at Games boot;
- unique lazy script URLs and lifecycle-owned Worker contexts;
- hidden-answer protection and zero Training Memory/Mastery writes retained by
  authoritative Replay/Knowledge/Summary tests.

## Result and failure contract

`scripts/play-regression-result.mjs` produces a deeply frozen, JSON-safe summary
with schema version, run ID, baseline, suite results, local pass/fail counts,
documented skips, external/manual gates, warnings, blockers, duration, and
status. A failed required suite necessarily makes the summary failed. The
orchestrator prints the first failing child output and exits nonzero without
running later suites or retrying.

## Static guard ownership

The final static command uses the existing bounded generated-output cleaner,
then proves protected architecture files and `package-lock.json` are unchanged;
dependency sets are identical to the task baseline; exactly the three known
browser skips exist; no `.only` exists; fixtures are not registered in
production; generated outputs are absent; and new regression sources contain
no arbitrary network target, inline handler, or production registration.
Subsystem guards continue to own fake Players data, answer leakage, lazy-script
registration, unowned Workers, URLs, and domain-specific ownership scans.

## Skip and external policy

| Gate | Reason/owner | Prerequisite and closure |
|---|---|---|
| square keyboard play | Board accessibility characterization | square model exists and its keyboard contract passes |
| modal focus trap | Legacy modal characterization | reliable focus-trap contract exists and passes |
| repetition/fifty-move injection | Legacy rules characterization | supported public history injection exists and passes |
| external Worker | Worker integration | set `WORKER_URL`; configured test passes |
| live FICS | FICS integration | set `FICS_GATEWAY_URL`; configured test passes |
| live tablebase | Endgame | explicitly opt in to network; live test passes |
| manual chess | Season 10.12.5 | complete the structured manual chess matrix |
| physical devices | Season 10.12.5 | complete real iOS/Android/tablet checks |
| screen readers | Accessibility QA | required certification completes |

No new skip is authorized. External and manual gates are blockers to later
release decisions, not failures of the deterministic local regression.

## Release blocker policy

Local deterministic blockers are any required failure, hard-invariant mismatch,
route/default regression, resource leak, hidden skip, fixture leak, or artifact.
External blockers are the Worker URL, FICS gateway, and live tablebase gates.
Manual blockers are chess QA, physical-device QA, and required screen-reader
certification. This task does not make a release-readiness claim.
