# CAISSA Chess Opening Trainer — Season v1

Status: DEVELOPMENT BRANCH · NOT RELEASED · HUMAN TEST REQUIRED
Branch: \`season/caissa-opening-trainer-v1\`
Approved design: annotated user sketch, 2026-10-21.
Canonical URL (when approved): \`/opening-trainer\`.

## Product contract

**One large chessboard left; one right-hand HEAD/BODY/FOOT workspace.**

The right workspace has exactly five primary tabs, in order:
**Analysis · Practice · Games · Opening · WikiBook**.
There is no permanent third column. A compact single-line Stockfish evaluation/PV sits immediately beneath the tabs and retains its footprint even when the engine is off. The BODY is the main scroll owner. The FOOT is pinned inside the workspace and always holds Flip, Engine, First, Previous, Next and Last. On mobile the board precedes the workspace; do not use CSS zoom.

### Study loop

1. **Analysis**: freely play only legal moves, create branches when moving from past positions, show SAN notation, optional best-move arrow and one compact engine line. User can switch to WikiBook without losing their position or variants.
2. **WikiBook**: reading view for the exact SAN path when a corresponding Wikibooks Chess Opening Theory page exists, with a clickable source, project and license attribution. Notation, board and other tabs remain synchronized. Never present a parent article as if it were an exact match.
3. **Save**: preserve the selected analysis line/repertoire; show **Save & Train** as a second path. Guest saves may initially use bounded local-only storage clearly labeled as such; no silent cloud-write implication.
4. **Practice**: user selects White or Black. The opposite side plays stored replies. Prompt for the user's memorized move without leaking the answer. A legal deviation from a stored line is "not in your saved repertoire", not automatically a chess mistake. Provide Retry, Hint and Replay. Future branch-aware training may sample saved alternatives.
5. **Opening**: two subtabs **Chess ECO Codes Database** and **CAISSA Explorer**. Search name, ECO or moves using the existing \`/data/eco/eco_codes.json\`, \`js/eco-opening-resolver.js\` and existing opening database as authoritative source.
6. **Games**: search the existing \`/api/pgn/opening\` catalog, display at most ten games in each concise result view; **Games / Notation** subtabs. The selected game and notation drive the same board. The API already returns pages of 100 PGNs; never claim the backend limit is 10.

### Auto WikiBook

User's requested default is transition to WikiBook when relevant theory appears during Analysis. To avoid stealing control on every move, the auto-open preference is switchable and supports "Lock current tab". It must not interrupt a pending promotion, training attempt, source load or deliberate reading. Position and engine remain authoritative across any tab change.

### Single owners and integration

- Board presentation/quiet drag: \`CaissaBoardAdapter\` and \`js/board/caissa-quiet-drag.js\`.
- Chess legality: installed \`chess.js\` 1.4.0 ESM; one active chess-state owner per study session.
- Local engine: reuse \`PgnAnalysisEngine\` lifecycle; do not spawn concurrent workers for panels or WikiBook.
- ECO: the existing canonical ECO JSON and resolver, not a separately maintained copy.
- Games: existing \`/api/pgn/opening\` catalog and validated paginated PGN endpoint.
- Wikibooks: MediaWiki Action API with CORS \`origin=*\`, bounded article size and text-only rendering or explicit sanitization; article name generated from legal SAN history (not UCI); source and license links displayed. Live article availability is never promised; network failures must have honest fallbacks.
- Saved training content is distinct from browsing history and from live training attempts. An Analysis node is never overwritten by a Practice attempt.

### Failure/safety requirements

- No duplicated chess rules, overlays that obstruct pointer input, remote HTML directly injected, external JavaScript, or unbounded network requests.
- No false "engine evaluation": when off/loading/error, show that state rather than a fabricated score or arrows.
- Engine search messages must be associated with the current FEN; stale engine output must never draw arrows on a newer board.
- WikiBook must not claim verified content for a transposition unless its mapping is independently confirmed.
- Respect Wikibooks reuse license and upstream attribution. Reference: https://en.wikibooks.org/wiki/Chess_Opening_Theory
- Avoid requiring Clerk or Supabase to use public study/training in the initial local-only pilot.
- No production edits, merges, aliases, or irreversible operations without user release approval.

### Implementation milestones

1. **Foundation:** new standalone page, board, five tabs, fixed foot, responsive geometry and routing isolated on feature branch.
2. **Theory and analysis:** legal move tree, Stockfish line/arrow, ECO search, WikiBook lookup with attributable text.
3. **Learning loop:** save a line, train by chosen color, exact-vs-alternative feedback, local persistence.
4. **Game search:** PGN opening collection search, at-most-ten result display, Games/Notation tabs.
5. **QA/Human Test:** automated Node/browser tests, engine and Wikibooks failure cases, 1600×1000 / 1366×768 / 885×611 / 390×844; Chromium and WebKit; Quiet Drag performance acceptance and user visual approval.

### Explicit non-goals for first pilot

- No Cloud Supabase repertoire sync, premium paywall, AI-authored theory, or rated training.
- No unverified universal FEN transposition-to-Wikibooks mapping.
- No automatic production navigation promotion prior to QA + Human Test.
