# Season 4.4A - Professional Game Window

## Objective

Season 4.4A moves focus from the completed CAISSA Classic lobby into the in-page game table. The goal is to make the opened table feel like a professional classic chess client while continuing to reuse CAISSA's existing board, clock, move history, FICS observe/join flow, and Style12 updates.

## What Changed

- Added a compact classic table header above the game area.
- Added table metadata fields for:
  - table number
  - game type
  - rated/casual state
  - time control
  - players
  - spectators
- Refined player cards with:
  - name
  - rating
  - guest/registered marker
  - clock
  - turn indicator
- Added a compact Table Information block for:
  - Opening
  - ECO
  - Move Number
  - Result
  - Game Phase
- Improved the board frame so the existing board feels embedded inside a classic desktop window.
- Tightened left-side table controls with Win98-style button density.
- Refined the move list with a more WinBoard-like fixed-width presentation.
- Expanded the status bar for game context such as connected state, table number, game type, side to move, and spectator count.

## Data Reuse

This phase uses only existing CAISSA data already available inside the Classic view:

- current table metadata
- live game metadata
- move history
- existing clocks
- existing side-to-move flag
- existing observe/join state

Opening, ECO, result, and phase use available metadata when present. When not available, the UI shows safe fallback values such as `Unknown Opening`, `--`, or a lightweight move-count phase.

## What Was Not Changed

This phase did not create or modify:

- Board Model
- Clock Model
- Style12 parser
- Replay
- PGN
- Gateway
- FICS protocol
- State Model
- Authentication
- Spectator TV
- Analyze, Arena, or OpeningDB

CAISSA Classic remains a UI shell over the existing CAISSA core.

## Validation Notes

Required validation for this phase:

- `node --check js/yahoo-classic-section.js`
- `git diff --check`
- local smoke for `/?section=yahooClassic`
- Watch/JOIN smoke
- Production Validation Suite

