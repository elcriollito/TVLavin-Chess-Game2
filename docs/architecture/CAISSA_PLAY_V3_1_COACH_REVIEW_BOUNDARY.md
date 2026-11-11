# CAISSA Play v3.1 Coach Review Boundary

## P3.1-002 / P3.1-003 scope

Coach Review is an isolated presentation context consumed by the canonical `/analyze` document after a completed `/play/coach` handoff. It is not a route, chess session, analysis pipeline, or replacement for `AnalyzeSection`.

`post-game-core` creates one completed-game handoff and performs a real document navigation to `/analyze?handoff=<opaque-token>`. The retired `play-v2-inline-analyze` controller no longer admits or mounts this context inside Play. Games, Bots, generic Analyze, malformed contexts, and direct Analyze entry without a Coach handoff do not mount the Coach presentation. Analyzer lifecycle cleanup unmounts the presentation and removes its Coach-only classes and data attributes.

`AnalyzeSection.currentMoveIndex` remains the sole authoritative review ply. The presentation owns no move index, chess state, board, engine, evaluation, PGN, FEN, legal-move logic, score, classification, entitlement, persistence, authentication, or backend behavior.

The existing classification vocabulary is unchanged. This milestone does not introduce or render Brilliant, Great, or Miss counts.

The Coach summary/model and Guided Review presentation modules remain legitimate consumers of the authoritative Analyzer state. Their retention does not authorize Analyzer DOM, controller, or `analyze-deep` assets in dedicated Play documents.

## Deferred Guided Review boundary

`AnalyzeSection.jumpToMove` currently replays through the selected ply and updates `currentMoveIndex`, then deliberately displays `selected.fenBefore` when the completed classification is Inaccuracy, Mistake, or Blunder. P3.1-002 / P3.1-003 preserve that special negative-classification behavior exactly.

The Guided Review milestone must treat the distinction between the authoritative selected ply and this board-only `fenBefore` presentation override as an explicit product decision. It must not infer a second review index from the displayed position or silently normalize the behavior without separate approval and regression coverage.
