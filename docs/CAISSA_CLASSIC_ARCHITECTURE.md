# CAISSA Classic Architecture

Version: 1.0.3 Stable  
Production: https://www.caissa-chess.org  
Status: Stable  
PVS: PASS

## Philosophy

CAISSA Classic is not a separate chess client. It is a retro desktop-style UI experience built on top of the shared CAISSA Core.

The project follows a "one Core, multiple experiences" model. Modern FICS, CAISSA Classic, Spectator TV, and related surfaces reuse the same connection, parsing, state, board, PGN, and replay foundations wherever practical.

Stability comes before features. Classic can look and feel like a late-1990s chess lounge, but it must remain a thin UI shell over the existing production systems.

## Shared Architecture

```text
                         +----------------------+
                         |      CAISSA Core     |
                         +----------+-----------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
+-------v--------+        +---------v----------+       +--------v--------+
|    Gateway     |        |    State Model     |       |   PGN/Replay    |
+-------+--------+        +---------+----------+       +--------+--------+
        |                           |                           |
+-------v--------+        +---------v----------+                |
|  FICS Client   +-------->      Style12       |                |
| CaissaFICSClient|       |      Parser        |                |
+-------+--------+        +---------+----------+                |
        |                           |                           |
        +---------------------------+---------------------------+
                                    |
        +---------------------------+---------------------------+
        |                           |                           |
+-------v--------+        +---------v----------+       +--------v--------+
|   Modern UI    |        |    Classic UI      |       |  Spectator TV   |
|  FICS Section  |        | CAISSA Classic     |       |                 |
+----------------+        +--------------------+       +-----------------+
```

## Key Files

- `index.html`: owns the CAISSA Classic markup, including the retro lobby, room shells, login panel, create table form, game table, board container, player strips, move list, table information, and status surfaces.
- `css/yahoo-classic.css`: contains the isolated CAISSA Classic visual system. It defines the Win98/Yahoo-era layout, bevels, compact table styles, room shells, Classic game table, board framing, player cards, move list, responsive behavior, and status bar treatment.
- `js/yahoo-classic-section.js`: owns the CAISSA Classic view controller. It listens to existing CAISSA/FICS events, renders lobby tables and room shells, opens the Classic table view, delegates login, move dispatch, create table, sound cues, and result display through existing Core pathways.

## Reused Systems

CAISSA Classic reuses:

- Gateway
- `CaissaFICSClient`
- Existing FICS connection path
- Style12 parser
- State Model
- Existing board integration
- PGN helpers
- Replay helpers
- Spectator TV catalog/state helpers where applicable

Classic must not duplicate these systems. If a future feature needs data or behavior that already exists in Core, the Core path is the default integration point.

## Login Flow

Guest Login stays inside CAISSA Classic. It calls the existing:

```text
CaissaFICSClient.connect('guest')
```

FICS Account Login also stays inside CAISSA Classic. The Classic login panel exposes an in-place account form. Submitting that form forwards credentials into the existing FICS client account path and calls:

```text
CaissaFICSClient.connect('account')
```

Classic does not navigate to the modern FICS section for login. It does not create a duplicate login service, authentication service, WebSocket, or protocol path.

## Lobby Flow

CAISSA Classic receives live room tables through the existing FICS/Core lobby state. Active tables, sought games, player names, ratings, observer counts, and table actions are rendered from existing state owned by `CaissaFICSClient`.

Classic does not create its own polling, WebSocket, backend, or FICS protocol parser. Players and active tables come from existing state.

## Game Window Flow

The Classic game window renders:

- Board
- Player cards
- Clocks
- Move list
- Table information
- Table log
- Status strip

Movement is enabled only through the existing Core/FICS move dispatch. Classic delegates board interaction to the existing FICS client movement gates and move submission path. Spectators cannot move. Seated players can move through the existing `sendMove` path.

Classic does not create a second board engine or independent game model.

## Create Table Flow

Classic sends a sanitized FICS seek command through the existing send path:

```text
seek <minutes> <increment> <rated|unrated> [white|black]
```

Inputs are bounded and sanitized before dispatch. The UI shows a pending posted seek status while waiting for FICS lobby confirmation.

Classic does not create fake table data. If FICS returns the seek or table through existing lobby data, Classic renders it through the normal lobby flow.

## Sounds

Classic sounds use tiny retro Web Audio cues. There are no audio files, external sound libraries, or autoplay loops.

Sounds are gated behind explicit user interaction and the Classic sound toggle. If Web Audio is unavailable or blocked by the browser, sound cues fail gracefully without breaking the page or logging noisy errors.

## Room Shells

CAISSA Classic includes these rooms:

- CAISSA Lobby
- Tournament Hall
- Computer Hall
- Teaching & Training Hall

CAISSA Lobby is the live FICS room. Tournament Hall, Computer Hall, and Teaching & Training Hall are production-safe shells only.

They must not show fake pairings, fake standings, fake bot games, fake lessons, fake coaches, or fake backend state. If live data is unavailable, they show clear empty states and future-support copy.

## Release History

- 1.0.0 Classic Release: CAISSA Classic Release Candidate matured into the stable retro lobby and table experience.
- 1.0.1 Login/Layout Hotfix: restored Classic FICS login routing and improved viewport fit.
- 1.0.2 Embedded Classic Login + Viewport Hotfix: kept Guest and Account login inside Classic and made the bottom status bar flush with the viewport.
- 1.0.3 Board Playability + Result Status Hotfix: fixed board obstruction, delegated seated movement through the existing FICS/Core move path, added pending seek visibility, and surfaced real game-ended results.

## Forbidden Architecture Changes

- No duplicate Gateway
- No duplicate WebSocket
- No duplicate FICS protocol
- No duplicate Style12 parser
- No duplicate board engine
- No duplicate PGN
- No duplicate Replay
- No duplicate State Model
- No fake backend data

## Development Rules

- Use atomic commits.
- Keep production always deployable.
- Run PVS for release or FICS-facing changes.
- Run smoke tests for Classic routes and affected flows.
- Reuse Core first.
- Prioritize stability before features.
- Do not add new modules unless explicitly approved.

## Future Version Policy

- 1.0.x: bug fixes and maintenance only.
- 1.1: small UX improvements that preserve the current architecture.
- 2.0: reserved for major intentional evolution with explicit architecture approval.
