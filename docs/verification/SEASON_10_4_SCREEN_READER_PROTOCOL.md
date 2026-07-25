# Season 10.4 Screen Reader Protocol

Status: protocol complete; human assistive-technology execution unavailable in this environment.

## Environments

Run NVDA with Firefox, NVDA with Chromium or Edge, Narrator with Edge, and VoiceOver with Safari where the operating system and a human operator are available. Record screen-reader/browser/OS versions.

## Test script

1. Open `/endgame-trainer?trainerV2=1`; identify the document title, main region, heading, and board.
2. Locate **Start Challenge** without visual assistance and activate it.
3. Confirm the objective, side to move, position progress, score, streak, and time are discoverable.
4. Navigate all 64 board squares; verify piece, coordinate, turn, selection, legal target, and move-result announcements.
5. Make a correct move and record feedback announcement timing.
6. In a fresh item, make a legal incorrect move and verify feedback is textual and announced once.
7. Activate Hint, then Reveal answer; confirm state and scoring consequences are understandable.
8. Activate Continue and verify position/progress changes are announced without losing the primary action.
9. Open Modes, traverse every option, close with Escape, and verify focus returns to the opener.
10. Complete five positions; traverse the complete summary, Replay, and Exit.
11. With a mocked digest mismatch, activate Start and verify the neutral unavailable message and retry control.

## Issue record

For every issue record environment, severity (`blocker`, `high`, `moderate`, `low`, or `observation`), steps, expected behavior, actual behavior, and disposition. Start, objective discovery, board operation, dialog escape/focus return, non-color feedback, and summary access are release blockers.

## Current result

Automated keyboard, focus, live-region, responsive, and Axe prerequisites pass. No human operator or installed screen-reader automation interface was available, so no manual result and no WCAG conformance claim are made.
