# CAISSA GIF Studio — Season 1.0 candidate

Status: **Development candidate; not yet browser-certified or approved for production**.

## Goal

Create original, downloadable animated chess GIFs entirely in the user's browser from a valid PGN. Inspiration: Chess.com GIF Maker workflow, but original CAISSA implementation and visual identity. No Chess.com assets or copied front-end code.

## Product footprint

- Proposed URL: `/gif-maker`, with canonical static document `gif-maker.html`.
- Part of Tools; global sidebar navigation will be integrated after isolated QA, because the existing CAISSA navigation inventory is release-governed and adding a primary item requires regenerating that contract.
- Preferred board-left / HEAD-BODY-FOOT right workspace, mobile board-first.
- PGN text or `.pgn` file import; sample Opera Game.
- Three board colors, two piece styles, white/black orientation.
- Replay: first, previous, play/pause, next, last, seek position.
- Frame range [start,end] in half-moves, delays and square GIF dimensions 384/512 pixels.
- `gif-encoder.js` emits valid GIF89a with loop extension, frame delays, RGB332 palette, LZW compression and GIF trailer.
- Pure client-side PGN handling, frame rendering and GIF generation, with no backend services or account requirement.

## Deliberately out of scope

- Direct Chess.com / Lichess / CAISSA game URL import and any HTTP proxy.
- Uploaded media, cloud storage, account settings, animated video exports, sharing URL.
- Chess engine analysis or editable board/Quiet Drag. The board is a read-only replay; no drag applies.
- Modifying `/online`, existing board, Clerk or Supabase services.

## Limitations and next step

- PGN max 256 KiB; maximum 180 half-moves, 181 GIF frames.
- GIF uses an 8-bit RGB332 palette. More advanced quantization / dithering is a possible later optimization.
- GIF creation may be slow for long games or older mobiles; run physical QA and measure before publishing.
- The page carries `noindex,nofollow` until production gate approval.

## Required gates

1. Unit tests: `node --test tests/gif-studio.test.js`.
2. Browser: `npx playwright test tests/browser/gif-studio.spec.js --project=chromium` (and WebKit / Firefox in full QA).
3. Validate real PGNs: ordinary, FEN setup, castling, en passant, promotions, annotations, checkmate, long-game rejection, invalid input.
4. Capture GIFs and inspect correct frame order, palette, delays and orientation in at least two independent decoders.
5. Responsive: 1600×1000, 1366×768, 885×611 and 390×844; ensure no board clipping or independent scroll leakage.
6. Test 512×512, 180 plies on low-end mobile for memory, pause/cancellation, file size and no main-thread lockup.
7. Confirm no regressions in existing routes, navigation, Clerk, Supabase, game boards.
8. Obtain explicit authorization before Preview / PR and again before merge or production rollout.

## Source layout

- `gif-maker.html`
- `css/gif-studio.css`
- `js/gif-studio/studio-page.js`
- `js/gif-studio/game-model.js`
- `js/gif-studio/gif-encoder.js`
- `tests/gif-studio.test.js`
- `tests/browser/gif-studio.spec.js`

## Ownership and license

Uses the pre-existing, same-origin chess.js ES module and the existing Wikipedia piece images in CAISSA. Check and retain all third-party asset license notices. New page layout, renderer and encoder are CAISSA-origin implementation.

## v1.1 — Human-test requested UX (2026-10-19)

Implemented on the **same isolated season branch** after the first Human Test:

- Import now accepts either PGN or six-field FEN. A valid FEN creates a zero-move timeline and opens Setup Position to record legal moves. A GIF requires at least one recorded half-move.
- A fourth **Setup Position** tab provides a free-placement draft, white/black piece palette, eraser, Move tool, side-to-move selection, castling rights, starting/empty and endgame presets, current FEN and a recordable SAN move list. The position is independently drafted until **Apply position & play moves**; rejected or malformed drafts never replace the loaded game.
- Both free editing and legal line recording support pointer capture, one-piece Quiet Drag, and tap-select/tap-destination fallback. Setup recording uses `chess.js`; it can branch from any earlier recorded move and supports promotion selection.
- The shared first/previous/play/next/last controls and position scrubber were moved from below the board into the **FOOT of the right workspace**, above status and Create GIF. The FOOT remains fixed within a bounded-height right panel while the BODY owns scrolling, independent of the four tabs.
- Custom positions and recorded lines are browser-local and are not sent to a server. No Stockfish analysis or automatic external URL imports are in scope.

**Quality gates:** Node unit tests, Chromium desktop/mobile UI geometry (including FOOT coordinates across tabs), editable-piece and legal-recording smoke tests, GIF89a decode. Production merge remains blocked pending real chess.js integrated Playwright tests and user physical approval. Browser smoke performed against a local test double must not be represented as a real chess.js certification.
