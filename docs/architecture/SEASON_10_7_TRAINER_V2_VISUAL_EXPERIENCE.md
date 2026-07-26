# Season 10.7 — Endgame Trainer V2 Visual Experience

Status: implemented visual contract
Scope: the query-flagged Endgame Trainer V2 and hidden multi-move pilot only
Authorized baseline: `1baac8262f89bc98055afc20c7ac446287895ea1`

## Outcome

Season 10.7 makes the board the primary visual element without changing chess,
evaluation, content, scoring, persistence, or routing contracts. The persistent
CAISSA sidebar remains in the desktop shell. V1 and Guided Study retain their
existing presentation and precedence.

## Layout contract

The V2 shell uses one semantic DOM and CSS grid areas. At wide desktop sizes the
board occupies three fifths of the working columns and a compact session panel
occupies two fifths. Their first content rows align vertically. At 1050 CSS pixels
and below, including tablet widths and 200% zoom, the same content stacks in this
order:

1. compact mode and status header;
2. session metrics;
3. current objective;
4. board;
5. truthful feedback;
6. primary and secondary actions;
7. completion summary;
8. local-practice disclosure.

This keeps DOM ownership, board focus, and live regions stable across breakpoints.
No JavaScript moves elements in response to viewport changes.

## Interaction hierarchy

Each state exposes at most one visually primary action: Start Challenge, Continue,
or Retry. Hint, Reveal answer, Skip, Exit challenge, and Modes remain secondary.
Feedback declares a neutral, success, instructional, or technical presentation
tone without changing evaluator meaning. Technical failures remain neutral to
learner results.

The Modes dialog lists only destinations already authorized and available:
Quick Challenge, Knowledge Practice, and Custom Lab. It does not present future
modes as disabled product promises. Under the explicit `multiMovePilot=1` flag,
the pilot identifies itself as the current hidden mode and reuses the accessible
dialog, Escape behavior, and focus return.

## Preserved boundaries

- V2 remains opt-in through `trainerV2=1`.
- Guided Study query parameters take precedence.
- Quick Challenge still loads immutable pool `1.1.0` and runs five positions.
- The multi-move pilot remains hidden and exact-tree only.
- Exactly one Board API instance is created per mounted V2 experience.
- No engine Worker, live tablebase request, runtime Stockfish, cloud write,
  Knowledge write, Training Memory write, Mastery write, recommendation write,
  Personal Best, leaderboard, or new scoring policy is introduced.
- Session schema `2.0.0`, pool artifacts, fingerprints, digests, signatures, and
  protected release paths are unchanged.

## Responsive and accessibility verification

The required matrix is 320×568, 375×667, 390×844, 768×1024, 820×1180,
1024×768, 1280×720, 1440×900, and 1920×1080. Automated checks cover horizontal
overflow, mobile semantic order, desktop board proportion, action hierarchy,
44-pixel controls, keyboard board use, dialog Escape/focus return, reduced motion,
200% zoom, Axe analysis, one-board reuse, and zero engine Workers.

Stable screenshots are test evidence only and are excluded from the public release.
