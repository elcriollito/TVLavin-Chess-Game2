# CAISSA Quiet Drag Phase 2C — Arena Setup on current main

Date: 2026-10-03

## Port basis

- Approved source commit: `c9dfddfce03fad762b66dc533ae58c54e6ee707c`.
- Approved source parent: `a041c18afe1386f64110ea33c664ace75f2ac701`.
- Current-main port base: `27ee8c5971df81a1ffcee9a3f73b5c4f896f4915`.
- Merge base between the old parent and current main: `7df8c8dcbb3b39f7cbca7ee1436b31837dbbc4bb`.
- Divergence at port start: the old parent had 8 unique commits and current main had 517 unique commits.

The old Arena therefore predates the current Match Lab, SF18/SF19 provider work,
opening/ECO controls, PGN history/export, current responsive shell, and navigation
cleanup. This port does not merge or replace that old tree. It carries only the
approved shared-adapter capabilities and Arena Setup integration into current main.

## Ownership and isolation

- The main Arena board remains a separate read-only Chessboard.js instance with
  `draggable: false`.
- Quiet Drag is created only for `#arenaSetupBoard` while Manual Setup is open.
- Chessboard.js placement data remains the editor placement owner.
- `setupDraftFen` is an editor-only mirror; pointer movement never updates it.
- A completed drop uses the existing arbitrary editor semantics: move any white or
  black piece, replace an occupied destination, and reject off-board drops.
- Palette add/replace, Erase, Clear, Initial Position, side-to-move, castling,
  accessible click-click relocation, and keyboard operation retain their current-main
  paths.
- Only explicit Apply validates and transfers the position to Arena game state.
  Cancel/close leaves the live board unchanged.

## Shared implementation

The port reuses `CaissaLegacyQuietDragAdapter` and `CaissaPointerController`. The
adapter now accepts a surface-specific local QA query and labels, passes piece
identity and drag-end metadata to the integration, and retains the existing FICS and
Yahoo defaults. The controller treats the dispatched Pointer Event as the latest
coordinate because WebKit can expose a trailing coalesced sample.

The movement path preserves pointer capture and grab offset, schedules at most one
`requestAnimationFrame` write, uses `translate3d`, moves exactly one original piece
node, and performs no editor/FEN/game mutation before drop.

## Lifecycle

Opening Setup creates a fresh board and asynchronously attaches one adapter. A
lifecycle token prevents a late import from attaching after close. Close, Apply, or
Arena exit destroys the adapter and board, cancels pending frame work, removes the
five pointer listeners, clears editor-only draft state, and releases references.

The local-only URL
`/arena?setup-quiet-drag-lab=1` auto-opens Manual Setup and presents
`Legacy Drag | Quiet Drag`. Non-loopback hosts cannot activate this lab.

## Preserved current-main scope

No Match, Tournament, Game, Advanced Match Options, engine catalog/provider,
SF18/SF19, Opening mode/ECO, Flip Board, Save PGN, Swap Colors, move delay, Set
Position, layout, or navigation code was replaced by the old Arena tree. The
interactive board change is scoped to Manual Setup.

## Verification matrix

- Static contracts and syntax.
- Existing Arena setup cleanup and modern Arena redesign suites.
- Chromium and WebKit focal Setup interaction coverage.
- White and black arbitrary relocation, replacement, erasure, Clear, Initial
  Position, side-to-move, castling, cancel isolation, reopen, and Apply.
- Ten close/reopen lifecycle cycles.
- Desktop viewports 1920×1080, 1440×900, 1366×768, and 1024×768.
- Chromium Legacy/Quiet movement probe for geometry reads, legacy left/top writes,
  jQuery animation calls, rAF writes, and pending-frame cleanup.
- Visual smoke of the modern Arena UI and current global navigation.

Automated results on the current-main worktree:

- 188/188 Arena unit and contract tests passed.
- 14/14 focal Setup tests passed across Chromium and WebKit.
- 37/37 current Arena Match Lab, redesign, stability, and setup tests passed in Chromium.
- 49/49 focused Opening/ECO, Save PGN/history, time-control, Stockfish 18, and
  Stockfish 19 browser tests passed in Chromium.
- The Chromium A/B probe recorded 24 pointer events in each mode. Legacy produced
  24 `left/top` writes and one jQuery animation; Quiet produced 24 visual writes in
  24 requested frames, with zero movement geometry reads, zero `left/top` writes,
  zero jQuery animations, and no pending frame after drop.

The approved source result already carries human feel approval. This current-main
port retains the same local A/B lab so QA can compare it inside the modern shell.
