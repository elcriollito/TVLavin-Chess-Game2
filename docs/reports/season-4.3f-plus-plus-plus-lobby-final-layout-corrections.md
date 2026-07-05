# Season 4.3F+++ - CAISSA Classic Lobby Final Layout Corrections

## Objective

Season 4.3F+++ applies final visual corrections to the CAISSA Classic lobby after comparing the production layout against the classic Yahoo Chess lobby structure.

This phase is UI, layout, CSS, and render refinement only.

## Lower Workspace Height Correction

The Classic shell now uses the available content height so the chat and Win98-style status bar sit at the bottom of the shell. This removes the visible empty background below the lobby on desktop while preserving the existing stacked mobile behavior.

## Table Layout Correction

The room table now follows the closer Yahoo-style column order:

- Table
- Watch
- White
- Black
- Options
- Who is Watching

The new Watch column contains the existing Watch or JOIN action. It does not introduce new FICS behavior. The action still uses the existing CAISSA Classic table action path:

- Watch uses the existing observe/switch observed game flow.
- JOIN uses the existing play/join flow.

The Who is Watching column is now reserved for watcher count and has the largest share of available table width.

## Rating Color Scale

The Rating Legend now follows the requested Yahoo-style scale:

- 2400+ - black
- 2100-2399 - red
- 1800-2099 - orange
- 1500-1799 - violet/purple
- 1200-1499 - blue
- 0-1199 - green
- Provisional - brown

The right-side player Color column uses the same visual scale when a rating is available. Provisional or unavailable ratings use the brown provisional color.

## Preserved Layout

- The right player panel remains full height.
- Empty player state remains `No live players yet.`
- The chat header remains `CAISSA Lobby`.
- The chat courtesy message remains unchanged.
- The Win98-style browser status bar remains at the bottom.

## What Was Not Changed

This phase did not modify:

- Gateway
- FICS protocol
- Style12
- Replay
- PGN
- Authentication
- Board model
- Clock model
- Spectator TV
- Arena
- Analyze
- OpeningDB
- State model
- Core logic

CAISSA Classic remains a retro UI shell over the existing CAISSA core.

## Validation Notes

Required validation for this phase:

- `node --check js/yahoo-classic-section.js`
- `git diff --check`
- local smoke for `/?section=yahooClassic`
- Watch/JOIN smoke
- Production Validation Suite

