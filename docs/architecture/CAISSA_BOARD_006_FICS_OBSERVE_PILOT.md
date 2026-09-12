# CAISSA-BOARD-006 — FICS Observe persistent renderer pilot

Status: local pilot candidate; feature flag OFF by default.

## Scope and ownership

The pilot changes only the visible board renderer while a live FICS game is
being observed. `CaissaFICSClient` remains the sole owner of the socket,
Style12 parsing, canonical game/session state, clocks, commands, move history,
PGN, reconnect behavior, and game results.

The one-way path is:

```text
FICS socket
  -> CaissaFICSClient
  -> canonical liveGame / Style12 state
  -> js/fics-board-view.js presentation projection
  -> CaissaBoardAdapter
  -> CaissaPersistentRenderer
```

The adapter and renderer do not send commands or validate chess rules. The
client derives a semantic visual move with the existing chess library only
when the prior FEN, move evidence, target placement, turn, and castling rights
agree. `CaissaBoardAdapter.applyMove()` also verifies the semantic result
against the canonical target placement. Otherwise the board recovers with
`setPosition()`.

## Selection and fail-closed behavior

`CAISSA_FICS_PERSISTENT_BOARD_PILOT` is enabled only by the strict boolean
value `true`; it is not set by the production document and has no user-facing
toggle. With the flag OFF, `fics-client.js` executes the pre-existing raw
Chessboard.js construction path without a wrapper.

With the flag ON, `js/fics-board-view.js` owns one stable compatibility facade
and exactly one underlying renderer. It begins with Chessboard.js and may
atomically replace it only when canonical state says all of the following:

- `observedGame === true`;
- `status === "observing"`;
- `gameActive !== true`;
- relation is neither `1` nor `-1`.

The persistent renderer is always configured `interactive: false` and
`readOnly: true`. If state becomes playable, pending visual work is cancelled,
the persistent renderer is destroyed, and Chessboard.js is recreated
synchronously before the playable state is presented. There is no hidden or
second updating board.

## Update and recovery policy

- A single trustworthy live transition is applied with `applyMove()` so the
  mover and all unaffected piece nodes retain identity.
- Multiple Style12 events in one animation frame are reduced to the latest
  visual snapshot. The client still processes every Style12 event.
- Missing/ambiguous move evidence, initial observation, reconnect recovery,
  and arbitrary snapshots use `setPosition()`.
- A newer queued snapshot supersedes stale visual work; renderer animation
  cancellation remains owned by `CaissaPersistentRenderer`.
- Duplicate FENs are accepted as unchanged visual state.
- Orientation delegates to the active renderer without reconstructing it.
- Player bars and clocks remain outside renderer ownership and cannot resize
  the board during an ordinary move.

## Historical review

BOARD-006 uses the existing FICS review owner and supports strategy A: review
FEN jumps call the stable board facade, which maps to persistent
`setPosition()`. While the review cursor is historical, incoming live Style12
state is retained canonically but is not painted over the historical board.
Notation click, ArrowLeft, ArrowRight, Home, End, and Live/final restore remain
owned by `CaissaFICSShell`.

## Certification boundary

Deterministic fixtures cover initial observation, semantic quiet/capture/
castling/promotion transitions, 20 moves, duplicate FEN, reconnect-style FEN,
50-update visual burst, 100-position soak, orientation, historical review,
Live restore, portrait, landscape, reduced motion, accessibility, and the
playable fail-closed transition in Chromium and WebKit. Live FICS, Worker,
gateway, Play, Analyze, Bots, Coach, Seek, Tables, Players, and production
deployment are outside this pilot.
