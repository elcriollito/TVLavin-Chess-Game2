# CAISSA Chess Season 4.3D - Yahoo Classic Game Experience

Status: Implemented

## Objective

Season 4.3D adds an in-page classic game table experience to Yahoo Classic.

When a user selects `Watch` or `Join` from the live room table list, the page transitions from the retro lobby into a retro table shell without opening a popup or navigating away.

## Architecture

Yahoo Classic remains a UI shell over existing CAISSA infrastructure.

The game table view consumes:

- `window.CaissaFICSClient`
- Existing observe flow: `switchObservedGame`
- Existing join/play flow: `handleLobbyAction`
- Existing Style12 event payloads
- Existing FICS `liveGame` state
- Existing FICS `moveHistory`
- Existing Chessboard.js renderer already loaded by CAISSA

The page does not introduce a new FICS client, protocol parser, board model, clock model, move model, PGN model, or replay model.

## Components Reused

The classic table uses existing live data for:

- Board position from `liveGame.currentFen`
- White and black names from `liveGame`
- Ratings from existing active table metadata
- Clocks from `liveGame.whiteClock` and `liveGame.blackClock`
- Turn indicator from `liveGame.sideToMove`
- Move list from existing `moveHistory`
- Game number and table metadata from FICS lobby state

## Lobby to Table Flow

The flow is:

1. Yahoo Classic renders live room tables from existing FICS lobby state.
2. User selects `Watch` or `Join`.
3. Yahoo Classic delegates to existing FICS methods.
4. The classic table shell opens immediately.
5. Style12 updates fill the board, clocks, players, status bar, and move list.

No duplicate FICS command handling is introduced.

## UX Decisions

- The transition is instant and non-animated, matching classic desktop application behavior.
- The lobby and table remain within the same CAISSA Classic shell.
- Table controls use Windows 98 style buttons.
- Advanced controls such as Draw, Resign, Takeback, Options, and Sound are present visually but disabled unless a future phase safely maps them to existing core behavior.
- Chat remains system-only.
- The status bar updates with connection, table, and side-to-move context.

## What Was Not Modified

This phase does not modify:

- FICS gateway
- FICS protocol behavior
- Style12 parser
- PGN
- Replay
- Authentication
- Spectator TV
- Analyze
- Arena
- OpeningDB
- Play

## Validation Expectations

Before promotion, validate:

- Guest Login works.
- Live lobby rows render.
- `Watch` opens a classic table.
- Observe flow still uses existing FICS logic.
- Style12 updates board, clocks, and move list.
- Disconnect and reconnect reset safely.
- Existing FICS and Spectator TV pages remain unaffected.
- Production Validation Suite remains PASS.
