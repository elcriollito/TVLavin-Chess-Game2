# CAISSA Mentor — idea-first Chat and fixed composer

Continues the existing Mentor prototype and Chat-tab commit 9d3f1b27722bc697873605df575207811ffe8d26. Implements Alexander's annotated reference image image(20261001-025924).png.

## Behavior

Chat initially offers three questions: piece development, knight forks, and king activity. Selecting a question appends a local question/answer exchange and loads the matching legal authored lesson on the shared board. The exchange becomes part of the shell's bounded conversation history for subsequent manually submitted questions. The chosen cards hide to reveal the conversation. New session restores the choices. User drafts remain untouched by a starter choice. Pending promotion and an in-progress Mentor reply block changes to the board.

Actual completed game-analysis evidence can select matching examples from tactics, undefended pieces, development or endgames. These are explicitly separate lessons, not reconstructed positions from the user's games. Themes without a matching authored lesson direct the user to the training-plan draft and leave general examples labeled as general. No sample game, rating, weakness or previous insight is fabricated.

The scrollable workspace BODY contains the idea cards and conversation. A separate workspace FOOT contains the manual composer, Shared AI notice and authentication status; it is a sibling of the scroll owner and remains fixed inside the panel. Changing away from Chat hides its FOOT. The existing floating shell elsewhere retains its layout.

## Recall integration still pending

The existing caissa:account-analysis-completed event can receive both a newly completed real analysis and a previously saved completed insight loaded for the currently signed-in CAISSA owner. The producer must retrieve and verify the owner-scoped data before dispatch. This patch does not implement that authenticated retrieval, persistence or game import. Being signed in alone does not imply an insight exists. A returning user without loaded evidence receives general ideas.

Next integration: hydrate latest owner insight on auth readiness; load prior games and positions through the real importer; offer exact reviewed positions using the existing shared board authority. Do not allow arbitrary provider output to bypass legal position/move validation. Manual free-text messages continue through the existing Shared AI provider on explicit submission only.

## Verification

36/36 targeted tests PASS. Behavioral tests cover starter selection, legal board position, local response, draft preservation, no automatic network, owner-specific suggestions, guarded board changes, FOOT tab visibility, and New session. Syntax checks and git diff --check PASS.

Browser visual QA remains pending in this environment. Required desktop/mobile review: BODY scrolling, fixed FOOT including virtual keyboard, long conversations, keyboard tab navigation, real hydration, and Quiet Drag/promotion under docs/standards/CAISSA_QUIET_DRAG.md. No drag renderer changes, deployment or production certification.
