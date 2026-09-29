# CAISSA Quiet Drag Standard

## Status

This document is the canonical interaction standard for dragging pieces on CAISSA chessboards. **CAISSA Quiet Drag is the default interaction model for every new interactive chessboard.** Existing boards should adopt it through a shared layer or a thin adapter when they are changed substantially.

The intended experience is direct, light, natural, and visually silent:

> pick → move → drop → done

The interaction must not feel like:

> lift → float → animate → snap → settle

## 1. Purpose

Quiet Drag keeps the player's attention on the move, not on the interface. A dragged piece should feel attached to the pointer from the instant it is selected until the instant it is dropped or cancelled. Presentation effects must never add perceived weight, latency, or ambiguity.

This standard covers input handling, drag rendering, visual presentation, state boundaries, compatibility, performance, and acceptance criteria. Chess rules and product-specific behavior remain the responsibility of the board integration.

## 2. Canonical Drag Pipeline

### Pointer down

1. Receive `pointerdown` on the piece.
2. Capture that pointer so the drag remains continuous outside the piece or board.
3. Cache all geometry required for the drag.
4. Calculate and retain the exact grab offset between the pointer and the piece origin.
5. Enter a single-piece drag presentation immediately.

### Pointer move

1. Receive `pointermove` events.
2. Store only the latest pointer coordinates; use coalesced event data when it is available and useful.
3. Schedule at most one `requestAnimationFrame` callback.
4. In that callback, perform one visual write using `transform: translate3d(x, y, 0)` while preserving the original grab offset.

`pointermove` must not continuously update `left` or `top`, query layout, redraw the board, or mutate game state.

### Pointer up or cancellation

1. Receive `pointerup` or `pointercancel` and release pointer capture.
2. Resolve the destination using cached geometry or one deliberate terminal read when required.
3. Apply or reject the move through the board's existing chess logic.
4. Complete the drop immediately and restore the normal piece presentation.
5. Remove temporary state and listeners, including any pending animation-frame work.

## 3. Implementation Requirements

A conforming implementation must:

- use Pointer Events as its primary input model;
- use pointer capture for an active drag;
- render movement through `requestAnimationFrame`;
- perform no more than one drag-position visual write per display frame;
- position the moving piece with `transform: translate3d(...)`, not repeated `left` and `top` writes;
- cache board, square, piece, and grab-offset geometry at drag start;
- avoid `getBoundingClientRect()`, `offset()`, computed-style reads, and equivalent geometry reads during active movement;
- preserve the exact point at which the user grabbed the piece;
- show exactly one visible representation of the dragged piece;
- attach and remove temporary listeners symmetrically, with no accumulation across board recreation or mode changes;
- avoid React, DOM, or application-state updates during pointer movement; and
- invoke gameplay, validation, and state transitions only when resolving the drop.

Fallback input support may be provided where a supported browser requires it, but it must preserve the same scheduling, presentation, cleanup, and performance guarantees.

## 4. Quiet Presentation

During drag, the moving piece must use a neutral presentation:

```css
transform: translate3d(var(--drag-x), var(--drag-y), 0) scale(1);
opacity: 1;
filter: none;
box-shadow: none;
text-shadow: none;
animation: none;
transition: none;
```

Equivalent implementation details are acceptable, but the visible result is mandatory:

- no scale change;
- no opacity change;
- no filter, glow, box shadow, drop shadow, or text shadow;
- no lift, spring, bounce, overshoot, or other drag animation;
- no transition or easing on movement or release; and
- no second piece, clone, ghost, or residual image in the source square.

The source square must look empty while the piece is in motion. A pre-existing, subtle square highlight may remain if it communicates selection or move context, but it must not resemble the piece, create an aggressive glow, or compete with the moving piece.

## 5. Drop Behavior

The dropped piece must appear in its resolved destination in the same natural frame or the immediately following frame. The handoff from transient drag rendering to canonical board rendering must be visually continuous.

Do not add settle animations, snapping animations, easing, recentering, bounce, or overshoot. A rejected move or cancellation must restore the piece just as promptly and without decorative motion.

## 6. Separation from Game State

Pointer movement is a rendering concern, not a game-state event. While a drag is active, `pointermove` must not perform:

- networking or protocol work;
- engine commands or evaluation updates;
- chess-clock work;
- application or game-state mutations;
- FEN or PGN generation or parsing;
- board redraws or position reconciliation;
- move submission; or
- complex legality validation.

The movement loop may update only transient drag coordinates and the visual transform. Product-specific gameplay begins when the drop is resolved. This boundary applies equally to local play, bot play, Coach, FICS, analysis tools, and future modes.

## 7. Compatibility Contract

Adopting Quiet Drag must preserve all applicable board behavior:

- legal-move enforcement;
- promotion flows;
- captures;
- castling;
- en passant;
- board orientation and flipping;
- click-to-move interaction;
- read-only and observation modes;
- mouse, pen, and touch input;
- Coach annotations, highlights, feedback, and turn control;
- engine evaluation and bot operation; and
- last-move and related highlights after the drop.

Quiet Drag changes how an active drag is presented and scheduled. It must not redefine chess rules, move ownership, networking, engines, clocks, reconciliation, or persisted game state.

## 8. Performance Contract

During an active drag:

| Measure | Requirement |
| --- | --- |
| Visual position writes | Less than or equal to display frames; maximum one per animation frame |
| Geometry reads after drag start | Approximately zero; none in the movement hot path |
| Forced layout inside `pointermove` | Zero |
| Long tasks attributable to dragging | Zero |

Every new implementation and material migration should include a repeatable before/after benchmark on the same board, browser, viewport, input path, and representative movement. Record at least:

- pointer event count;
- visual write count;
- geometry-read count;
- forced layouts;
- movement-handler CPU time;
- frame interval p50 and p95;
- long tasks; and
- temporal cursor-to-piece lag where measurement tooling permits it.

Measurements support, but do not replace, human verification. A drag can report a small final cursor distance and still feel heavy because of inconsistent frames or temporal lag.

## 9. Design History

This standard emerged from drag-responsiveness work across CAISSA Play, Play Bots, Play Coach, and FICS. Investigation showed that the perceived weight was not confined to one product mode: the shared legacy drag path coupled high-frequency input to legacy positioning and presentation behavior.

Instrumented comparisons and direct human evaluation favored a shared Pointer Events, animation-frame, and transform pipeline. Further review established the single-visible-piece and quiet-presentation rules: responsive movement alone was insufficient while a source ghost, shadow, lift effect, or animated drop remained visible. The resulting interaction was also compared by feel with contemporary chess experiences, without making any external product an implementation dependency.

## 10. Legacy Adoption Strategy

Existing surfaces may use different board wrappers or legacy libraries. Migrate them through the shared Quiet Drag implementation wherever possible; otherwise use a thin adapter that preserves the contract in this document.

Known adapter candidates include:

- FICS Play;
- Arena;
- Yahoo Classic;
- Opening Database; and
- Position Forge.

Do not modify minified third-party vendor files as the primary adoption strategy. Keep vendor code replaceable and isolate CAISSA behavior in owned, testable source. A legacy board may retain its gameplay callbacks while delegating active-drag input and rendering to the common layer.

## 11. Future Project Requirement

For all future CAISSA work:

1. Quiet Drag is the default for every new interactive chessboard.
2. Implementations must reuse the common Quiet Drag layer or its approved successor.
3. Projects must not create independent, page-specific drag systems.
4. A legacy drag implementation may be used only when the exception and technical reason are documented.
5. Quiet Drag QA and the performance contract must be included in the feature's Definition of Done.

Any exception must identify its owner, affected surface, user impact, reason the common layer cannot be used, validation plan, and intended removal or review point.

## 12. Definition of Done

An interactive chessboard is not Quiet Drag complete until all applicable items pass:

- [ ] The piece stays visually attached to the pointer during fast and slow movement.
- [ ] The exact grab offset is preserved; the piece does not jump to its center.
- [ ] Exactly one representation of the dragged piece is visible.
- [ ] The source square is visually clean, apart from an approved subtle square highlight.
- [ ] The dragged piece has no shadow, glow, or residual filter.
- [ ] The dragged piece remains at scale `1` and opacity `1`.
- [ ] Movement and release have no transition, easing, settle, snap, bounce, or overshoot.
- [ ] Drop and cancel resolve immediately and restore the normal presentation.
- [ ] Pointer capture and all temporary listeners are released with no leaks across repeated use or board recreation.
- [ ] Pointer movement causes no game, network, engine, notation, reconciliation, or framework-state updates.
- [ ] Legal moves, special moves, orientation, click-to-move, read-only behavior, touch, Coach features, engines, and post-drop highlights remain correct where applicable.
- [ ] The performance contract passes under a repeatable drag benchmark.
- [ ] Human visual verification confirms the interaction feels direct, light, natural, and visually silent.
