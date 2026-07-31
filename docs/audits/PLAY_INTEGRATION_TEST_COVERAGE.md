# Simplified Play Integration Coverage Manifest

Manifest version: 1.0.0
Audit date: 2026-07-30

Integration tests own route-to-panel, panel-to-lifecycle, lifecycle-to-board/clock/engine, terminal-to-PostGame, PostGame-to-Analyze/Mentor, lazy action resumption, restoration, resource isolation, and accessible interaction sequencing. Unit contracts, subjective UX, physical devices, and live external availability retain their separate owners.

| Scenario ID | Entry | Modules and handoffs | Fixture | Expected lifecycle/resources | Failure path | Exact browser evidence | Browser coverage | External/manual dependency | Status |
|---|---|---|---|---|---|---|---|---|---|
| games-start | Games QA | route → shell → GamesPanel → lifecycle/clock/board | local engine | ready → active; 1 board/Worker | unavailable command | `play-games-panel.spec.js`, `play-integration-consolidation.spec.js` | Chromium/Firefox/WebKit core; Chromium exhaustive | none | complete |
| bot-terminal-rematch | Bots QA | lazy loader → BotsPanel → Worker → PostGame → Rematch | deterministic Bot | active → completed → active; configuration retained | stale reply | `play-bots.spec.js`, `play-post-game-experience.spec.js` | Chromium exhaustive | subjective strength manual | complete |
| coach-review | Coach QA | lazy loader → CoachPanel → intervention → PostGame | deterministic Coach | active → completed → review-ready; bounded intervention | suppressed/invalid evidence | `play-coach.spec.js`, `play-endgame-coach.spec.js` | Chromium exhaustive | subjective instruction manual | complete |
| human-frozen-evaluation | Players QA | PlayersPanel → Human FairPlay → EvaluationRail | readiness only | production-blocked; evaluation denied; no human game | unknown authority | `play-human-fair-play.spec.js`, `play-integration-consolidation.spec.js` | Chromium/Firefox/WebKit core | live provider external | complete |
| postgame-analyze | completed Games | PostGame → opaque handoff → Analyze lazy route | completed record | completed → Analyze; Play resource ownership unchanged | corrupt handoff | `play-post-game-experience.spec.js`, `play-analyze-resources.spec.js` | Chromium exhaustive | none | complete |
| postgame-mentor | completed Games | PostGame → Mentor lazy groups | completed record | completed → Mentor-ready | load failure remains bounded | `play-lazy-loading.spec.js`, `play-mentor-foundation.spec.js` | Chromium exhaustive | none | complete |
| mentor-guided-summary | Mentor review | analysis → Critical Moments → Guided Replay → Knowledge → Summary | Mentor fixture | selected → replay → summary; max 1 replay board | missing mapping/expired replay | `play-guided-replay.spec.js`, `play-critical-moments.spec.js` | Chromium exhaustive | manual instructional review | complete |
| pgn-export | PostGame | GameRecord → clipboard/download | completed PGN | completed remains completed; URL revoked | clipboard/download rejection | `play-post-game-experience.spec.js` | Chromium exhaustive | browser permission varies | complete |
| orientation-swap | active Games | shell → board adapter | active game | white → black → white; same board/FEN | invalid orientation rejected | `play-chessboard-adapter.spec.js`, `play-simplified-shell.spec.js` | Chromium exhaustive | none | complete |
| promotion | controlled Play | board → promotion → lifecycle/record | promotion FEN | active → promotion → active; one commit | cancellation/stale response | `play-game-state.spec.js`, `play-chessboard-adapter.spec.js` | Chromium exhaustive | none | complete |
| timeout | active Games | clock → lifecycle → PostGame | deterministic clock | active → completed; RAF stops | duplicate timeout suppressed | `play-clock-service.spec.js`, `play-game-state.spec.js` | Chromium exhaustive | real background throttling manual | complete |
| new-game | active Games | GamesPanel → lifecycle/clock/Worker reset | active game | active → fresh active; one board/Worker | stale reply rejected | `play-game-lifecycle.spec.js`, `play-game-state.spec.js` | Chromium exhaustive | none | complete |
| rematch | completed Bot/Coach | PostGame → prior panel → lifecycle | terminal fixture | completed → active; opponent/config retained | duplicate command suppressed | `play-bots.spec.js`, `play-coach.spec.js`, `play-post-game-experience.spec.js` | Chromium exhaustive | none | complete |
| lazy-route-action | Games QA | route/action → lazy registry → panel/Mentor/Analyze | local resources | unloaded → loaded once; stale completion ignored | load failure/retry | `play-lazy-loading.spec.js` | Chromium exhaustive | network scheduling varies | complete |
| worker-failure | active Games | Worker transport → lifecycle/fallback → board | controlled failure | active → failed/degraded; board intact | constructor/error/messageerror | `play-worker-lifecycle.spec.js`, `play-engine-evaluation.spec.js` | Chromium exhaustive | external Worker gate | complete |
| navigation-restoration | active Games | route → Classic/Analyze → Back/Forward → shell | active game | Play state restored; one board/Worker/listener set | corrupt handoff | `play-routing.spec.js`, `play-integration-consolidation.spec.js` | Chromium/Firefox/WebKit core | none | complete |
| theme-accessibility | active Games | themes/accessibility → shell | active game | theme persists; 2 live regions; same board | unsupported media/forced colors | `play-themes.spec.js`, `play-accessibility.spec.js`, `play-integration-consolidation.spec.js` | Chromium/Firefox/WebKit core | screen-reader certification manual | complete |
| players-isolation | active machine game | Games → Players → lifecycle/FairPlay/Worker | active machine game | game, board, clock, Worker unchanged; no human game | unavailable provider | `play-players.spec.js`, `play-integration-consolidation.spec.js` | Chromium/Firefox/WebKit core | live provider external | complete |

## Audit decisions

The existing 37 Play browser files contain 172 static declarations and three explicit characterization skips. Required flows were complete but fragmented. Exact subsystem tests remain authoritative for exhaustive variants; the consolidation spec owns shared cross-browser route, lifecycle, resource, FairPlay, theme, and accessibility handoffs. No existing test was removed or weakened.

External Worker, live FICS, and live tablebase runs remain environment-gated and cannot produce a fake local pass. Responsive closure, physical devices, subjective chess play, and screen-reader certification remain later/manual work.
