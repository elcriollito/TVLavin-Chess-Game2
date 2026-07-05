# Season 4.3F++ - CAISSA Classic Room Simplification & Lobby Refinement

## Objective

Season 4.3F++ simplifies the visible CAISSA Classic room structure and tightens the lobby layout so it feels closer to a classic Yahoo-era chess lobby while keeping CAISSA's own identity.

This phase is UI, layout, nomenclature, and visual refinement only.

## Room Simplification

The visible room list was reduced to four purposeful rooms:

- CAISSA Lobby
- Tournament Hall
- Computer Hall
- Teaching & Training Hall

Earlier visible room names such as Beginner Hall, Casual Room, Blitz Room, Rapid Room, Classical Room, Masters Lounge, and Spectator Gallery were hidden from the current UI because they duplicated information already shown by the live table list.

## Why CAISSA Lobby Concentrates Game Styles

CAISSA Lobby is now the main room for live FICS tables. It is intended to show all active table styles together:

- Blitz
- Rapid
- Classical
- Rated
- Casual
- Private
- Observed

The live table Options column already communicates time control, game type, and rated/casual state. Splitting those into separate visible rooms at this stage made the interface feel redundant and less like a compact classic lobby.

## Why These Rooms Remain Separate

Tournament Hall remains visible because organized play is a distinct experience from casual table browsing.

Computer Hall remains visible because engine and bot play will become a distinct future area.

Teaching & Training Hall remains visible because lessons, coaching, study rooms, and educational sessions have a different purpose from open table play.

## Future Preparation

The simplified room model leaves room for later expansion without making the current lobby feel crowded. Future phases can reintroduce specialized rooms if they gain distinct behavior, not merely because they represent a time control or rating style.

## Layout Refinement

- Header room tabs were reduced to four compact buttons.
- The left room directory now matches the simplified room model.
- The live table grid keeps the classic columns:
  - Table
  - White
  - Black
  - Options
  - Who is Watching
- Table, White, and Black were kept compact.
- The Options column remains medium width for time/type/rated labels.
- The Who is Watching column receives more space, closer to the classic Yahoo Chess layout.
- The right player list remains full-height with Color, Name, Rating, and Tbl columns.

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
- Arena, Analyze, or OpeningDB
- Core logic

CAISSA Classic remains a retro UI shell over existing CAISSA systems.

## Validation Notes

Required validation for this phase:

- `node --check js/yahoo-classic-section.js`
- `git diff --check`
- local smoke for `/?section=yahooClassic`
- Production Validation Suite

