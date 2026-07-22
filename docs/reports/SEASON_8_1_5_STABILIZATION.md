# Season 8.1.5 Stabilization Evidence

## Board disappearance root cause

The board view was initialized once and remained mounted. The visible disappearance came from page presentation state: every binding operation set `page.operation`, which projected the page to `is-preparing`. CSS treated both empty and preparing states as reasons to show the opaque empty-board overlay. During restart and new-position operations that overlay covered a still-valid board until the operation settled.

The fix makes visibility depend on position ownership instead of the temporary operation label. The empty overlay is hidden whenever `controllerState.currentFen` exists, with an explicit `[hidden]` CSS rule that cannot be overridden by the overlay's base `display: grid`. Stockfish continues to use the existing operational overlay. No board node, Board View, Chessboard.js instance, binding, or Worker is recreated.

## Guided workspace

The active lesson moved from below the board into the Setup column. Once a lesson is active, the launcher and complete curriculum catalog are hidden and the column becomes a Lesson Companion containing title, objective, current step, instruction, principle, previous/next controls, restart, collapse, and return-to-setup. Desktop uses the existing three-column workspace. Laptop keeps companion and board side by side with Session below. Mobile retains board-first order and provides a collapsible companion.

## Start action

The disabled control remains present before a position exists. In `ready`, it becomes the full-width accent action `▶ Start Training`. During play it becomes the disabled, unambiguous `Training in progress` state.

## Role and reflection audit

The deterministic audit sampled 300 selected positions: 100 three-piece, 100 four-piece, and 100 five-piece positions. It included 67 template selections and 33 reflected templates. Every sample agreed on White beta ownership, side to move, strong/defending side, pawn ownership where applicable, lesson role, and theme validation. No verified generator defect was found, so generator and reflection rules were not changed. No artificial board-half restriction was introduced.

## Automated lifecycle evidence

A binding test performs 100 consecutive preparing-to-ready session transitions. It asserts one Board View initialization, one controller subscription, zero disposal calls, and the final expected FEN. Existing tests continue to cover restart, new-position races, coaching-only emissions, status-only emissions, and incremental move rendering.

The final regression completed 649/649 Node tests. The standalone quality run completed 100 starts, 100 new positions, and 100 restarts with one board initialization and zero disposals. The responsive shell now switches to its board-first flow at 900px, constrains the page and board workspace to the viewport, and preserves a fixed 48px mobile navigation target.

## Screenshots

- [Before: production baseline](season-8.1.5-before-production.png)
- [After: stabilized local workspace](season-8.1.5-after-local.png)
- [After: laptop viewport](season-8.1.5-after-laptop.png)
- [After: tablet viewport](season-8.1.5-after-tablet.png)
- [After: mobile viewport](season-8.1.5-after-mobile.png)

The baseline screenshots show the initial desktop state and the revised explicit Start label. Dynamic overlay stability is asserted through lifecycle instrumentation because a still image cannot demonstrate a transient disappearance.
