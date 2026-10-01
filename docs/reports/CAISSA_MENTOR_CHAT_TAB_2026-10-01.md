# CAISSA Mentor: dedicated Chat and training idea indicator

Base: 8f17a0643bae257cd9236014e37f53a634997322.
Branch: feature/mentor-page-handoff-review-2026-09-30.

## Delivered

Four tabs in order **Chat | Learn | Opening | My account**, Chat selected initially. The existing Mentor conversation now belongs exclusively to Chat. Switching panels preserves conversation, drafts, lesson and board. The authenticated header account link targets the fourth tab by ID. New session returns to Chat while preserving existing submit-in-progress protection.

A lightbulb beside Chat signals a new completed account-analysis idea. A polite accessible status announces it. Entering Chat presents an encouraging local message once and clears unread status. Results received while Chat is active appear immediately. Duplicate summaries do not trigger another message. The training-plan action prepares a draft for explicit submission, preserves existing drafts, and does not call Shared AI or consume credits automatically.

Account changes clear notification state, local idea messages and an unedited generated plan draft. The notification controller is in-memory, evidence bounded, and has no network, storage, engine or economic authority.

Chat uses the right workspace body as its scroll owner. Messages cannot flex-shrink into each other, and the composer retains sticky positioning. Browser geometry and long-conversation behavior still require visual review.

## Integration contract (not an implemented importer)

The future account-analysis producer dispatches `caissa:account-analysis-completed` on window with detail:

```js
{
  ownerId: currentCaissaAuthUserId,
  status: 'completed',
  verified: true,
  analysisId: uniqueCompletedAnalysisId,
  source: 'chesscom', // or lichess / caissa
  username: linkedSourceUsername,
  completedGames: 10,
  themes: [{ theme: 'tactics', sampleGames: 4 }]
}
```

Use only real finished analysis, never username-save or pending-import events. ownerId must match the loaded signed-in CAISSA user. Game counts are 1–100. Evidence themes: tactics, development, kingSafety, hangingPieces, timeManagement, endgame; counts must be within the analyzed sample. Counts describe evidence coverage, not inferred error rates or player strength. The event is a UI integration seam, not a security verification or backend authorization mechanism. The producer must establish actual authenticity and analysis correctness.

No claim that these games are the latest ten is made unless the future importer actually establishes that selection. Username storage remains explicitly local. No real imports, backend analysis, Shared AI, authentication, persistence or credits are certified by these tests.

## Verification

34/34 targeted tests PASS, including two behavioral page-controller tests for unread-to-read lifecycle, duplicate prevention, tab/draft retention, no automatic network, username-save behavior, and account isolation. Syntax checks and git diff --check PASS.

No browser visual approval or Quiet Drag certification: the environment has no working browser binary and its localhost browser preview was blocked. Required human QA: desktop/mobile tab geometry, long-chat scrolling/sticky composer, keyboard tabs, and Quiet Drag/promotion per docs/standards/CAISSA_QUIET_DRAG.md. Board adapter and drag code are unchanged.

Apply this incremental handoff on the existing authoritative Mentor branch. Do not rebuild the prototype, modify FICS worktrees, or deploy automatically.
