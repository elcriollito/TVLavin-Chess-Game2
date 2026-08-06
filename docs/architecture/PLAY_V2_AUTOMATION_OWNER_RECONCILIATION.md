# Play v2 automation owner reconciliation

Status: local test and documentation reconciliation; no runtime change

## Frozen historical expectations

The original runnable PostGame owner arrived in `8392c34` and characterized winner-color copy (`White wins.` and `Black wins.`) plus an Analyze handoff exposed in the URL. Those three expectations remain historically attributable to that version but no longer own current acceptance.

`0af77a0` introduced the result-first `PlayV2PostGamePolicy@1.0.0`: completed `GameRecord` data remains authoritative while the title is expressed from the player's perspective and the termination reason is separate. `ac2eff4` retained the historical 1.0 declaration inside `PlayV2PostGamePolicy@1.1.0`, made Analyze the sole primary action, and retained Rematch and New Game as strong secondary actions. `60847a5` introduced the current inline Analyze continuation and consumes its opaque handoff internally without placing the token, FEN, or PGN in the URL.

The runnable owner now asserts `You Won`, `You Lost`, and `Draw`, their separate termination reasons, one completed record, optional post-game Mentor without embedded educational concepts, inline Analyze, an unchanged URL, and exact Back restoration. The superseded literal copy, former Mentor prohibition, and URL transport remain documented here rather than skipped or silently erased.

## Routing succession

The routing scenario introduced in `617cef7` allowed setup Play to open Analyze and exposed a handoff query. Current Play v2 requires an explicit completed-game continuation. Setup, active play, query, fragment, Web Storage, History API state, absent tokens, consumed tokens, and expired tokens cannot manufacture that continuation. PostGame may open inline Analyze once the completed record has produced an internal one-use handoff, and Back restores that PostGame. Legacy active-position Analyze remains independently owned by the compatibility boundary and is not converted to the Play v2 inline contract.

## ClockService ownership

The former shell guard rejected the text `ClockService` anywhere, although the approved transition already delegated teardown to `CaissaClockService.stop('postgame-mode-transition')`. Its actual safety purpose is preventing a second clock owner, parallel timers, unauthorized start/configure/reset/update/switch operations, and direct clock-state mutation.

The reconciled guard allows exactly one canonical stop delegation with the fixed teardown reason. It continues to prohibit clock construction, timer ownership, configure/start/reset/update/switchTurn calls, ClockService assignment, and direct member assignment. This permission does not admit a new clock, timer, or state owner.
