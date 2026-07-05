# CAISSA Chess Season 4.3D.1 - Classic Responsive Workspace

Status: Implemented

## Objective

Season 4.3D.1 changes Yahoo Classic from a centered retro window into a full workspace application inside the CAISSA content area.

The goal is to make CAISSA Classic feel like a Windows 98 era chess application running maximized inside the browser rather than a static image or preview panel.

## Workspace Redesign

The Yahoo Classic shell now:

- Expands to the full available content width.
- Uses the available viewport height.
- Keeps only minimal breathing room around the retro application frame.
- Uses a grid layout with header, workspace/table, chat, and status bar rows.

The modern CAISSA sidebar remains untouched.

## Lobby Scaling

The lobby now grows with available space:

- Room Tables stretch vertically.
- Player List stretches vertically.
- Sidebar remains compact but scrolls if needed.
- Fixed `440px` table/list limits were removed.

This makes ultrawide and tall desktop layouts feel like a real full-screen lobby.

## Game View Scaling

The classic table view now uses more of the available screen:

- The board panel centers the board vertically.
- The board can grow up to a larger desktop maximum.
- Player bars match the board width.
- Move list stretches to the available panel height.

The game view remains a shell over the existing FICS board/session data. No game logic was changed.

## Responsive Strategy

Desktop:

- Full workspace expansion.
- Wider lobby and table columns.
- Larger board.

Ultrawide:

- The central table area and game board take advantage of horizontal room.
- Player list and move list remain readable without excessive blank space.

Tablet:

- Panels reduce to two-column layouts.
- Board scales down while remaining the visual anchor.

Mobile:

- Panels stack vertically.
- Table rows retain their classic grid and scroll only where necessary.
- Chat keeps a compact fixed height.

## What Was Not Modified

This phase does not modify:

- FICS gateway
- FICS protocol behavior
- Style12
- Replay
- PGN
- Authentication
- State model
- Spectator TV
- Analyze
- Arena
- OpeningDB
- Watch / Join behavior
- Move history logic
- Clock logic
- Board model

## Validation Expectations

Before promotion, validate:

- `/yahoo-classic` fills the available content area.
- Lobby no longer appears as a centered image.
- Room tables and player list stretch with the workspace.
- Game table opens and board renders larger when space allows.
- Tablet and mobile remain usable.
- Production Validation Suite remains PASS.
