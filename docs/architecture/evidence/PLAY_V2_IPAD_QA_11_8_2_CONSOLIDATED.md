# Play v2 iPad QA 11.8.2 - consolidated physical record

**Season:** 11.8.2 FINAL

**Status:** IPAD PHYSICALLY ACCEPTED — ALL REQUIRED DEVICE-AVAILABLE GATES PASSED WITH DECLARED P2 ANALYZE RESIDUAL RISK

**Evidence classification:** sanitized, attributed final physical certification record. Device-available requirements passed; unavailable capabilities remain BLOCKED or NOT APPLICABLE and are not converted to PASS or FAIL.

## Attribution

- Physical device: Apple iPad Pro 11-inch, 4th generation
- Model: `MNXF3LL/A`
- Operating system: iPadOS 26.4.2
- Browser: Safari bundled with iPadOS; exact Safari build not observable
- CAISSA build: `c4eaba751c11ec3318457655c3c0c19386322877`
- Tester attribution: product-owner physical observation, independently reviewed against supporting technical evidence
- Network classification: temporary private HTTPS, fully removed after testing
- Evidence files committed: none

No local address, network name, PID, certificate identifier or material, private key, password, temporary path, screenshot, video, full JSON, log, account identity, or personal information is retained here.

## Finding disposition

- `IPAD-11.8.2-001: PHYSICALLY PASSED`
- `IPAD-11.8.2-003: PHYSICALLY PASSED`
- `IPAD-11.8.2-002: CLOSED AS ACCEPTED P2 RESIDUAL RISK — HISTORICAL PHYSICAL FINDING PRESERVED; NOT FIXED; ROOT CAUSE UNKNOWN`

The intermittent portrait Analyze collapse was physically real. No specific Inline Analyze fix was implemented and its root cause remains unknown. Four directed physical openings, 28 complete instrumented generations (15 landscape and 13 portrait), and the final physical matrix did not reproduce it. Sanitized evidence hashes are `AC62C691CC5DBAA51B0B47D3AB388F53C9B421FBED7C35E2AE3F50BEEC752ACE` and `F3A33439B2E26DDB631650C1190ED1DF599BDA1EFED5D00EE4E5D8F3DF668591`.

The finding reopens immediately as P1 if the collapse recurs, becomes repeatable, blocks recovery, loses or corrupts GameRecord, PGN or completed-game state, persistently hides essential controls, affects active gameplay, or appears outside post-game Inline Analyze.

## Tablet matrix

| Case | Disposition | Attributed result |
| --- | --- | --- |
| `TAB-001` | PASS | Portrait board-first hierarchy, square practical board and reachable layout passed. |
| `TAB-002` | PASS | Landscape board/context composition remained bounded and reachable. |
| `TAB-003` | PASS | Setup and active-play rotation preserved one board, selection, position, turn, clocks, orientation and focus. |
| `TAB-004` | PASS | EvaluationRail remained contained in Games, Bots and Coach. |
| `TAB-005` | PASS with limitation | Tap-to-move, legal-square states, clocks, seven presets, colors, summary and one CTA passed. Drag is BLOCKED because Safari/iPadOS did not offer it. |
| `TAB-006` | PASS | White and Black promotion to Queen, Rook, Bishop and Knight passed through the real modal. |
| `TAB-007` | PASS | PostGame hierarchy, PGN actions, Rematch, New Game and Analyze/Back passed. |
| `TAB-008` | PASS | Explicit Mentor, square board, move navigation and exact Back restoration passed. |
| `TAB-009` | NOT APPLICABLE | Play v2 exposes no legitimate public text field that invokes the virtual keyboard. |
| `TAB-010` | PASS with limitation | Windowed Apps and practical resize/reflow passed. Traditional Split View is BLOCKED because this interface did not offer it. |
| `TAB-011` | PASS | Physical Bots/Coach behavior and supporting Worker lifecycle evidence passed. |
| `TAB-012` | PASS | Players was absent and its direct route failed closed. |

## Modes, gameplay and accessibility

- `MODE-001` Games: PASS. Orientation/ownership, clocks and increments, presets/color/CTA, tap-to-move, rotation, background/foreground, PostGame, Copy/Download/Save PGN with consent, duplicate prevention, Rematch/New Game and exact Analyze/Back restoration passed with one board and no overflow.
- `MODE-002` Bots: PASS. Four cards, clean setup, no auto-start, one game/board, responses, clocks, rotation, PostGame, Rematch and clean exit passed.
- `MODE-003` Coach: PASS. Compact setup, bounded contextual Help without best move/PV/answer leakage, educational isolation, clean mode changes and PostGame passed.
- `MODE-004` Mentor: PASS. Explicit launch, navigation, containment, accessibility and Back restoration passed.
- `MODE-005` Players: PASS. No visible surface, runtime, lobby, user, rating, presence, matchmaking or FICS exposure; the negative route was unavailable.
- VoiceOver iPad `VO-1` through `VO-5`: PASS.
- Page Zoom and reflow at 200%, Reduce Motion, Safari chrome/safe areas, background/foreground and Windowed Apps: PASS.
- Safari real reload: NO DETERMINABLE.
- External-keyboard Tab order: BLOCKED because no external keyboard was available.
- Virtual keyboard: NOT APPLICABLE because no legitimate public text field exists.

## Physical promotion matrix

All eight cases passed individually: White and Black promotion to Queen, Rook, Bishop and Knight. The product owner observed tap-to-move, the real contained modal, the selected single piece on the correct square, `verified` status, correct orientation, one board, coherent PostGame or automatic final state, clean reset, portrait/landscape and Safari chrome coverage, and zero echo, duplication or overflow.

## Technical boundary

`SEC-001`: **PASS visual and technical**.

- Native Bots Worker lifecycle was `0 -> 1 -> 0`; Rematch created one new and unique Worker, and exit to Games returned to `0`. These counts are technical evidence, not human visual inference.
- Play v2 remained same-origin with a canonical Worker and `worker-src 'self'` ownership.
- Players, promotion and diagnostic gates failed closed outside their authorized process state; direct QA HTML failed closed.
- Play v2 produced zero auth activity, external destinations, FICS runtime activity, prohibited educational runtime activity, analytics transport, CSP violations, WebSockets, storage writes, cookies, request failures, console errors or page errors in the technical gates.
- Same-origin analytics/Clarity bootstrap resources may load locally, but produced no analytics transport or external destination.

Classic/Legacy requests exercised by separate automated owners are not attributed to physical Play v2 segments. Backend access logs did not contain sufficient client attribution to infer Safari console or physical Worker counts; automation supplies only the technical lifecycle evidence stated above.

## Additional observations

`Review with Mentor — visual discoverability/contrast polish pending` is a nonblocking P3 observation. It belongs with future Rematch/New Game hierarchy polish and does not change the physical verdict.

An initial device request occurred while the device was on a network outside the approved test environment. The user did not continue. It is classified `INVALID PRE-TEST SEGMENT — STOPPED BEFORE CONTINUE`; all valid evidence began only after returning to the authorized network and obtaining HTTPS without a warning. It is neither PASS nor a CAISSA defect.

## Cleanup and release boundary

Backend and proxy were stopped; listeners, firewall, QA certificates and persistent process gates were zero; temporary certificates, keys, PFX, password, handoff material and logs were removed. On the iPad, Root trust and the QA profile were removed, the transferred public certificate and Recently Deleted were cleared, and Auto-Join was restored according to the user's preference.

No runtime, CSS, test, route, gate, builder, generated HTML, dependency, lockfile, production default or public-beta state changed. This device certification does not by itself authorize invite-only or public-beta exposure.
