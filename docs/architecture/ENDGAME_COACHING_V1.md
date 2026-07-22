# Endgame Coaching v1

## Previous pipeline audit

The curriculum selected a lesson with a title, objective, role, and theme, but the session controller retained only the generated position and a generic objective. Hints requested Stockfish immediately and exposed a move without a teaching progression. The page rendered that suggestion directly. User moves had no instructional classification, and terminal feedback was limited to the session result.

Board state already had a separate binding: FEN changes update pieces, while status-only emissions do not. Coaching therefore belongs in session state and the existing feedback containers, not in the board adapter.

## Architecture

`endgame-coach.js` is a pure deterministic domain module. It normalizes and freezes a context containing lesson metadata, position geometry, the student and best moves, optional engine evaluations, and optional game-theoretical results. It returns a structured classification and message without accessing the DOM, board, worker, storage, or network.

`endgame-coaching-messages.js` centralizes English teaching templates for future localization. A theme message is used only when its minimum geometry can be verified. Unsupported or incomplete contexts receive a general result-based message, preventing invented theoretical claims.

The session controller preserves the resolved lesson objective and theme. It emits coaching after each legal student move and stores final-hint analysis only for the current FEN. Hint levels are deterministic: principle, focus, direction, then a verified legal engine move. Undo, restart, and new-position flows clear transient coaching and hint progression.

The page uses existing status, hint, and feedback nodes. Text writes are idempotent. The board binding ignores coaching-only state changes, so they produce zero piece renders.

## Classification contract

- `BEST`: matches the available verified best move.
- `GOOD`: preserves a known win/draw or the lesson technique.
- `INACCURACY`: weakens the technique or crosses the configured small evaluation-loss threshold.
- `MISTAKE`: changes win to draw, or crosses the medium evaluation-loss threshold.
- `BLUNDER`: changes win to loss or draw to loss, or crosses the large threshold outside an already-lost position.
- `ONLY_MOVE`: matches a best move after uniqueness was explicitly verified.
- `SUCCESS`: completes the exercise under the existing session completion rules.

Game-theoretical result transitions take precedence over centipawn thresholds. Noise in a position already classified as lost is never sufficient by itself for `BLUNDER`.

## Engine boundary and limitations

The model accepts before/after evaluations and WDL-compatible results when a trusted caller has them. This season does not add tablebases or extra automatic Stockfish searches. Consequently, live feedback never invents exact WDL or uniqueness: those claims appear only when verified fields are supplied. Without them, feedback is deliberately limited to verified geometry and safe general language.

The first release does not translate messages, calculate exact tablebase truth, or create new curriculum lessons. The production language remains English.
