# Season 10.9 — Endgame Run Private Technical Session

## 1. Baseline

Implementation began on clean `main` at `7bfe5b115c4f8fa4eeadc9212ff88c1fd1af1984`, equal to `origin/main`.

## 2. Existing verified objectives

The run consumes, without modifying, `kp-coordinate-support-promote@1.0.0` and `rule-square-a-pawn-catch-stop-promotion@1.0.0`.

## 3. Run purpose

This hidden technical session verifies that positive construction and defensive prevention can execute sequentially while each item controller remains authoritative.

## 4. Hidden feature gate

Only `?trainerV2=1&multiMovePilot=1&endgameRun=1` activates the run. Unknown values, arbitrary selectors, FENs, objectives, item lists, run IDs, and Guided Study parameters fail closed.

## 5. Run artifact

`endgame-run-technical-two-item@1.0.0` is an immutable, integrity-checked public runtime contract with no latest alias or private review data.

## 6. Deterministic order

The fixed order is promote, then stop-promotion. There is no shuffle, reordering, or Quick Challenge injection.

## 7. Run state machine

The separate run machine covers configured, loading, ready, starting, item active, item feedback, item complete, transitioning, summary, retrying, abandoned, technical unavailable, and error boundaries.

## 8. Item-state ownership

`MultiMovePilotController` remains the sole authority for legality, authored replies, hints, objective evaluation, retry, and item outcomes. The run never reinterprets chess results.

## 9. Session ownership

A run generation plus current item index guards asynchronous item callbacks. Retry Run, Exit, transition, disposal, and load failure invalidate stale ownership.

## 10. Transition model

Terminal item input freezes and Continue becomes primary. Continue records one local result, destroys ownership of the old controller, creates the next controller, and loads its position into the existing board.

## 11. Result model

Memory-only records contain item/objective identity, approved outcome, hints, independence eligibility, terminal reason, and move count. They contain no engine metrics, ratings, reviewer data, or identifiers.

## 12. Summary contract

After two handled items the compact summary reports independent success, assisted success, objective failure, drawing objective miss, technical unavailable, and concise per-item outcomes.

## 13. Technical unavailable

Item technical failures are neutral and retryable. Run-artifact or item-integrity failure prevents partial startup and exposes only neutral Exit.

## 14. Retry Item

Retry Item delegates to the current verified item controller, resets its hints/history/eligibility, preserves prior run records, and reuses the board.

## 15. Retry Run

Retry Run increments generation, clears both records and summary, restores item one, and reuses the run controller and board without reload.

## 16. Exit

Exit invalidates generation, abandons any active item neutrally, clears local records, disposes run listeners on navigation, and returns to normal V2.

## 17. Board lifecycle

One `EndgameBoardView` exists from run loading through summary and retries. Items update position and interaction state; they never mount a board.

## 18. Worker and network boundaries

There are zero Workers, engines, runtime tablebase calls, backend calls, or persistence calls. Only the three immutable static JSON artifacts are fetched.

## 19. Visual integration

Season 10.7 board-first primitives, panel, feedback, buttons, and summary are reused. Added copy is compact and technical.

## 20. Mobile

The existing stacked board-first layout and 44px controls remain. The run adds no sticky region or horizontal surface.

## 21. Tablet

The board stays dominant in the established stacked-to-wide breakpoint behavior; transition and summary remain within the existing panel.

## 22. Desktop

The established approximate 60/40 board/panel layout remains, with no third column or dashboard.

## 23. Accessibility

Native controls, textual status, polite feedback, objective focus on transition, distinct Retry Item/Retry Run labels, reduced-motion delay suppression, and non-color status are preserved. Automated Axe coverage does not claim human screen-reader testing.

## 24. Security

Run, item, objective, version, order, and query inputs use exact allowlists. Fingerprint and SHA-256 checks fail closed. Query parameters cannot submit results or content.

## 25. Run schema

Ephemeral `runSessionSchemaVersion: 1.0.0` owns status, generation, index, ordered IDs, records, completion flags, and summary counts. It is not merged into student state.

## 26. Item integrity

The promote and stop-promotion artifact bytes, fingerprints, and SHA-256 values are regression-locked and unchanged.

## 27. Compatibility

V1 remains default. V2 remains opt-in. Guided Study retains precedence. Quick Challenge, standalone pilots, navigation, pools, manifest, Knowledge, Help, Settings, About, and the mobile drawer are unchanged.

## 28. Tests

Unit coverage verifies artifact integrity, gating, all lifecycle transitions, retries, summary, Kd2, neutral failure, duplicates, and stale ownership. Browser coverage exercises the complete run and compatibility in Chromium, Firefox, and WebKit.

## 29. Visual QA

Ten private screenshots cover ready, both items, transition, summary, mobile, tablet, and technical failure. They live under protected `tests/qa/`.

## 30. Public/private boundary

Only safe runtime JS and the immutable run JSON deploy. Architecture, tests, screenshots, scripts, review materials, evidence, and graphs remain protected.

## 31. Rollback

Removing `endgameRun=1` immediately returns normal V2. Code rollback removes the run branch/modules and artifact without migration.

## 32. Known limitations

The run has exactly two items, fixed order, no pause/resume, no persistence, no calibration, and no public discovery. Refresh discards it.

## 33. Production-readiness gap

This is technical orchestration validation, not a public product mode. Public release would require content scale, product policy, broader human accessibility review, telemetry/privacy decisions, and explicit rollout approval.

## 34. Season 10.10 recommendation

Define a reviewed public-readiness decision packet: curriculum purpose, run-length policy, technical-skip policy, accessibility review, privacy-safe observability, and rollback criteria—without adding content or persistence until approved.
