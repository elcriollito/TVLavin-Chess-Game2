# CAISSA Play v3.1 Coach Review Boundary

## P3.1-002 / P3.1-003 scope

Coach Review is an isolated presentation context inside the existing inline `/play/coach` Analyze handoff. It is not a route, chess session, analysis pipeline, or replacement for `AnalyzeSection`.

The context is admitted only when `post-game-core` creates a review request from a completed game whose Play shell mode is `coach`. `play-v2-inline-analyze` validates that context before mounting the Coach Review header and Coach-scoped layout class. Games, Bots, generic Analyze, malformed contexts, and direct Analyze entry do not mount the presentation. Closing inline Analyze unmounts the presentation and removes its Coach-only classes and data attributes.

`AnalyzeSection.currentMoveIndex` remains the sole authoritative review ply. The presentation owns no move index, chess state, board, engine, evaluation, PGN, FEN, legal-move logic, score, classification, entitlement, persistence, authentication, or backend behavior.

The existing classification vocabulary is unchanged. This milestone does not introduce or render Brilliant, Great, or Miss counts.

## Deferred Guided Review boundary

`AnalyzeSection.jumpToMove` currently replays through the selected ply and updates `currentMoveIndex`, then deliberately displays `selected.fenBefore` when the completed classification is Inaccuracy, Mistake, or Blunder. P3.1-002 / P3.1-003 preserve that special negative-classification behavior exactly.

The Guided Review milestone must treat the distinction between the authoritative selected ply and this board-only `fenBefore` presentation override as an explicit product decision. It must not infer a second review index from the displayed position or silently normalize the behavior without separate approval and regression coverage.
