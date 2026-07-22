# CAISSA Board Interaction API v1.0

## Purpose

`js/caissa-board-interaction.js` is the page-agnostic input coordinator for CAISSA chessboards. It translates tap, keyboard, and drag intentions into one immutable move callback. It does not create DOM, render pieces, own chess state, start engines, or know lessons and sessions.

> Future CAISSA modules must consume the shared controller rather than implement independent touch/drag interaction.

## Stable public exports

- `CAISSA_BOARD_INTERACTION_API_VERSION`: exact contract version, currently `1.0`.
- `CaissaBoardInteraction`: construct with `{ rules, boardView, onMove?, promotionResolver? }`.
- `CaissaBoardInteractionError`: structured error with a stable `code` property.

The controller is ready after construction. Its supported public methods are:

- `setRules(rules)`: replace the authoritative rules snapshot and invalidate pending ownership.
- `invalidate()`: invalidate an outstanding async action.
- `isPending()`: report whether a move or promotion decision is pending.
- `legalMoves(square)`: return normalized legal destinations.
- `canStart(square, piece?)`: check whether a piece may begin an interaction.
- `select(square)`: select a movable piece and publish legal highlights through the view port.
- `activate(square)`: tap/keyboard selection or destination activation.
- `beginDrop(from, to)`: synchronous drag/drop decision for board-library callbacks; submission continues asynchronously.
- `drop(from, to)`: async-compatible alias.
- `submit(move)`: validate promotion and submit one immutable move intent.
- `dispose()`: idempotently invalidate work and release rules/view references.

Internal ownership tokens, promotion detection, piece lookup, and color conversion are not public API.

## Required ports and callbacks

`rules` must provide `sideToMove()`, `pieces()`, and `legalMoves({ square, verbose: true })`.

`boardView` must provide `canInteract()`, `getState()`, `setSelectedSquare()`, `setPendingVisualMove()`, `setSubmitting()`, `rollbackPendingVisualMove()`, and `reportError()`.

`onMove(intent)` receives a frozen `{ from, to, promotion, lan }` value and returns a boolean or promise. `promotionResolver(context)` returns `q`, `r`, `b`, `n`, or a promise of one of those values.

## Input modes

Capability detection belongs to the integrating Board View. The Endgame implementation uses `navigator.maxTouchPoints` and `(any-pointer: coarse)`, with an injectable detector for tests or future accessibility settings.

- Touch: tap-to-move; native piece drag disabled; legal selection highlighting enabled; vertical scrolling and pinch zoom allowed.
- Desktop: click-to-move and drag-to-move are both supported.

## Lifecycle

- Construct one interaction controller per mounted board.
- Board View initialization is idempotent and binds listeners once.
- Updates replace rules without remounting.
- `dispose()` is idempotent, invalidates async ownership, and clears references.
- A disposed Board View may be initialized again cleanly; it creates a fresh controller and listener set.
- A disposed `CaissaBoardInteraction` is terminal. Create a new instance for a new mount.

## Rendering guarantees

- Normal accepted moves use one incremental visual update.
- Auxiliary state changes cause zero piece renders.
- Undo, restart, and new position may use full reconciliation.
- Promotion, en passant, and castling use one exact position-difference reconciliation.
- No move replaces or remounts the board container.
- The shared controller never owns engine, lesson, timer, status-card, or session state.

## Integration example

```js
import { CaissaBoardInteraction } from '/js/caissa-board-interaction.js';

const interaction = new CaissaBoardInteraction({
  rules,
  boardView,
  onMove: intent => gameController.playMove(intent),
  promotionResolver: context => promotionDialog.choose(context)
});

// Tap or keyboard:
await interaction.activate('e2');
await interaction.activate('e4');

// Chessboard.js drop callback:
const result = interaction.beginDrop('e2', 'e4') ? undefined : 'snapback';
```

Do not let consumers mutate rules through this controller, attach global DOM listeners, submit engine commands, or infer session state from selection state.

## Endgame compatibility adapter

`js/endgame-trainer/endgame-board-interaction.js` re-exports the shared API and preserves `EndgameBoardInteraction` and `EndgameBoardInteractionError` aliases. Those aliases are adapter compatibility surface, not new shared names.

## Compatibility policy

- Internal helpers may change.
- Public behavior and exports remain backward-compatible throughout v1.x.
- Breaking public changes require a major-version review.
- The Endgame adapter remains supported until a planned migration removes it.

## Product-owner smoke checklist

### iPhone and iPad Safari

- Scroll vertically starting over and around the board.
- Tap a piece, confirm its legal destinations, then tap a destination.
- Confirm pieces cannot be dragged.
- Confirm pinch zoom is not trapped.
- Confirm scrolling does not submit an accidental move.

### Android Chrome

- Repeat the five touch checks above.

### Desktop Chrome, Edge, Firefox, and Safari

- Confirm click-to-move and drag-to-move both work.
- Confirm user and engine moves have no redraw hiccup or piece flash.
- Restart and request a new position, then confirm one move produces one submission.
- Confirm undo and orientation changes preserve the exact board.

Physical iOS, iPadOS, Android, and Safari testing is a release limitation and must not be reported as automated coverage.
