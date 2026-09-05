# CAISSA Play v3.1 — Coach Release

## Release identity

- Branch: `feature/play-v3-1-coach-review`
- Approved starting HEAD: `fb66ac411347acb7f38e569c6d2eb5f955470dbf`
- Final release code commit: `fb66ac411347acb7f38e569c6d2eb5f955470dbf`
- Release documentation/certification commit: the commit containing this document
- Certification date: 2026-09-05
- Production routes: `/play`, `/play/games`, `/play/bots`, and `/play/coach`
- Coach Review remains inline at `/play/coach`; there is no `/play/coach/review` route.

## Product scope

Play Coach v3.1 provides the approved Coach setup, active assisted game, Coach-specific game-over surface, Review Summary, Guided Review, and temporary Analysis Exploration. The release retains the existing Play tabs and makes `/play/coach` the canonical Coach route. Casual, Balanced, and Challenging are the visible primary choices; Show All Levels expands the remaining Beginner, Expert, Master, and Grandmaster choices as full-width vertical rows.

The presentation aliases do not change the seven underlying levels: Casual maps to `casual`, Balanced maps to `intermediate`, and Challenging maps to `advanced`. Existing Elo targets, engine strength, assistance policy, and Coach personality remain unchanged. White, Random, and Black retain their existing start behavior.

## Head / Body / Foot architecture

The permanent Coach shell has three presentation regions and one Caissa portrait:

- Head owns the persistent Caissa portrait and the current phase narration. It remains present throughout Setup, Active Game, Game Over, Review Summary, Guided Review, and Analysis Exploration.
- Body owns phase-specific content and, where needed on desktop, its internal scrolling. Setup choices, live notation, result content, summary metrics, classified notation, and the temporary exploration workspace appear here.
- Foot owns phase-specific actions. Setup exposes Play; Active Game exposes Resign, Hint, Undo, and utilities; Game Over exposes Review Game and New Game; Guided Review exposes literal review navigation and its secondary actions; Analysis Exploration exposes temporary-line navigation, Back to Review, and the engine toggle.

The board remains first. No review controls are placed below the board. On narrow layouts, the board precedes the full-width Coach shell.

## Coach lifecycle

`Setup → Active Game → Game Over → Review Summary → Guided Review → Analysis Exploration → Back to Review`

New Game exits the completed/review lifecycle through the existing authoritative reset and returns to Coach setup. Back from Review Summary restores the preserved Coach Game Over presentation. Back to Review destroys temporary exploration state and restores the exact authoritative review ply.

## State ownership map

| Concern | Authoritative owner | Contract |
| --- | --- | --- |
| Live chess position and game state | `App.game` and the existing Play lifecycle | No duplicate chess instance is introduced for authoritative Play. |
| Played move history | `App.moveHistory` | Board assistance and post-game handoff derive from this history. |
| Completed-game PGN | `CaissaPostGameCore` record at `record.notation.pgn` | Save PGN exports this value; exploration moves never enter it. |
| Completed result and termination | `CaissaPostGameCore` / its immutable PostGame record | Game Over and Coach Review consume the same record. |
| Completed analysis and classifications | Existing `AnalyzeSection` analysis lifecycle/results | Review starts the existing lifecycle once and does not duplicate scoring or classification. |
| Current review ply | `AnalyzeSection.currentMoveIndex` | Sole authoritative review cursor for Review Summary and Guided Review. |
| Temporary exploration line | `CaissaCoachReviewExploration` | Owns only a temporary `Chess` instance, FEN/move line, and local cursor; disposed on Back. |
| Visible evaluation rail | `CaissaEvaluationRailInstance` | One presentation owner receives the value appropriate to the current phase. |

## Board assistance contract

Show Legal Moves works on pointer, touch, and drag selection. Empty destinations use a point and captures use a ring. The setting controls the whole legal-target presentation. The chessboard adapter owns these visual highlights; legal move generation remains in the existing chess core.

Highlight Opponent Last Move is opponent-only during Active Play and is derived from `App.moveHistory`, including after opponent reply and Undo. Player color, not board orientation, determines ownership, so Flip does not change semantics. Review is position-centric and highlights the selected reviewed ply. The gold effect belongs to a square-level layer beneath pieces: translucent fill plus an inset ring, with pieces and coordinates visually untouched.

Coach Hint independently presents source and destination even when Show Legal Moves is off. The approved visual precedence remains Last Move, Legal Moves, suggestion/threat presentation when separately approved, Coach Hint, then Move Feedback/classification.

## Guided Review contract

Guided Review consumes the completed analysis and the single `AnalyzeSection.currentMoveIndex`. Head narration, evaluation, selected notation, board position, last-move projection, and classification badge all describe the same authoritative ply. Literal First, Previous, Next, and Last actions move one ply. Explain expands the current evidence-backed explanation.

Only classifier categories that exist in authoritative evidence are shown. The current release supports Book, Best when exact evidence exists, Acceptable, Inaccuracy, Mistake, and Blunder. It does not fabricate Brilliant, Great, or Miss, including fake zero totals.

## Next Moment contract

Next Moment searches completed analysis for the lowest later `moveIndex` greater than `AnalyzeSection.currentMoveIndex` whose classification is Inaccuracy, Mistake, or Blunder. It searches both colors, does not wrap, and creates no secondary cursor. Narration distinguishes “You played…” from “Your opponent played…”. Review Complete appears only when no later qualifying moment exists for either color; New Game remains available at completion.

## Analysis Exploration isolation contract

Analysis Exploration is a temporary branch from the selected Guided Review position. `CaissaCoachReviewExploration` owns its temporary chess position, moves, FEN line, and local cursor. It must not write `App.moveHistory`, the authoritative PGN, `AnalyzeSection.currentMoveIndex`, completed analysis results, classifications, accuracy, or the PostGame record.

The exploration Head exposes evaluation and principal variation. Body provides a full-height empty state before the first temporary move and internally scrollable temporary notation afterward. Foot provides First, Previous, Next, Last, Back to Review, and Engine On/Off. The LED and accessible pressed/name state reflect the actual exploration `engineEnabled` value. Playing from an earlier temporary position truncates only the later temporary branch. Back disposes the branch and restores the exact Guided Review ply, notation, evaluation, and last-move projection.

## Settings and PGN export

Review Settings exports the immutable completed-game PGN from `record.notation.pgn`. Temporary exploration moves are excluded, and saving does not remount Game Over over Guided Review. Analysis effort is session-only and applies only to Analysis Exploration: Quick depth 10, Balanced depth 14, and Deep depth 18, with Balanced as the default. It does not alter Coach strength, completed-game analysis, classification, accuracy, or engine-toggle semantics.

## Evaluation rail synchronization

The existing single evaluation rail shows live evaluation in Active Coach, the final known live evaluation at Game Over, the authoritative review-ply evaluation in Review Summary and Guided Review, and exploration evaluation in Analysis Exploration. Engine Off retains the last known exploration value. Flip preserves White-relative evaluation semantics. Back to Review restores the authoritative review value. No additional engine worker or analysis request owner was added for rail synchronization.

## Desktop / Mobile behavior

Desktop uses a board-first split with a tall right-side Coach column. Head is stable, Body consumes flexible space and scrolls internally where required, and Foot remains phase-stable. Tablet retains the same ownership with narrower geometry. At 390 px and other phone widths, the board appears first and the Coach regions stack at full width without horizontal overflow. Level choices remain one full-width row at every breakpoint, and review/exploration controls remain touch-sized.

## Accessibility expectations

The Coach flow preserves keyboard traversal and visible focus, named dialogs and controls, 44 px or larger interactive targets where required, and semantic toggle state for the exploration engine. Review navigation has distinct accessible names; Flip is named “Flip board”. Dynamic status is announced through bounded live regions without exposing raw engine chatter. Focus returns to the appropriate review/result trigger. Focused Coach surfaces must have no serious or critical Axe violations in their certified Chromium and WebKit paths.

## Protected systems / non-goals

Play Coach v3.1 did not redesign or transfer ownership of:

- Stockfish architecture, worker lifecycle, or engine scoring;
- chessboard core, legal move rules, board state, PGN/FEN ownership, or classifier thresholds;
- Coach engine strength, Elo targets, assistance/personality policy, authentication, entitlement, or backend;
- Play Bots, Play Game/Games, generic Analyze, or their product behavior.

The release does not introduce a second board, Caissa portrait, review cursor, PostGame record, analysis lifecycle, or engine worker owner.

## QA / certification evidence

Certification on the approved feature line produced:

- Focused Play v3.1 unit/contract set: 102 passed, 0 failed.
- Coach plus board-assistance browser matrix in Chromium and WebKit: 43 passed, 0 failed, 1 intentionally skipped.
- Evaluation rail browser matrix in Chromium and WebKit: 12 passed, 0 failed.
- Canonical inline Analyze containment in Chromium across 15 profiles (320 px through 4K, including 390 px): 15 passed, 0 failed.
- Accessibility: canonical Chromium suite 5 passed; focused WebKit non-zoom/current-route subset 4 passed; Coach setup and Review Summary serious-violation checks passed in both browsers.
- Official Play document generator: completed with no generated diff.
- Targeted JavaScript syntax checks and `git diff --check`: passed.

The post-merge and production smoke evidence is recorded in the release report and deployment history because their immutable commit/deployment identities do not exist until this document is committed and merged.

## Known historical/baseline test debt

The broad Play unit corpus reported 774 passed and 15 failed out of 789. The failures are pre-existing historical guards outside the Coach v3.1 contract: pinned third-party/Stockfish and jQuery byte digests, old SQL migration digests, retired beta/Mentor resource-graph assumptions, Season 10 immutable release manifests/checksums, a shell-version expectation, and a CRLF-sensitive coverage-manifest assertion. They are not current Coach regressions and were not rewritten to conceal historical drift.

Additional unrelated browser debt remains outside this release: old Play Game setup selectors, Bots radio labels whose child piece image intercepts pointer action plus a Bots focus-outline assertion, old global-sidebar navigation selectors in a legacy Analyze resource test, and a WebKit-only Axe background inference while Play Game is rendered at 200% CSS zoom. The current Coach flow, canonical routes, Guided Review analysis entry, and generic inline Analyze containment have independent green evidence. No unrelated production code was changed for these baselines.

## Future follow-up

The following require separate architecture and product approval and are not implemented here:

1. Apply Head / Body / Foot shell thinking to Play Bots.
2. Apply Head / Body / Foot shell thinking to Play Game.
3. Align Play Bots post-game and Analyze presentation with the successful Coach v3.1 model where appropriate.
4. Evaluate richer Caissa personality and liveliness: multiple expressive portraits, context-sensitive reactions, legally usable UI sounds, and optional richer narration.
5. Evaluate presentation settings for Suggestion Arrows, Threat Arrows, Evaluation Bar, and Move Feedback only after separate architecture approval.
