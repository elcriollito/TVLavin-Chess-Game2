# CAISSA Analyze v1.2 Stable Candidate Report

Date: June 14, 2026

## Recommendation

**Promote to v1.2 Production Ready after the critical FEN-start fix in this
working tree is reviewed, committed, and smoke-tested in production.**

No crash, memory-growth regression, stale highlight, evaluation mismatch, or
browser exception was observed after the fix. No new Analyze features were
added during validation.

## Bugs Found

### AN-SC-001: Custom-FEN games reset to the standard initial position

- Severity: Critical
- Status: Fixed and locally verified
- Affected: Move navigation and engine analysis for PGNs using `SetUp`/`FEN`
- Reproduction:
  1. Load a PGN with `[SetUp "1"]` and a custom `[FEN "..."]`.
  2. Navigate to the start or any move.
  3. Observe the board reset to the standard chess position and fail to replay
     the custom-position move.
- Root cause: `jumpToMove()` and `startAnalysis()` always initialized a standard
  `Chess()` position instead of the PGN's declared starting FEN.
- Fix: Store the PGN initial FEN and reuse it for navigation replay and
  Stockfish position construction.
- Verification: Queen promotion and knight underpromotion positions remained
  synchronized at start/end; the knight-promotion game completed Stockfish
  analysis with 2/2 positions analyzed.

## Validation Results

### Large Games and Memory

- PASS: 160-ply game loaded and rendered without horizontal overflow.
- PASS: Stockfish analyzed 161/161 positions in 21.7 seconds.
- PASS: 160/160 move results and annotations remained available.
- PASS: 300 rapid post-analysis jumps retained one active move and synchronized
  board state.
- PASS: JavaScript heap remained stable (4.73 MB before, 3.02 MB after).
- PASS: No browser exceptions.

### Chess Rule Edge Cases

- PASS: Kingside castling navigation and analysis (9/9 positions).
- PASS: Queenside castling navigation.
- PASS: En passant navigation and analysis (6/6 positions).
- PASS: Queen promotion from a custom FEN.
- PASS: Knight underpromotion from a custom FEN and engine review.
- PASS: Checkmate navigation and review; 4/5 positions available correctly
  produced partial status.
- PASS: Threefold repetition sequence and 160-ply repetition stress game.
- PASS: Stalemate and fifty-move-rule terminal FENs loaded with correct
  `game_over`/draw state.

### Navigation and Review Synchronization

- PASS: 500 rapid direct move jumps with repeated flips retained synchronized
  move index and exactly one active highlight.
- PASS: 40 Critical Moments click/flip cycles jumped to the expected move and
  kept Mentor and eval bar synchronized.
- PASS: Left/Right/Home/End keyboard navigation.
- PASS: Arrow keys dispatched from the username input did not navigate or
  prevent normal input behavior.
- PASS: Starting position showed neutral `0.0` evaluation.

### Import Validation

- PASS: Lichess `elcriollito`, last 20: 20 received and all 20 selectable games
  loaded.
- PASS: Chess.com `tvlavin`, last 20: 20 received and all 20 selectable games
  loaded.
- PASS: Chess.com account history sampled across the last 12 archives contains
  Blitz, Bullet, Daily, and Rapid games.
- PASS: Lichess API filters returned Blitz, Bullet, and Rapid samples.
- Coverage gap: A public Lichess correspondence sample was not available from
  the tested account during this run.

### Engine Validation

- PASS: Short opening, tactical/checkmate, en passant, custom-FEN endgame, and
  160-ply long-game analysis.
- PASS: Completion percentages matched available positions.
- PASS: One unavailable position did not cause an exception or false total
  completion.
- PASS: Critical Moments, accuracy, and Review Summary populated from results.

### Responsive and Browser Validation

- PASS: Chrome desktop, portrait 390x844, and landscape 844x390.
- PASS: No horizontal overflow; board and Analyze controls remained visible.
- PASS: Edge desktop navigation/flip smoke test with no exceptions.
- PASS: Firefox application render smoke test.
- Coverage gap: Full Firefox Analyze interaction automation was not available in
  the current local harness; complete the final production smoke manually.

## Remaining Non-Blocking Validation

1. Perform a manual Firefox Analyze workflow in production: import, analyze,
   navigate, flip, and Critical Moments.
2. Import one known Lichess correspondence game when a suitable public sample
   is available.
3. Smoke-test the committed FEN-start fix on production before changing the
   project status marker to Production Ready.

## Files Changed During Stability Phase

- `js/analyze-section.js`: critical custom-FEN navigation/analysis fix and
  Stable Candidate status marker.
- `docs/analyze-v1.2-stable-candidate-report.md`: this validation report.
