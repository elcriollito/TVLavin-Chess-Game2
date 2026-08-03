# Legacy Analyze Compatibility Restoration

Status: **IMPLEMENTED LOCALLY — VALIDATION REQUIRED BEFORE COMMIT**

Issue: `LEGACY-ANALYZE-42C64AA-001`

Date: 2026-08-03

## Regression origin

Differential Chromium and WebKit execution established this matrix before implementation:

| Baseline | Chromium | WebKit |
|---|---|---|
| `origin/main` — `7cec9ea` | PASS | PASS |
| `42c64aa^` — `32f0da4` | PASS | PASS |
| clean `42c64aa` | FAIL | FAIL |
| dirty worktree based on `42c64aa` | FAIL | FAIL |

Commit `42c64aa8d82794ce6d45d6ad9debff4fb4d532d9` changed the shared handoff creator to require a completed `GameRecord`. That rule is correct for Play v2 PostGame, but Legacy `openAnalyze` also used the shared creator while a game was active. The handoff failed and the independent `#analyzeSection` never became active.

## Explicit contracts

### Legacy active-game Analyze

`createFromLegacyActivePlay()` accepts no caller-controlled context selector. It reads the trusted compatibility snapshot and requires all of the following:

- the entry is not marked as Play v2;
- the current owner is mounted, active Legacy Play;
- the game is active and has no final result;
- the current FEN is legal;
- any available move history replays legally to that exact current FEN;
- the current PGN has no final result token.

The opaque payload identifies an active `inspect-current-position` handoff. It may contain the current legal position, current move history, player color, board orientation, and mode. It explicitly carries no record ID, final result, termination, completed classification, or accuracy. Navigation continues to the independent Legacy Analyzer and never invokes the Play v2 inline dialog.

### Play v2 completed-game Analyze

`createFromCompletedPlayRecord(record)` requires the existing `GameRecord` validator plus:

- `status: completed` and `result.complete: true`;
- a final result of `1-0`, `0-1`, or `1/2-1/2`;
- a non-empty termination;
- at least one move;
- PGN that replays legally to the recorded final FEN.

Play v2 PostGame calls only this API. Its inline owner consumes the opaque token exactly once, remains URL-preserving, and returns to the identical PostGame. Active, incomplete, malformed, illegal, expired, missing, and already-consumed handoffs fail closed.

## Caller inventory

| Caller | Product/state | API and validation | Destination | Intended behavior |
|---|---|---|---|---|
| `CaissaPlayCompatibility.execute('openAnalyze')` | Classic/Legacy active game | `createFromLegacyActivePlay()` | Independent Analyze section | Inspect current position without completion claims |
| `CaissaNavigation.navigateToSection('analyze')` without a supplied token | Classic/Legacy active navigation | `createFromLegacyActivePlay()` | Independent Analyze section | Preserve established SPA navigation |
| Legacy `PostGameExperience` Analyze | Completed Legacy quick-play record | `createFromCompletedPlayRecord(record)` | Independent Analyze section | Review the finalized record through a supplied token |
| Play v2 `PostGameCore` Analyze This Game | Completed Play v2 record | `createFromCompletedPlayRecord(record)` | Play v2 inline Analyze | Strict completed-game continuation |
| `PlayV2InlineAnalyze.open()` | Completed Play v2 handoff | one-time `consume(token)` | Inline modal owner | Reject stale, missing, or reused tokens |
| `AnalyzeSection.onEnter()` | Independent Legacy destination | `resolve(token)` or supplied trusted handoff | Independent Analyze workspace | Hydrate active position or completed record honestly |
| Play v2 readiness probe | Capability only | checks completed-record API exists | none | No handoff creation |
| Native Mentor review | Completed Play v2 record | separate Mentor handoff contract | Native Mentor workspace | Does not share Analyze context selection |

No query parameter, fragment, storage value, history state, mode option, or retry input selects the Legacy contract. The compatibility boundary derives the product context from the owned document marker, and the handoff API accepts no context argument.

## Test ownership

- The formerly failing Chromium/WebKit compatibility case proves active Legacy navigation, independent Analyzer visibility, active-status metadata, absence of the inline class, and return without game-state corruption.
- Handoff unit tests prove strict completed-record rejection, honest active snapshots, expiry, storage failure, bounded cleanup, and one-time consumption.
- Play v2 browser tests attempt the Legacy API after query, fragment, storage, history, mode, and retry manipulation and verify it remains unavailable.
- Existing PostGame, Analyze, GameRecord, Worker, product-boundary, FICS-isolation, Players-exclusion, ECO, same-origin, desktop, and Classic/Legacy owners remain authoritative regression gates.

## Release status

This restoration does not expose Play v2, alter `/play` defaults, enable analytics, connect FICS, enable Players, or add educational surfaces. Physical iPhone QA remains **NOT CERTIFIED — PAUSED**. The historical blocked-session evidence remains unchanged. No public-readiness or Season 11 completion claim is made.
