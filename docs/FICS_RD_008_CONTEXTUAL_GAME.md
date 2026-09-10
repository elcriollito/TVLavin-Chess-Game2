# FICS-RD-008 Contextual Game, Replay, and Analyze Handoff

RD-008 supersedes RD-004's invisible primary-game navigation and `← Game`
affordance. The HEAD shows Tables, Players, and Seek in the lobby, and adds a
fourth Game tab only while a meaningful `PLAYING`, `OBSERVING`, or retained
`GAME_OVER` projection exists. Selecting a lobby tab changes presentation only;
the canonical game, board, socket, and session remain owned by
`CaissaFICSClient`.

## Replay ownership and safety

The shell owns only a replay cursor: `currentPly`, `latestPly`, and whether the
cursor is reviewing history. It does not copy the move list or create a chess
game. The initial position is the canonical `pgnStartFen`; subsequent positions
are the FEN values already validated and captured with canonical Style12 move
history. The existing FICS board instance renders the selected FEN.

Notation buttons and ArrowLeft, ArrowRight, Home, and End move the replay
cursor. Shortcuts are ignored in editable controls, Console input, Settings,
and dialogs. While an actively played game is behind Live, both drag start and
graphical move submission fail closed. Returning to the latest ply restores
input. New moves advance a cursor already following Live, but leave a historical
cursor in place and expose a compact Live action.

## Analyze handoff

Analyze continues to use the established `CaissaAnalyzeHandoff` opaque-token
sessionStorage transport. `CaissaFICSAnalyzeHandoff` is a narrow adapter that
serializes canonical client PGN/FEN and truthful metadata, stores the immutable
payload through that transport, and asks `CaissaNavigation` to enter Analyze
with only the token in navigation state. It owns no engine, board, parser,
navigation state, or durable game state.

Observed captures retain `recordStatus: partial`; Analyze labels them as a
partial FICS handoff and receives the actual captured starting FEN rather than
invented opening moves. Complete played records remain `complete`. Unsafe or
unavailable records fail closed before storage.

No opening name is shown. The audited FICS/Analyze path did not expose a reliable
approved opening-identification utility suitable for reuse, so RD-008 avoids a
second ECO database or parser. Players remains unchanged and unsupported.

## Workspace contract

The right workspace remains intrinsic HEAD, `minmax(0, 1fr)` BODY, and intrinsic
compact hybrid-Console FOOT. Session identity and Settings stay outside HEAD.
The feature-flag rollback continues to restore the legacy hierarchy and original
node identities.
