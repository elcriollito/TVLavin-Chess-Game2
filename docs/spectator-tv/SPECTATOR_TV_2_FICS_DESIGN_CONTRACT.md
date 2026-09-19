# SEP-TV-001 — Spectator TV 2.0 FICS Design Contract

Status: implementation in progress  
Branch: `feature/spectator-tv-2-fics-design`  
Production: unchanged

## Approved product shape

Spectator TV 2.0 is a board-first broadcast surface:

- one large, stable chessboard on the left;
- one contextual workspace on the right;
- no third column;
- no live engine analysis;
- FICS is the only provider in this project;
- Lichess integration is a separate future project.

The right workspace has three permanent ownership regions:

1. `HEAD` — the three-step workflow: Server, Channels, Watch.
2. `BODY` — the only scroll owner; its content changes with the active step.
3. `FOOT` — connection state and contextual high-level actions.

## Primary flow

### 1. Server

- Present FICS as the selected and only available provider.
- Explain guest access briefly.
- `Connect & continue` calls the existing `CaissaFICSClient.connect('guest')` path.
- Do not expose a disabled or fake Lichess provider.

### 2. Channels

- Reuse the existing Spectator catalog and FICS active-table feed.
- Show Featured, Top Rated, Blitz, Bullet, and Rapid.
- Show the live games for the active channel in the same BODY.
- Refresh through the existing FICS lobby refresh owner.
- Selecting a game calls the existing observe/switch path.

### 3. Watch

- Preserve the board's position and size while the right BODY changes.
- Show players, clocks, live move list, opening/ECO when known, and game metadata.
- Style12 remains authoritative for position, clocks, side to move, and observed game identity.
- The selected game moves the workflow to Watch automatically.

## Ownership map

| Concern | Authoritative owner | Spectator TV 2.0 responsibility |
| --- | --- | --- |
| WebSocket and authentication | `CaissaFICSClient` | Call existing public methods only |
| FICS protocol parsing | existing FICS parsers | Consume normalized events |
| Live board position | Style12 + existing board instance | Present without move input |
| Game discovery | `CaissaSpectatorTVCatalog` | Filter and render channels |
| Spectator state machine | `CaissaSpectatorTV` | Reflect state in workspace |
| Board rendering | existing Chessboard instance | Resize, flip, theater/fullscreen controls |
| Engine analysis | none while live | Out of scope |

No new WebSocket, FICS parser, chess-state authority, or engine worker may be introduced by this redesign.

## Responsive contract

- Desktop: board left, workspace right; the board is the dominant region.
- Tablet/portrait: board first, workspace below.
- Compact landscape: board and workspace remain side by side when usable.
- The board never moves when switching Server, Channels, and Watch.
- Workspace BODY owns scrolling; HEAD and FOOT remain visible.
- No CSS zoom and no horizontal document overflow.

## Current implementation slice

- New board/workspace shell in the canonical page.
- Three accessible workflow tabs with keyboard navigation.
- FICS provider selection and guest-connect action.
- Channel/game browser moved into the workspace BODY.
- Watch details moved into the same BODY.
- Board controls for Flip, Theater, Fullscreen, and Refresh.
- Existing FICS, Style12, catalog, state, and board owners preserved.

## Release boundary

This branch is a design and integration preview. It must not be merged or deployed to production until desktop, tablet, mobile, live FICS observation, game switching, reconnect, and accessibility checks pass and Alexander approves the visual result.
