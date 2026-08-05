# Play v2 iPhone QA 11.8.1 - consolidated physical record

**Season:** 11.8.1F

**Status:** NOT CERTIFIED - PROMOTION PHYSICAL GATE OPEN

**Evidence classification:** sanitized, attributed physical-session consolidation with declared blocked and not-executed cases. It is not a completed `PlayV2PhysicalDeviceQAEvidence@1.0.0` certification instance because promotion was not physically executed and exact viewport/DPR evidence was not recorded.

## Attribution

- Physical device: Apple iPhone 17 Pro
- Operating system: iOS 26.6
- Browser: Safari bundled with iOS 26.6; exact Safari build not observable
- CAISSA build: `bce7c7e94ba3c5f425ff41862b1ad90cf5a5f56f`
- `play-v2.html` SHA-256: `FF741ABC9C8768112C013FD0FCFE7D3D7DB2FB962892DD5712373A6837379932`
- Execution window: 2026-08-04 through 2026-08-05
- Tester attribution: product-owner physical observation
- Network classification: temporary private HTTPS; fully removed after testing
- Evidence files committed: none

No local address, network name, certificate identifier, certificate material, private key, password, PID, temporary path, personal filename, screenshot, video, notification content, account identity, or device identifier is retained here.

## Finding retests

| Finding | Physical result | Preserved observation |
| --- | --- | --- |
| `IPH-11.8.1-003` | PASS | The Play CTA did not overlap setup content; all content was reachable. |
| `IPH-11.8.1-004` | PASS | Safe areas, Dynamic Island clearance, and expanded/collapsed Safari chrome were stable. |
| `IPH-11.8.1-005` | PASS | Expanded setup remained usable; `10+0` and `15+10` were legible and selectable. |
| `IPH-11.8.1-006` | PASS | Collapsed summaries for `1+0 - Bullet - White`, `3+2 - Blitz - Black`, and `15+10 - Rapid - Random` updated immediately and correctly. |
| `IPH-11.8.1-007` | PASS | The CTA remained clear of Safari chrome and the home indicator; rotation was stable with no hidden content or horizontal scroll. |
| `IPH-11.8.1-008` | PASS | Inline Analyze presented one contained board; portrait/landscape/portrait, Back, exact PostGame restoration, scrolling, and CAISSA identity passed. |

These physical retests close findings `IPH-11.8.1-003` through `IPH-11.8.1-008` only on the attributed device, OS, browser, and build. They do not imply other-platform results.

## iPhone case inventory

| Case | Disposition | Attributed observation or limitation |
| --- | --- | --- |
| `IOS-009` | PASS | Tap selection and legal destinations were visible; tap-to-move committed exactly one move. |
| `IOS-010` | BLOCKED | Safari did not offer native piece drag. No scroll, echo, duplication, or displacement occurred. Tap-to-move remained functional and is the certified mobile mechanism. This is not PASS or FAIL. |
| `IOS-011` | PASS | White and Black produced the correct color/orientation; Random assigned Black and oriented correctly in the observed run. |
| `IOS-012` | PASS | All seven presets updated selection and summary correctly; one Play CTA remained. |
| `IOS-013` | PASS | Immediate duplicate activation produced exactly one game, board, and visible session. |
| `IOS-014` | PASS | Both `3+2` clocks initialized, alternated, applied one two-second increment per completed move, and remained stable. |
| `IOS-015` | PASS | Resign confirmation produced one PostGame with the observed loss-by-resignation result and CAISSA identity; clocks stopped and no late response was visible. Worker termination is supported separately by technical evidence. |
| `IOS-016` | NOT EXECUTED | No authorized deterministic public Play v2 route reaches promotion without FEN, console access, internal state manipulation, or a runtime fixture. No promotion modal or piece choice is claimed physically tested. |
| `IOS-017` | PASS | Rematch preserved the permitted `3+2` configuration and reset one game; New Game returned to setup without auto-start. |
| `IOS-018` | PASS | Copy PGN, Download PGN, local consent, Save PGN Locally, and duplicate-save prevention functioned. |
| `IOS-019` | PASS | Analyze opened one correct completed-game workspace without overflow; Back restored the exact PostGame. |
| `IOS-020` | PASS | Mentor opened only by explicit action; its board, move list, First/Previous/Next/Last, containment, and Back restoration passed with no prohibited educational surface. |
| `IOS-021` | PASS | Four bot cards, reachable setup, no visible auto-start, one game/board, tap interaction, CAISSA replies, single PostGame, and no visible late response passed. Worker counts are technical evidence, not visual inference. |
| `IOS-022` | PASS | Coach setup, explicit Help, bounded contextual non-answer content, one board, clean PostGame, and educational isolation passed. |
| `IOS-023` | PASS | With the original Reduce Motion preference ON, mode changes, start/moves, PostGame, Mentor, and Back remained stable; the preference was restored to ON. |
| `IOS-024` | PASS with capability limitation | Safari Page Zoom and reflow at 200% passed. Pinch zoom is BLOCKED because Safari did not offer it; it is not claimed as PASS or FAIL. |
| `IOS-025` | PASS | Setup and active-game background/foreground returned without reload; the same position, turn, session, and reconciled clocks continued after a brief redraw. |
| `IOS-026` | PARTIAL - PROMOTION NOT EXECUTED | Safari chrome transitions and portrait/landscape/portrait during active play passed. The promotion portion was not executed and is not PASS. |
| `IOS-027` | PASS with blocked subcase | Players was absent and the direct route failed closed with the unavailable document and no lobby, users, identity, ratings, presence, matchmaking, or FICS. Tab-order testing is BLOCKED because no physical external keyboard was available. |

The supplied consolidation does not independently relabel `IOS-001` through `IOS-008`. Their underlying initial-entry, board, chrome, safe-area, rotation, reachability, and overflow observations are retained in the finding retests and session narrative without inventing duplicate case verdicts.

## VoiceOver physical result

`VO-1` through `VO-5`: **PASS** on the attributed device, browser, OS, and build.

- Play Game, Play Bots, and Play Coach structure/navigation were usable; Players, FICS, and prohibited educational surfaces were absent.
- Setup radios, selected states, summary, and Play were announced and operable.
- One legal move was completed using VoiceOver only; the subsequent response/turn was perceptible.
- Clocks were differentiated without continuous speech or duplicate announcements.
- Resign, confirmation, one result announcement, and PostGame action order passed.
- Analyze exposed one accessible workspace; Back restored PostGame and focus.
- Mentor was explicit; First/Previous/Next/Last and move-list navigation passed; Back restored PostGame.
- The interface remained stable after VoiceOver was disabled.

Siri was used to disable VoiceOver. The configured Accessibility Shortcut contained multiple device functions, so triple-click was not a direct exit. This is device configuration, not a Play v2 defect.

## Technical boundary result

`SEC-001`: **PASS visual and technical**.

- Native Bots Worker lifecycle: `0 -> 1 -> 0 -> 0` before Play, during play, after PostGame, and after route exit.
- The Worker was same-origin with JavaScript MIME and `worker-src 'self'` CSP ownership.
- The negative Players route returned the deterministic unavailable document with no scripts or board.
- Play v2 produced zero auth requests/resources, external destinations, FICS runtime resources, prohibited educational runtime resources, analytics transport, CSP violations, WebSockets, storage writes, cookies, request failures, HTTP errors, console errors, or page errors in the recorded technical gate.
- A separate Classic-root navigation loaded Classic-owned FICS, Academy, and auth resources. The request partition proved those resources did not occur in any Play v2 segment and they are not attributed to Play v2.

## Promotion contract decision

Current automation covers promotion rules and presentation but cannot replace physical execution:

- `play-games-quick-play.spec.js` exercises Queen, Rook, Bishop, and Knight choices in both orientations through controlled promotion positions.
- `responsive-play-workflows.spec.js` checks promotion-modal containment across representative responsive profiles in Chromium and WebKit ownership.
- game-state, compatibility, clock, lifecycle, accessibility, record, and regression owners cover pending promotion, choice, notation, pause/commit, semantics, and persistence.
- the shared physical touch path was validated through tap-to-move and VoiceOver-only move execution.

All browser promotion owners use controlled fixture/FEN setup. Under `PlayV2PhysicalDeviceQAPlan@1.0.0`, automated pre-QA evidence must never be copied into physical results. `IOS-016` requires physical promotion of both colors to Queen, Rook, Bishop, and Knight. The severity policy identifies impossible promotion as P1, and certification may be `passed` only after every required result passes with no open P0/P1.

Therefore **PHYSICALLY ACCEPTED WITH DECLARED PROMOTION GAP is not an authorized certification status**. The honest verdict is **NOT CERTIFIED - PROMOTION PHYSICAL GATE OPEN**. This preserves the automation evidence, the successful shared touch evidence, and the explicit fact that the promotion modal and choices were not physically tested.

No public FEN, hidden query, console manipulation, runtime fixture, Endgame Trainer substitution, or implementation is authorized by this record.

## Remaining gates and platform recommendation

- `IOS-016` and the promotion portion of `IOS-026`: NOT EXECUTED; blocking physical gate.
- `IOS-027` external-keyboard Tab order: BLOCKED by unavailable hardware; visible as a capability gap, not PASS or FAIL.
- `IOS-010` native drag: BLOCKED by Safari capability; certified tap-to-move passed.
- `IOS-024` pinch zoom: BLOCKED by Safari capability; Page Zoom 200% passed.
- Final iPhone certification: NOT CERTIFIED.

iPad QA may begin as a separate platform track because iPhone promotion does not invalidate the already observed iPhone results. It must not inherit iPhone PASS results, close the iPhone promotion gate, or claim cross-device certification. Because tablet case `TAB-006` independently requires physical promotion, begin iPad QA only if a public, authorized, deterministic promotion path exists for that session or accept in advance that iPad certification will also remain incomplete.

## Cleanup and release boundary

The laptop-side temporary private HTTPS environment was fully removed after testing: processes stopped, listeners closed, firewall rule removed, QA certificates removed, and temporary artifacts removed. Device-side trust/profile/public-certificate removal instructions were issued; this consolidation does not invent an independent completion observation that was not supplied for this final session. No sensitive infrastructure detail is retained here.

No runtime, CSS, route, test, generated file, dependency, lockfile, production default, public gate, analytics transport, FICS boundary, educational boundary, or Players state was changed. Nothing was committed, pushed, deployed, tunneled, indexed, or publicly exposed by Season 11.8.1F.
