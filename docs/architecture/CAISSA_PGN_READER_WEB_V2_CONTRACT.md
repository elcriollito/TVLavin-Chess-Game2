# CAISSA PGN Reader Web — Mirror V2 Contract

Status: protected product contract
Route: `/pgn-replayer`
Canonical URL: `https://www.caissa-chess.org/pgn-replayer`
Visual authority: the CAISSA desktop Reader reference approved by Alexander
Last reconstructed: 2026-09-05

## Purpose

This document protects the approved CAISSA PGN Reader Web V2 experience. Future work may extend access, content, and Premium entitlements, but it must not silently replace, dismantle, or deform the Reader.

Any change that conflicts with this contract requires a new explicit visual approval from Alexander. A successful build or automated test is not visual approval.

## Permanent layout

The web sidebar remains present. Inside the Reader workspace:

1. The header is compact.
2. The board, player labels, and replay controls occupy the left column on desktop.
3. The information panel occupies the right column and stretches to the same functional height as the board area.
4. Small screens stack the board before the panel without horizontal page overflow.
5. Large album, game, notation, and analysis contents scroll inside the right panel. They must not lengthen the entire page indefinitely or escape behind another section.
6. The board remains fully visible with eight ranks and eight files at every supported size.

The desktop tab order is permanent:

1. Albums
2. Games
3. Notation
4. Analysis

Albums is the initial tab. Each tab has a real icon and a real panel. Analysis is not embedded inside Notation.

## Permanent controls

Only controls with implemented behavior may be visible. Empty rectangles, placeholders, and decorative buttons are forbidden.

The approved control set is:

- Open PGN menu
  - Open file
  - Paste PGN
- English/Spanish language toggle
- Options
- First position
- Previous move
- Play/pause
- Next move
- Last position
- Speed
- Flip board, represented by the understandable `⇅` glyph
- Focus/Zoom
- Next game
- Share
  - Copy game PGN
  - Copy position FEN
- Engine
- Save PGN
- Export Diagram
- Share Diagram

Forbidden regressions:

- Do not add `Close game`.
- Do not add `Change PGN`.
- Do not restore `Export current game`; `Save PGN` is the official PGN download action.
- Do not duplicate the engine panel for desktop and mobile.
- Do not place Stockfish inside Notation.
- Do not create a button whose action is unavailable.

Page Up, Page Down, and Next game use bounded collection navigation. They do not wrap from the last game to the first or from the first game to the last.

## Albums and collections

The Reader preserves these five families:

| Family | Approved catalog count |
|---|---:|
| Players | 82 |
| World Championships | 60 UI entries: 59 historical plus the special collection |
| Candidates & World Cups | 58 |
| Tournaments | 11 |
| Openings | 233 |

Collection family navigation remains horizontally usable, and the selected family is visibly identified. Search stays within its family. Long result lists use the panel's internal scrollbar.

Player distinction icons remain meaningful:

- King: Open World Champion
- Queen: Women’s World Champion
- Rook: World Championship match or final challenger
- Knight: other featured player collection

José Raúl Capablanca remains represented by the protected free player album contract unless Alexander explicitly replaces that source.

## PGN privacy and local behavior

Local PGN files and pasted PGN text are processed on the device.

- Do not send PGN text, FEN, comments, variations, player names, or private filenames to analytics.
- Do not log private PGN contents.
- Do not persist private PGN text in localStorage, sessionStorage, cookies, or remote storage.
- Local preferences such as language, orientation, speed, and welcome state may be stored.
- Clipboard actions occur only after a direct user action.
- Drag-and-drop remains a local import path and uses the same size and type validation as the file picker.

The parser and Worker safety limits remain explicit. Any increase must be tested against memory and responsiveness, especially the largest archived collections.

## Analysis engine integrity

Stockfish remains local, lazy, single-threaded, and off by default.

- Turning Engine on automatically selects Analysis.
- Analysis displays exactly two MultiPV lines.
- Turning Engine off releases the Worker.
- Engine state is not silently persisted as on.
- The engine JavaScript, WASM, board adapter, and PGN Worker are protected dependencies and must not be edited as part of visual, Premium, or navigation work.

Pinned Stockfish assets:

| Asset | SHA-256 |
|---|---|
| `stockfish-18-lite-single.js` | `2278005057f381491f1c9bb3e44c9f5920b3a00bef9759e33cc6582769a1f1fe` |
| `stockfish-18-lite-single.wasm` | `a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1` |

Changing either hash requires a separate engine upgrade plan, license check, and functional approval.

## Export Diagram contract

Export Diagram and Share Diagram create a square PNG from the exact current board position.

- Output size: 1200 × 1200 pixels.
- Position source: current FEN.
- Orientation source: current board orientation.
- Caption source: FEN side-to-move field.
- Spanish captions:
  - `Juegan blancas y ganan`
  - `Juegan negras y ganan`
- English captions:
  - `White to move and win`
  - `Black to move and win`
- Unsupported interface locales fall back to English.
- The image contains the watermark `www.caissa-chess.org`.
- Share Diagram uses the browser's file-sharing API when available and safely downloads the PNG when it is not.

Diagram generation must not request a server-rendered image or transmit the position.

## Language behavior

The Reader supports English and Spanish for its principal V2 controls. The diagram caption follows the selected Reader language. If locale detection or translation support is unavailable, English is the safe fallback.

Language changes must not reload or discard the current game, move, orientation, analysis state, or selected collection.

## Options behavior

Options is a functional dialog, not a decorative menu.

- Its close controls remain keyboard-accessible.
- It explains what the visible Reader buttons do.
- It contains Save PGN, Export Diagram, and Share Diagram.
- Game-dependent actions stay disabled until a game exists.
- It documents the free library and future Premium boundary honestly.

## Premium integration boundary

Premium may gate protected content or new services. Premium must not gate or alter the stable Reader shell.

Premium is allowed to control:

- access to a protected album or study pack;
- server analysis or other new server-backed services;
- future CAISSA-created learning products;
- entitlement badges and honest locked-state explanations.

Premium is not allowed to:

- remove, resize, move, cover, or replace the chessboard;
- reorder or remove Albums, Games, Notation, or Analysis;
- remove Open PGN, local replay, Save PGN, Flip, or navigation controls;
- replace a working control with an empty or misleading button;
- automatically enable or remotely execute Stockfish;
- send local PGN contents to a server;
- change the Reader route to the classic Game Replayer;
- edit Play Coach, Play, Bots, Games, authentication, navigation, or backend code as a side effect.

Entitlement checks must be additive. The stable UI renders first; a locked content card may then explain the entitlement. A failed entitlement request must fail closed for the protected content while leaving the Reader operational.

## Route and product separation

`/pgn-replayer` is the CAISSA PGN Reader. `/watch/game-replayer` remains the separate classic Game Replayer.

Reader work must not modify Play Coach v3.1, Play, Bots, Games, shared authentication, or unrelated navigation behavior. If a shared-shell change is unavoidable, it requires regression tests for every affected route and separate approval.

## Protected implementation surfaces

Normal Reader V2 changes should be confined to:

- `pgn-replayer.html`
- `css/pgn-replayer.css`
- `js/pgn-replayer/pgn-replayer-page.js`
- Reader-specific tests
- this contract

The following files are protected from routine Reader UI changes:

- `js/pgn-replayer/pgn-board.js`
- `js/pgn-replayer/pgn-engine.js`
- `js/pgn-replayer/pgn-worker.js`
- `assets/vendor/stockfish/18.0.0/*`
- Play Coach, Play, Bots, Games, authentication, navigation, and backend implementation files

## Required verification before deployment

At minimum:

1. Run `npm run lint:pgn-replayer` or its exact local commands.
2. Run `node --test tests/pgn-replayer/*.test.js`.
3. Run the relevant navigation, authentication, and route contract tests.
4. Run `git diff --check`.
5. Verify protected engine and Stockfish hashes against the approved baseline.
6. Inspect `git diff --name-only` and reject unrelated files.
7. Run browser verification when browser binaries are available.
8. Manually inspect desktop and mobile layouts.
9. Obtain Alexander's visual approval.

Automated tests may certify logic and contracts. They do not certify visual parity by themselves.

## Deployment rules

- Preview deployments require explicit authorization.
- Production deployment requires separate explicit authorization.
- Never use `--prod` for a preview.
- Never promote or alias a preview to production implicitly.
- Never create a commit or push without separate authorization.
- A Vercel deployment is a build snapshot, not a substitute for a Git commit or a durable local backup.
- After production approval, the exact approved source must also be committed and pushed through the authorized Git workflow so a later Git-based deployment cannot restore an older Reader.

## Change-review checklist

Reject a proposed change if any answer below is “no”:

- Does the board remain intact and board-first?
- Are the four tabs still Albums, Games, Notation, Analysis in that order?
- Is Albums still the initial tab?
- Do long collections stay inside an internal scrollbar?
- Does every visible button perform a real action?
- Is Save PGN the only PGN download action?
- Are Export Diagram and Share Diagram still localized and local-only?
- Is the engine still off by default with two lines in Analysis?
- Are local PGNs still private?
- Are Play Coach and unrelated products untouched?
- Do the Reader tests pass?
- Has visual approval been obtained for a visual change?

This contract is the recovery guardrail for CAISSA PGN Reader Web Mirror V2.
