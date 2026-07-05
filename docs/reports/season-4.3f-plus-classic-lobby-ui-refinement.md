# Season 4.3F+ - CAISSA Classic Lobby UI Refinement

## Objective

Season 4.3F+ refines the CAISSA Classic lobby so it feels closer to a late-1990s internet chess room while preserving CAISSA's own identity. This phase is visual and presentational only.

## What Changed

- Updated the lobby header to use the branded title `CAISSA Classic Chess`.
- Emphasized `CAISSA` with a large red retro wordmark treatment without using Yahoo logos or assets.
- Added a chess-piece mark next to the title.
- Kept the approved subtitle `Retro Internet Chess Lounge` and the era note `Inspired by the Golden Age of Internet Chess`.
- Refined the main room table into the classic column model:
  - Table
  - White
  - Black
  - Options
  - Who is Watching
- Moved time control, game type, and rated/casual state into compact retro option labels.
- Expanded the watching column so Watch and Join actions remain visible.
- Added a left-side Sign In / Login visual block above the classic controls.
- Consolidated classic controls into Play Now, Join Table, Create Table, Options, Help, and Exit.
- Added a Yahoo-era style rating legend with color keys.
- Updated the player list to use Color, Name, Rating, and Tbl columns.
- Preserved the full-height right player list and empty player layout.
- Kept the large central empty state message: `Connect to FICS to receive live room tables.`
- Refined the bottom status bar wording to feel like a classic browser status area.

## CAISSA Lobby

Older room placeholder language has been removed from the visible lobby. `CAISSA Lobby` is now the primary room name across:

- active room tab
- room summary
- room card
- player panel
- chat header

This makes CAISSA Lobby the official default room for the Classic experience.

## What Was Not Changed

This phase did not modify:

- FICS gateway
- FICS protocol
- Style12 parsing
- Replay
- PGN
- Authentication
- Board model
- Clock model
- Move history
- Spectator TV
- Analyze, Arena, or OpeningDB

The page remains a Classic UI shell over existing CAISSA infrastructure.

## Validation Notes

Required validation for this phase:

- `node --check js/yahoo-classic-section.js`
- `git diff --check`
- local smoke for `/?section=yahooClassic`
- Production Validation Suite

