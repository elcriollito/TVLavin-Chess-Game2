# CAISSA Play Bots v1.0 Release

## Release identity

- Approved product commit: `d4bdaa7c5cac4892a09e525449eba3e8ce8d9864`
- Release documentation/certification commit: the commit containing this document
- Certification date: 2026-09-06
- Canonical route: `/play/bots`
- Reconciliation base: `origin/main` at `7d48a6da4b03732a00f38c80a446dba59e14d1b1`

The approved product commit is the frozen Play Bots v1.0 implementation. The
release documentation commit adds certification evidence only; it does not
change the approved Bots presentation or behavior.

## Final architecture

Play Bots remains inside the single canonical Play shell and shares the
existing board, game, engine, route, post-game, and analysis infrastructure.
Its right column is a permanent three-region shell:

- **Head** owns phase identity. Setup, Active Game, and Game Over show the
  selected Bot avatar, name, and Elo. Analysis Summary, Guided Review, and
  Analysis Exploration use the existing Caissa analyst presentation.
- **Body** owns phase content and is the sole vertical scroll owner on split
  layouts. It contains setup choices, opening/ECO and notation, the result and
  Analyze action, the analysis comparison, guided notation, or Study content.
- **Foot** owns phase actions and remains anchored. It never becomes a second
  Body and its controls never move below the board.

There is one Play board, one authoritative live game, one completed-game
record, one completed-analysis owner, and one engine worker owner.

## Lifecycle

`Setup → Active Game → Game Over → Analysis Summary → Guided Review → Analysis Exploration → Back to Review → New Game`

- Setup exposes Bot categories, selected identity, time control, Play As, and
  Play without starting or duplicating engine ownership.
- Active Game keeps the selected Bot identity fixed while Body presents
  opening/ECO and notation. Foot exposes Resign, Hint, Undo, Share, Download,
  and Settings.
- Game Over keeps the same Bot Head. Body contains result, termination, and
  **Analyze This Game**. Foot contains exactly **New Game | Menu**. Menu is an
  upward floating PGN popover and creates zero shell layout shift. There is no
  Bots-specific **Review with Mentor** presentation.
- Analysis Summary presents Caissa, Player-versus-Bot accuracy, and only
  authoritative classification rows. Its Foot is **New Game | Review Game**.
- Guided Review keeps board, selected notation, evaluation, narration, and
  classification on the same authoritative ply. Next Moment searches both
  colors.
- Analysis Exploration provides the read-only source Study, an isolated
  **ANALYSIS VARIATION**, Engine On/Off, and exact-ply Back to Review.

## State and ownership map

| Concern | Authoritative owner | Release contract |
| --- | --- | --- |
| Live position and game lifecycle | `App.game` and existing Play lifecycle | Bots creates no competing live game owner. |
| Played move history | `App.moveHistory` | Remains authoritative and unchanged by Study exploration. |
| Board rendering and interaction | Existing `App.boardAdapter` | One board; click, drag, legal targets, captures, and promotion retain existing ownership. |
| Bot selection and strength | Existing Bots catalog/selection and worker adapter | Selection drives Head identity and bounded engine configuration without duplicate state. |
| Completed result and PGN | Existing `CaissaPostGameCore` record | All post-game and analysis phases consume the same immutable completed record. |
| Completed analysis, accuracy, classifications | Existing `AnalyzeSection` results | Summary, Guided Review, badges, and Study annotations project the same evidence; no recomputation. |
| Current review ply | `AnalyzeSection.currentMoveIndex` | Sole authoritative Guided Review cursor. |
| Source Study timeline | Completed-game move history and analysis results | Read-only and position-synchronized. |
| Analysis variation | `CaissaBotsAnalysisExploration` temporary chess state | Disposable branch; it cannot mutate source PGN, move history, completed evidence, or review cursor. |
| Evaluation | Existing evaluation rail/engine presentation | One rail and one engine lifecycle; values follow the authoritative phase position. |

## Analysis and classification contract

The completed analysis runs through the established `AnalyzeSection` owner.
Presentation layers consume its accuracy and classification evidence rather
than starting a second analysis request. The canonical symbols are:

| Classification | Symbol |
| --- | --- |
| Book | 📖 |
| Best | ★ |
| Precise | `!` |
| Good | `✓` |
| Inaccuracy | `?!` |
| Mistake | `?` |
| Blunder | `??` |

Summary, Guided Review, board feedback, and source Study annotations preserve
the same classification meaning. Temporary variation moves are not assigned
completed-game classifications.

## PGN safety

The completed-game PGN remains owned by the existing PostGame record. Copy,
download, and local-save actions reuse existing callbacks. Source Study
navigation is read-only. Analysis Variation maintains a separate temporary
line and can replace only its own future. Creating, navigating, or disposing a
variation does not write `App.moveHistory`, the source PGN, accuracy,
classification evidence, or the completed result.

## Mentor separation

The global floating Mentor remains an independent, read-only observer. Bots
Analysis may provide a one-way current-FEN snapshot to Mentor, but Mentor does
not control the board, legal moves, temporary line, review cursor, PGN, or
engine. Opening, minimizing, or closing the global Mentor produces zero Play
frame or legal-move change. The obsolete Bots Game Over **Review with Mentor**
action is not visible; shared Mentor infrastructure remains available to its
other owners.

## Responsive behavior

At 1600×1000 and 1366×768, board and right shell use the approved split
layout and terminate on the same baseline. Head and Foot remain fixed while
Body scrolls internally. At 390×844 the board precedes the full-width shell,
controls remain touch-sized, and document width does not overflow. Existing
90%, 100%, 110%, and 125% geometry profiles retain the same ownership and zero
desktop shell-growth contract.

## Certification evidence

Certification was executed against the approved product commit with the QA
server explicitly bound to that worktree:

- Bots unit/contracts: 38 passed, 0 failed.
- Bots Chromium lifecycle and visual contract: 11 passed, 0 failed.
- Bots WebKit lifecycle and visual contract: 11 passed, 0 failed.
- Play accessibility contracts: 8 passed, 0 failed.
- Cross-browser accessibility: 15 passed, 0 failed across Chromium, Firefox,
  and WebKit.
- Coach isolation: 25 unit/contracts and 14 Chromium/WebKit browser tests
  passed, 0 failed.
- Generated Play documents: canonical generator completed with no diff.
- Targeted JavaScript syntax checks and `git diff --check`: passed.

The Bots browser matrix covers Setup, Active Game, Game Over, Analysis Summary,
Guided Review, Analysis Exploration, source/variation navigation, exact-ply
Back to Review, and New Game. It also covers 1600×1000, 1366×768, 390×844,
and the 90/100/110/125 geometry profiles. Desktop board/right-shell bottom
delta is 0 px, horizontal overflow is 0 px, Body is the only flexible scroll
region, Mentor frame deltas are 0 px, and the Study PGN remains unchanged.

## Known unrelated baseline debt

The historical `play-game-lifecycle.spec.js` browser contract still expects an
eager worker at idle and an older New Game session transition. Its three
browser assertions fail identically against the pre-Bots production server;
the corresponding 11 lifecycle unit contracts pass. Bots does not modify that
test or the lifecycle owner.

Additional inherited broad Play browser debt remains outside Bots v1.0: legacy
home/Classic navigation selectors, old direct mobile/drag callback assumptions,
and a light-theme Resign contrast assertion in the broad smoke test. The
affected test files and relevant shared presentation rule are unchanged by the
Bots release. These failures are not concealed by production changes. Current
Bots, Coach, accessibility, canonical routing, single-board, and engine-owner
contracts have independent green evidence above.

## Production protection

The release preserves the recovered PGN Reader commits and Play Coach v3.1
already present in `origin/main`. It does not redesign Play Game, generic
Analyze, navigation/i18n, Game Library, Polyglot, Support, authentication, or
backend behavior. Generated Play documents are reconciled only through
`node scripts/build-play-v2.mjs`.
