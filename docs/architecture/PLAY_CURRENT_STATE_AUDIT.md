# CAISSA Play Current-State Audit

## 1. Executive Summary

This audit describes the repository at commit `eb0511043dd397ac6ff50f05b4e67a84144b5d78`. The current Play experience is not a component system. It is a section of the main `index.html` single-page shell, driven primarily by the 7,501-line global `app.js`, with navigation, engine, Mentor, FICS, Arena, Spectator, Analyze, and responsive behavior spread across independent scripts and CSS.

The core Play path supports a verified code path for human-versus-engine, analysis/study, and engine-versus-engine. FICS human play, Arena, Spectator TV, endgame training, and the React `chess-llm-platform` have their own board and lifecycle implementations. They do not share one game lifecycle with Play. Friend challenges, matchmaking, tournaments, rematch, draw offers, disconnect handling, recovery, and a post-game action surface are absent from core Play or are placeholders elsewhere.

The strongest reusable seams are chess.js as the rules source, chessboard.js as the view, the engine registry/adapter, PGN serialization, the board-interaction contract, and Analyze's PGN loader. The greatest migration risks are mutable global state, repeated listener registration, shared engine callbacks without response ownership, Play/Analyze state aliasing, missing fair-play enforcement, incomplete result modeling, and layered responsive CSS.

Season 10.1 should introduce boundaries around the existing behavior before changing its presentation: a shell, board stage, engine/evaluation service, clock, and unified lifecycle contract. It should adapt—not duplicate—the existing Analyze path.

Audit confidence is **high for static structure and code paths**, **medium for responsive behavior**, and **low for end-to-end runtime claims not covered by tests**. No production code or styling was changed.

## 2. Repository Baseline

| Item | Value |
|---|---|
| Branch | `main` |
| Initial HEAD | `eb0511043dd397ac6ff50f05b4e67a84144b5d78` |
| Local `origin/main` | `eb0511043dd397ac6ff50f05b4e67a84144b5d78` |
| HEAD equals `origin/main` | Yes |
| Working tree | Clean |
| Staged changes | None |
| Unstaged changes | None |
| Untracked files | None |

The baseline was established with Git before inspection. No fetch was required or performed; `origin/main` means the locally recorded remote-tracking ref. The branch and documentation path conform to the repository's existing `docs/architecture/SEASON_*` convention. No `AGENTS.md` or conflicting documentation governance file exists in the repository.

## 3. Current Play Entry Points

1. The primary navigation button in `index.html` has `data-section="play"`. `CaissaNavigation.navigateToSection('play')` activates `#playSection`.
2. A direct deep link `/?section=play` is read by `js/caissa-navigation.js`. The query is not synchronized after ordinary section navigation, so navigation is DOM state rather than browser-history state.
3. The global New Game action calls `CaissaNavigation.openNewGameModal()`, navigates to Play, calls `ensurePlayInitialized()`, and opens `#newGameModal`.
4. Mobile Play quick actions expose New Game, Undo, Hint, PGN, and Menu.
5. `?fen=...` is consumed by `app.js`, loaded into the Play board as analysis state, then removed with `history.replaceState`.
6. `?embed=1` changes the app-container class; `?debug=1` enables debug logging.
7. `LAUNCH_CHESS_GAME.html`, `JUGAR_AJEDREZ.bat`, and direct `index.html` opening are legacy launch paths documented by the repository.
8. FICS (`#ficsSection`), CAISSA Classic (`#yahooClassicSection`), Arena, Spectator, Analyze, and endgame pages are separate entry points, not aliases for core Play.

Cold load defaults to `yahooClassic`, despite stale comments saying Play is the default. `/yahoo-classic` and `/academy` map to sections. Historical `?section=endgameTrainer` and `?section=endgame` redirect to `/endgame-trainer`. Navigation stores the current section but intentionally ignores it on reload unless an explicit section query/path is present.

There is no `pushState`, `popstate`, or `hashchange` section router. Consequently, browser Back/Forward does not traverse ordinary section changes. A deep link can select Play on load; after navigation, the URL generally does not represent current section state.

## 4. Current User Experience

Desktop Play is a three-area workspace: a left opening/coach column, center board stage, and right status/moves/control column. The board stage contains top and bottom player bars, clocks, a 16px vertical evaluation bar, board, compact engine analysis, and editor overlay. The right column contains game status, moves/navigation, and controls.

Always rendered in Play markup, though CSS or state may hide them:

- board, evaluation bar, player names/ratings/clocks;
- opening title and coach/opening information;
- game-state console, move history, navigation;
- New Game, resign, undo, hint, download PGN, settings/menu;
- compact engine evaluation/PV area.

Conditional surfaces include:

- New Game, game-options, FEN, promotion, editor, embed, and information modals;
- analysis/opening panels based on `gameMode` and `.show-analysis`;
- resign only in engine mode;
- editor controls in edit mode;
- engine-versus-engine controls while that mode runs;
- mobile quick-action bar and analysis sheet;
- Mentor slide/push panel;
- active-game mobile CSS that hides the editor wrapper and right panel to prioritize the board.

The interface contains legacy-hidden elements retained solely because `app.js` queries their IDs. This confirms direct DOM compatibility coupling and duplicate visual/control generations.

## 5. File and Module Inventory

| File | Responsibility | Direct Dependencies | Runtime State Owned | Risk | Future Destination |
|---|---|---|---|---|---|
| `index.html` | Main SPA shell, Play markup, modals, all section markup and script order | chess.js 0.10.3, chessboard.js 1.0.0, global scripts | DOM attributes/classes/form values | High | SimplifiedPlayShell / PlayBoardStage |
| `app.js` | Board, game, clocks, modes, engine use, eval, controls, PGN, opening coach, editor and unrelated insight features | DOM IDs, `Chess`, `Chessboard`, `EngineRegistry`, `MentorAI`, opening/library globals | Global `App`, timers, moves, results, settings | Critical | Split across destinations 3–16 |
| `styles.css` | All shell, Play, board, eval, modal and responsive styling | Exact DOM hierarchy/classes | CSS state classes and geometry assumptions | High | SimplifiedPlayShell / PlayBoardStage |
| `js/caissa-navigation.js` | Section state, default landing, hooks, mobile navigation/actions | Section IDs, `window.App`, section globals | `currentSection`, nav state, mobile sheet | High | PlayNavigation |
| `js/caissa-primary-navigation.js` | Canonical primary-nav item metadata/routes | Navigation DOM | Static nav catalog | Low | PlayNavigation |
| `js/engine-registry.js` | Engine metadata and factory | `EngineAdapter` | Registry configuration | Medium | Chessboard Runtime / Advanced Options |
| `js/engine-adapter.js` | Generic UCI Web Worker wrapper | Worker scripts | readiness, callbacks, current FEN, search flags | High | Chessboard Runtime / EvaluationRail service |
| `engine/stockfish-working.js` + WASM | Bundled Stockfish execution | Web Worker/WASM | Engine process state | Medium | Chessboard Runtime |
| `stockfish-worker.js` | Legacy `StockfishEngine` fallback loaded in page | alternate worker URLs | independent worker/callback state | High | Legacy / Remove Candidate |
| `polyglot-book.js`, `book.bin` | Opening-book lookup and bot opening choice | chess.js position | loaded book | Medium | BotsPanel / Chessboard Runtime |
| `js/analyze-section.js` | Existing Analyze import, study board, live and full-game review | `App`, `Chess`, `EngineRegistry`, Analyze DOM | loaded game, analysis workers/tokens/results | Critical | Analyze Integration |
| `mentor-ai.js`, `mentor-prompts.js`, `llm-provider.js` | Persistent Mentor chat/context and prompt generation | global `App`, provider/API | settings, chat, current FEN/PGN/eval | High | Mentor Integration |
| `js/academy-section.js` | Academy faculty/mentor/course shell and progression UI | Academy DOM, storage/backend helpers | selected mentor/course/progress | Medium | Mentor Integration / CoachPanel |
| `js/endgame-trainer/*` | Coaching, session, board, progress and training-memory domain | separate rules/view/engine layers | independent training session/memory | Medium | Mentor Integration / CoachPanel |
| `knowledge/*` | Versioned knowledge units, taxonomy, release and consumer APIs | schemas/releases | immutable learning content | Low | Mentor Integration |
| `js/fics-client.js`, `js/fics-style12.js`, `css/fics-client.css` | FICS connection, lobby, clocks, board, PGN download | WebSocket gateway, Chessboard | independent online game/session | High | External System (FICS) |
| `js/arena-section.js` | Engine arena setup and status | core globals/DOM | separate match state | High | Legacy / Remove Candidate or BotsPanel |
| `js/spectator-tv-section.js` | Featured FICS observation UI | FICS client/catalog | spectator state | Medium | External System (FICS) |
| `js/caissa-board-interaction.js` | Reusable interaction contract/events | DOM/EventTarget | binding state | Low | Chessboard Runtime |
| `docs/architecture/CAISSA_BOARD_INTERACTION_API_V1.md` | Existing board-interaction boundary | corresponding module | None | Low | Chessboard Runtime |
| `chess-llm-platform/src/*` | Separate React/Vite experimental chess application | React, Zustand-like store, Stockfish adapter | independent game store | High | Legacy / Remove Candidate / Unknown |
| `tests/navigation-integrity.test.js` | Static/navigation contract checks | source text | None | Low | PlayNavigation tests |
| `tests/hotfix-9-2-1-help-game-options.test.js` | Static route/settings checks | source text | None | Low | PlayNavigation tests |

## 6. Routing and Navigation

`CaissaNavigation` owns section activation by removing `.active` from every `.content-section`, activating `${section}Section`, updating nav classes, invoking enter/exit hooks, and saving local navigation state. Entering Play calls `window.ensurePlayInitialized`; leaving Play does not destroy the board, stop the Play worker, remove resize/touch listeners, or stop a game clock. Section hooks do notify FICS, Analyze, Arena, Academy, and other modules where implemented.

The landing policy is explicitly CAISSA Classic:

- `/yahoo-classic` -> `yahooClassic`;
- `/academy` -> `academy`;
- explicit `?section=...` -> requested value;
- otherwise -> `yahooClassic`, ignoring stored prior section.

Routing risks:

- comments and tests refer to conflicting historical defaults;
- invalid `section` values can yield no matching section;
- URL and visible section drift after clicks;
- Back/Forward cannot restore section state;
- path maps cover only two embedded sections;
- middleware/server canonicalization rules add a second routing layer.

Mobile uses the same section state, plus bottom actions. Desktop and mobile do not have distinct routes.

## 7. Board Runtime

Core Play uses chess.js 0.10.3 for rules and chessboard.js 1.0.0 for rendering. `App.game = new Chess()` is the primary position model; `App.board` is the view.

Initialization is deferred until `#playSection` is active and `#chessboard` has measurable dimensions. `initializeBoard()` polls every 50ms until at least 300px (or 180px for compact/coarse conditions), creates one board guarded by `if (App.board) return`, resets `App.game`, schedules three resizes, and attaches window/document/board listeners.

Rules and interaction:

- FEN initializes through `Chess.load`; the board mirrors `App.game.fen()`.
- Orientation follows chosen color and `App.isFlipped`.
- desktop/fine-pointer interaction uses drag/drop; touch/coarse interaction uses click/tap source and legal-target markers;
- legality, castling, en passant, check, checkmate, repetition, insufficient material, and fifty-move draw are delegated to chess.js;
- promotion is detected before committing a move, stored in `App.pendingPromotion`, and completed through a modal;
- last-move/check visual behavior is predominantly chessboard.js/CSS plus status text; no accessible square-by-square board model is exposed;
- Undo removes one ply, or two in an engine game, then resets engine position;
- New Game resets chess state, history, clocks, UI, engine UCI state and orientation.

`App.board` prevents duplicate board construction in the ordinary path. However, `ensurePlayInitialized()` always calls `setupEventListeners()`, and navigation/open-modal flows can call it repeatedly. Some listeners have a `safeOn` marker guard, but direct modal/menu/editor listeners do not. Board-level listeners are attached inside one-time board creation, while control listeners remain at risk.

Analyze reuses the same core board and reassigns `App.game` to its own loaded game. FICS, endgame training, opening database, and experimental React use separate boards.

## 8. Game State and Lifecycle

State is fragmented:

- `App.game`: chess.js position and legal history;
- `App.moveHistory` plus `App.currentMoveIndex`: separate navigation history;
- `App.gameActive`, `gameMode`, `engineEnabled`, `enginePlaysAs`, `eveMode/eveRunning`, `analyzing`, and `editMode`: overlapping mode flags;
- `App.gameStatus`: display-oriented `{state,result,message}`;
- clocks: seconds, milliseconds, RAF IDs and legacy interval fields;
- DOM classes/visibility: active mode and surface state;
- localStorage: engine ID, Chess960, navigation state, FICS sound, Mentor/insight/learning settings;
- independent module state: Analyze, FICS, Arena, Academy, Mentor and training.

There is no serializable active-game aggregate, game ID, event log, persistence/recovery store, signed-in game ownership, or guest/signed-in branch in core Play. Reload loses the game. New Game modal supplies mode, color and time control; engine choice and Chess960 persist separately. Opponent identity is primarily labels/configuration rather than a Bot domain entity.

Lifecycle currently resembles:

`idle/section hidden -> board ready -> newGame -> active -> move/engine reply -> rules or manual termination -> result text -> another New Game`.

It lacks explicit preparing, awaiting-opponent, reconnecting, aborted, adjudicating, post-game, saved, and analyzed states.

## 9. Engine and Worker Lifecycle

Play creates an engine immediately on DOMContentLoaded—even when CAISSA Classic is the visible landing section. `EngineRegistry` normally constructs `EngineAdapter`, whose worker path is `engine/stockfish-working.js`. `stockfish-worker.js` also defines a legacy fallback.

The registry exposes Stockfish 16, Stockfish Lite, and Fairy-Stockfish as enabled; Arasan, Rodent III and Texel are disabled placeholders. The UI may select an engine; changing it terminates the old worker and creates another. `setSkillLevel()` currently forces depth 20, so visible historical strength semantics are not implemented through the adapter. Normal bot moves use a hard-coded 2,000ms search after optional Polyglot book selection.

One Play adapter performs both opponent move searches and live evaluation. It has single mutable `onInfo` and `onBestMove` callbacks. Search IDs are incremented but not checked in `handleMessage`; stale-result protection is mostly call-site FEN and mode checks. Starting/stopping analysis overwrites callbacks used by other operations.

New Game sends stop/`ucinewgame`/`isready`, but does not recreate the worker. Leaving Play does not terminate or suspend it. Game over stops analysis but not the worker. Page unload relies on browser cleanup.

Engine-vs-engine constructs two more engine instances and uses `eveSearchId`/flags to reject some late results. Analyze constructs its own engine and has stronger token/time-out ownership, but does not consistently terminate it on section exit. Opening database and endgame systems can create additional workers.

Error behavior updates engine status or logs errors. Core Play has no engine-failure termination result, retry policy, or user-visible degraded-game contract.

## 10. Evaluation Bar

The Play evaluation rail is `#evalBar`/`#evalFill`/`#evalScore` in `index.html`, styled by `styles.css`, updated by `app.js`.

- score normalization is from White's perspective in `EngineAdapter.normalizeScore`, based on side to move;
- centipawns use a sigmoid clamped to +/-1500 and become a vertical percentage;
- mate displays `M<n>` and maps to a fixed extreme fill;
- `eval-normal` grows the white area from bottom; `eval-flipped` changes the anchor;
- flipping rerenders the last cached score;
- every board resize explicitly fixes rail width to 16px and height to the board's smaller dimension;
- it is visible independent of opponent/fair-play mode;
- update frequency follows engine `info` callbacks containing depth/score/PV;
- missing elements silently no-op; engine errors affect engine status, not a rail-specific state;
- mobile keeps the vertical rail, while a separate horizontal mobile-analysis bar also exists.

Extraction difficulty is **medium-high**. Geometry and score conversion are small and reusable, but visibility, engine ownership, orientation, labels, and lifecycle are coupled to `App`, DOM IDs, and Play CSS. A reusable EvaluationRail needs a typed input such as `{state, score, mate, perspective, orientation, asOf, policyReason}` and must not directly start an engine. The future live/delayed/frozen/hidden/post-game/unavailable/loading/error states belong in an evaluation policy/service boundary. The board should reserve rail space through layout, not imperative pixel writes.

## 11. Existing Game and Opponent Modes

| Mode | Entry / Initialization | Board / Clock / Engine | Evaluation | Result / Post-game | State |
|---|---|---|---|---|---|
| Human vs engine | New Game `mode=engine` | Core board; local RAF clock; one selected engine + book | Same worker, live-capable | Rules/resign/timeout text; PGN download only | Functional code path; runtime E2E untested |
| Local human vs human | No clear current modal mode | Core chess.js could accept both sides, but flags/UI target engine/analysis/eve | Unrestricted | No dedicated ownership/result flow | Disconnected/unsupported |
| Analysis/study game | New Game analysis, FEN, PGN library | Core board and engine; no active game | Live | Export/manual navigation | Functional but overlaps Analyze |
| Engine vs engine | Button/New Game `eve` | Core board; two engine workers; local timing | Available | Stop/result text | Partial/experimental |
| FICS online human | FICS nav, connect/seek/accept | Separate FICS board/state; server clocks/style12; no Play engine | No core eval | Generates/downloads FICS PGN | Functional-looking separate system; live integration optional |
| CAISSA Classic tables | Classic section/FICS bridge | Separate Classic UI tied to FICS | No core eval | FICS-dependent | Partial integration |
| Arena | Arena section/start | Separate arena orchestration using engines | Arena-specific | Arena-specific | Partial/experimental |
| Spectator TV | Spectator section/featured FICS game | Separate spectator state/FICS | No Play rail | Observation only | Partial |
| Endgame training/practice | Dedicated routes | Separate board/session/coach/memory | Controlled training engines | Training outcomes/memory | Functional separate product |
| Friend challenge | Labels/aspirational surfaces only | None located | N/A | N/A | Placeholder/disconnected |
| Custom challenge/quick online game | FICS seek fields provide server challenges | FICS | None | FICS | External; not core Play |
| Tournament entry | UI references but no core Play lifecycle located | None | N/A | N/A | Placeholder/disconnected |
| React chess-LLM platform | Separate subproject | React board/store/adapter | Separate | Separate | Experimental duplicate |

No current mode enforces the future evaluation policy. Human rated/casual/assisted distinctions do not exist in core Play.

## 12. Controls and Actions Inventory

| Existing Capability | Current Location | Functional State | Owner | Future Destination | Preserve / Refactor / Retire |
|---|---|---|---|---|---|
| New Game / Start Game | header/controls/mobile/modal | Calls `newGame(options)` | `app.js` + navigation | Unified Game Lifecycle / mode panels | Refactor |
| Mode select | New Game modal | engine, analysis, eve | `app.js` | BotsPanel / Advanced Options | Refactor |
| Color select | New Game modal/menu | Sets orientation and bot side | `app.js` | BotsPanel / Advanced Options | Preserve behavior, refactor state |
| Time controls | New Game modal | 0/selected seconds | `app.js` | Clock System / Advanced Options | Refactor |
| Engine select | Game Options modal | Recreates engine | `app.js`, registry | BotsPanel / Advanced Options | Preserve adapter, refactor ownership |
| Engine strength | Legacy/modal references | Adapter ignores level and uses full power | `app.js`, adapter | BotsPanel | Retire current semantics/redefine |
| Chess960 | Game Options | Persisted; only supporting engine enables it | `app.js`, registry | Advanced Options | Refactor |
| Resign | right controls | engine/eve only; confirm dialog | `app.js` | Unified Game Lifecycle | Refactor |
| Draw | No core Play handler located | Absent | Unknown | Unified Game Lifecycle | Requires decision |
| Undo | right/mobile/menu | one ply or two for engine | `app.js` | Advanced Options / mode policy | Preserve, policy-gate |
| Hint | right/mobile | Starts/uses analysis path | `app.js` | CoachPanel | Refactor |
| Flip board | controls/menu | Functional, syncs eval | `app.js` | PlayBoardStage | Preserve |
| Sound | FICS only | persisted toggle | FICS client | External System (FICS) / Advanced Options | Refactor if unified |
| Settings/Game Options | header/mobile/menu | Functional modal | navigation + `app.js` | Advanced Options | Refactor |
| Paste/load/share FEN | menu/modal/query | Functional analysis position | `app.js` | Advanced Options / Analyze Integration | Preserve |
| Edit board | menu/editor overlay | Functional-looking setup mode | `app.js` | Advanced Options / Analyze Integration | Move out of primary Play |
| Engine vs engine | button/menu/modal | Partial/experimental | `app.js` | BotsPanel or Legacy | Product decision |
| Move navigation | right column/legacy controls | Functional | `app.js` | PostGameExperience / Analyze | Preserve |
| Download/export PGN | right/mobile/menu | Blob download | `app.js` | PostGameExperience | Preserve, centralize |
| Import PGN/library | legacy Play + Analyze | Multiple loaders | `app.js`, Analyze | Analyze Integration | Consolidate |
| Analyze game | menu/Play analysis | Shows Play analysis panels; separate Analyze exists | `app.js`, Analyze | Analyze Integration | Retire duplicate path |
| Mentor | header/menu/panel | Reads global FEN/PGN/eval | MentorAI | Mentor Integration | Preserve via contract |
| Opening coach | left panel | ECO/theory guidance; default enabled | `app.js` | CoachPanel | Refactor |
| Rematch | None | Absent | Unknown | PostGameExperience | Add later |
| Save/copy PGN | Download only | Copy/save record absent | `app.js` | PostGameExperience | Extend later |
| Play friend/players list/game list | FICS/Classic surfaces | Separate or partial | FICS/Classic | GamesPanel / PlayersPanel / External | Adapt |
| Seek/custom challenge | FICS section | Server-dependent | FICS client | GamesPanel / External System | Adapt |
| Tournaments | References/placeholders | Disconnected | Unknown | GamesPanel / External | Decide |
| Test/diagnostic controls | standalone harnesses/debug pages | Development-only | harnesses | Legacy / Remove Candidate | Keep out of shell |
| Close/reset modal actions | multiple modals | Mixed direct handlers | `app.js` | SimplifiedPlayShell | Refactor to one modal system |

## 13. Game Completion and Results

Core automatic completion uses chess.js:

- checkmate -> winner and `1-0`/`0-1`;
- stalemate, threefold, insufficient material, and generic `in_draw()` (which includes the fifty-move rule in this chess.js version) -> `½-½`;
- timeout -> local clock winner;
- resignation -> opponent winner;
- engine-vs-engine manual stop -> non-standard “Match stopped”.

Completion stops the clock. Rule completion stops active analysis; resignation calls it directly. Workers remain alive. UI is inline result/status text plus a custom `caissa-game-end` event, not a post-game modal. `App.gameStatus` stores display strings rather than normalized termination enums.

Not implemented in core Play:

- draw offer/agreement;
- disconnect/reconnect or abort;
- online server adjudication;
- engine-failure result;
- explicit fifty-move reason in the result model;
- automatic PGN headers/result persistence;
- saved-game recovery;
- rematch;
- post-game Analyze/Mentor actions.

PGN exists only in the live chess.js object until download or Mentor context capture. Reload loses it.

## 14. PGN and Analyze Integration

Core Play can generate complete movetext with `App.game.pgn()` and download it. Mentor also reads it directly from global `App`. Analyze can import pasted text, uploaded files, library entries, and create a study-board model; it can analyze a complete loaded game.

There is no reliable Play-to-Analyze handoff contract today:

- no query parameter for PGN;
- no session/local storage handoff;
- no shared route-state payload;
- no `AnalyzeSection.openGame(pgn)` public adapter identified;
- menu “Analyze Game” primarily toggles analysis UI inside Play rather than navigating to the existing Analyze section.

FEN deep links load into Play, not Analyze. Analyze and Play share the global board and, during study, Analyze assigns its game into `App.game`; this is coupling, not a safe integration API.

Season 10 must preserve `App.game.pgn()` output compatibility and Analyze's loader behavior. The recommended handoff is an explicit in-memory/session-scoped transfer object with `{pgn, initialFen?, sourceGameId?, returnTarget?}`, plus a documented Analyze entry function. Query strings should carry only an ID or FEN, not large PGN. Analyze remains the single full-game analyzer.

## 15. Mentor, Coach, and Knowledge Integration Opportunities

Existing assets:

- `MentorAI.updateContext()` reads current FEN, PGN and evaluation from `App`;
- Mentor prompt/provider modules support contextual conversations;
- `js/academy-section.js` defines mentors, faculties, courses, recommendations, and progress surfaces;
- `js/endgame-trainer/endgame-training-memory.js` and progress/session modules offer consent-aware training memory patterns;
- `knowledge/schema`, taxonomy, releases and `knowledge/consumer/library-reader.js` provide controlled educational content;
- Endgame coaching and feedback renderers demonstrate pedagogical state separate from engine moves;
- Insights and Coach Report derive patterns/training plans from PGNs.

These systems can support post-game Mentor review, but direct coupling to Play would worsen global-state ownership. Define a read-only `CompletedGame`/`LearningReviewRequest` contract containing normalized PGN, result, termination, player identity/color, time control, evaluations/critical moments when policy permits, consent, and source. Mentor chooses explanations and next steps; Coach controls in-game pedagogy; neither should own the game engine or mutate the live board.

“Current Mentor” is represented in Academy/Mentor UI and storage, but there is no single verified cross-product Mentor identity service. That is **Unknown / Requires Decision**.

## 16. Responsive and Mobile Findings

Static CSS inspection covers the requested widths through breakpoints at 1,400, 1,200, 1,180, 1,050, 1,024, 950 landscape, 900, 768, 767, and 480px. No existing Play screenshot matrix or browser suite verifies all requested viewports.

Expected behavior by requested viewport:

| Viewport | Static finding |
|---|---|
| 320x568, 375x667, 390x844, 412x915 | <=480/768 rules stack Play, use width calculations with safe-area insets, retain 16px rail, bottom quick actions, and may hide right panel during active play. 180px initialization floor avoids deadlock. |
| 768x1024 | Boundary activates mobile rules; multiple historical and final overrides apply. High regression sensitivity. |
| 1024x768 | Tablet/desktop breakpoint combination compresses columns; 1,050px rules allow overflow/stacking. |
| 1366x768, 1440x900 | Three-column layout; vertical height and side-panel scrolling are limiting factors. |
| 1920x1080 | Desktop max sizing leaves board constrained by CSS rather than scaling indefinitely. |

Positive controls include `min-width:0`, `overflow-x` containment, safe-area calculations, orientation-change resize, visual-viewport board visibility adjustment, coarse-pointer tap mode, and reduced-motion overrides.

Risks:

- many later overrides target the same selectors, making cascade order the true layout architecture;
- body, section, side panels, move list and modals can create nested scroll regions;
- active mobile gameplay hides controls/status instead of providing an explicit drawer state;
- imperative rail height and board resize race layout;
- `100vh`/visual viewport/header/bottom reserve calculations can disagree under mobile browser chrome;
- 768px is simultaneously a device target and breakpoint edge;
- no automated clipping/overflow assertions exist for the nine required sizes.

No screenshots were generated because the repository has no focused Play browser baseline and this documentation task must leave no artifacts.

## 17. Accessibility Findings

Strengths:

- most visible controls are semantic `<button>` elements with labels/titles;
- nav uses `aria-current`;
- mobile hidden controls use `hidden`, `aria-hidden`, and `inert`;
- modals record/restore focus and include a focus-containment path;
- keyboard shortcuts and move navigation exist;
- reduced-motion CSS is present;
- FICS has live/status labels and structured lobby roles.

Gaps:

- chessboard.js renders visual divs/images without a verified keyboard-operable 64-square model, coordinates, piece labels, or screen-reader move announcements;
- tap/drag legal targets and check/evaluation states rely substantially on color/visual position;
- `#evalBar` has a title but no dynamic accessible value, mate/perspective/policy description, or `role=meter`;
- global keyboard handlers can conflict across sections, despite some editable-target guards;
- confirm dialogs and several custom modals are not proven to trap focus consistently;
- compact controls may fall below recommended target size at phone/landscape breakpoints;
- hidden compatibility controls risk duplicate focus targets if CSS regresses;
- focus order across board, rail, side panels and mobile bottom bar is not tested;
- no Play-specific axe/browser accessibility test exists.

## 18. Performance Findings

- `index.html` loads a large number of global scripts and section markup at startup; Play engine creation is eager even when Classic is visible.
- Core Play, Analyze, Arena, opening database, endgame, and FICS can each retain independent boards/workers/state.
- Play adds window resize/orientation and document/board listeners without a destroy path.
- board initialization polls at 50ms until visible and schedules several resizes.
- `setupEventListeners()` is callable repeatedly; marker-guarded `safeOn` coexists with unguarded direct listeners.
- Play clock uses RAF correctly and cancels it at common termination points, but legacy interval state remains.
- object URLs for PGN downloads are revoked.
- route switching does not release Play worker, timers, board, or listeners.
- large `app.js` and `styles.css` prevent section-level loading and make parse/evaluation costs universal.
- local piece images and bundled engine assets reduce network dependency; chess.js/chessboard.js still load from CDNs.

Mobile memory pressure is chiefly multiple WASM workers and an always-loaded multi-section shell. Season 10.1 should introduce ownership and teardown contracts before lazy-loading optimization.

## 19. Existing Tests and Coverage Gaps

| Test | Type | Covered | Missing |
|---|---|---|---|
| `tests/navigation-integrity.test.js` | Static integration/contract | nav IDs, routes, Classic default and redirect contracts | Real clicks, history, cold browser load, Play board |
| `tests/hotfix-9-2-1-help-game-options.test.js` | Static validation | help/settings route wiring and Play navigation source patterns | Modal runtime/focus and game behavior |
| `tests/indexnow.test.js` | Static | canonical URL list includes `?section=play` | Runtime route |
| `tests/yahoo-classic-seo.test.js`, `tests/blog-foundation.test.js` | Static/HTTP | Classic canonical/default relationships | Play lifecycle |
| `tests/clarity-integration.test.js` | Static | page metadata/script integration | Play runtime |
| `tests/endgame-trainer/caissa-board-interaction-contract.test.js` | Unit/contract | reusable board interaction API | Core Play binding |
| `tests/endgame-trainer/stockfish-worker-factory.test.js` | Unit | endgame worker URL/factory validation | `EngineAdapter`, Play stale response/termination |
| `tests/browser/endgame-*.spec.js` | Browser | endgame experiences | Core Play/mobile |
| `gateway/.../style12.test.cjs` | Unit | FICS protocol parsing | Live FICS-to-board lifecycle |

No focused core Play tests were located for legal interaction, tap-to-move, promotion, castling/en passant, new game, undo, clock accuracy, game completion, PGN preservation, engine lifecycle, eval orientation, section cleanup, reload/recovery, or the nine target viewports. Existing Play-adjacent tests are mainly static source assertions and do not establish runtime functionality.

## 20. Architectural Risks

| Severity | Risk | Evidence / Affected Files | Likelihood / Impact | Recommended Mitigation | Timing |
|---|---|---|---|---|---|
| Critical | Game-state fragmentation | `App`, DOM classes, Analyze/FICS/Arena module state; `app.js`, `js/analyze-section.js`, `js/fics-client.js` | High / Critical | Define immutable game snapshot + lifecycle reducer/service | Before 10.1 UI migration |
| Critical | Accidental engine assistance in human games | Eval has no mode policy; same engine supports moves/eval; `app.js`, adapter | High future / Critical | Fair Play Policy gate above engine/eval, default deny for human | Before human mode unification |
| Critical | Analyze mutates Play globals | `AnalyzeSection.ensureStudyBoard/resetStudyBoard` assigns `App.game`; shared board | High / Critical | Explicit Analyze adapter and isolated state | Before 10.1 |
| High | Duplicate event listeners | repeated `ensurePlayInitialized -> setupEventListeners`; mixed guarded/direct handlers | High / High | Idempotent binding registry or component mount/unmount | Before 10.1 |
| High | Stale engine messages/callback collision | one mutable `onInfo/onBestMove`; search IDs not enforced in adapter | High / High | Request tokens, ownership, cancellation and FEN validation in service | Before 10.1 |
| High | Worker leaks/resource retention | eager worker; no section-exit teardown; multiple subsystems | High / High | Worker manager with acquire/release and diagnostics | During foundation, before mode growth |
| High | Incomplete result/PGN loss | display-string result, reload loss, no post-game store | High / High | Normalized termination model and completed-game snapshot | Before PostGameExperience |
| High | Routing/default conflicts | Classic default, stale comments, query-only deep link, no history | Medium / High | Canonical route table and history contract | During 10.1 shell |
| High | Direct DOM/global coupling | thousands of ID queries and `window.*`; `app.js`, navigation, Mentor | High / High | Ports/adapters around board, engine, navigation, Mentor | Before visual migration |
| High | Mobile clipping/cascade brittleness | numerous repeated Play breakpoints/selectors | High / High | Layout contract + viewport Playwright matrix | During 10.1 |
| High | Clock inconsistency | local RAF vs FICS server clocks; no increment/domain model | Medium / High | Clock interface with authoritative source and events | Before GamesPanel |
| High | Promotion/tap regressions | interaction state embedded in global handlers, no tests | Medium / High | Characterization browser tests before extraction | Before 10.1 |
| High | Eval orientation/perspective error | adapter normalizes White perspective, rail independently flips anchor | Medium / High | Typed perspective/orientation contract + tests | Before EvaluationRail extraction |
| Medium | Duplicate board initialization | guarded core board, but multiple product boards and shared `#chessboard` assumptions | Medium / High | Board factory/mount ownership and unique IDs | During 10.1 |
| Medium | LocalStorage compatibility | unversioned keys and direct access | Medium / Medium | Versioned settings repository + migrations | During 10.1 |
| Medium | Global-variable collisions | `App`, `Chess`, registries and many window exports | Medium / High | Modules/namespaces and dependency injection | During 10.1 |
| Medium | Accessibility regression | visual board/eval, hidden duplicate controls, untested modals | High / Medium | Accessibility acceptance contract and axe/keyboard tests | Before visual rollout |
| Medium | Brittle CSS selectors | ID/hierarchy specificity and late overrides | High / Medium | New scoped shell tokens/layout, parity screenshots | During 10.1 |
| Medium | Performance regression | eager scripts/workers and repeated resize/listener work | Medium / Medium | lifecycle instrumentation and lazy service activation | During 10.1 |
| Medium | Analyze handoff failure | no public handoff contract | High / Medium | Session/in-memory transfer + integration test | Before post-game actions |
| Low | Engine failure ambiguity | logged/status only, no termination semantics | Medium / Medium | degraded/error lifecycle state and retry UX | During lifecycle work |

## 21. Migration Matrix

| Existing Function | Proposed Destination | Reusable As-Is | Refactor Required | Risk | Notes |
|---|---|---:|---:|---|---|
| Section activation | PlayNavigation | No | Yes | High | Add URL/history contract |
| Play outer markup | SimplifiedPlayShell | No | Yes | High | Preserve IDs only through temporary adapters |
| Board/player layout | PlayBoardStage / PlayerHeader | Partial | Yes | High | Characterize responsive geometry first |
| chess.js rules | Chessboard Runtime | Yes | Wrapper | Medium | Upgrade is separate scope |
| chessboard.js rendering | Chessboard Runtime | Partial | Yes | High | Add accessible adapter |
| drag/tap interaction | Chessboard Runtime | Partial | Yes | High | Preserve contract and add tests |
| promotion flow | Chessboard Runtime / Unified Lifecycle | Partial | Yes | High | Modal becomes lifecycle effect |
| RAF clocks | Clock System | Partial | Yes | High | Abstract local/server authority |
| `newGame()` | Unified Game Lifecycle | No | Yes | Critical | Split reducer/state from effects |
| human-vs-engine setup | BotsPanel | Partial | Yes | High | Introduce Bot model/personality |
| opening book | BotsPanel | Yes | Wrapper | Medium | Policy belongs to Bot |
| opening coach | CoachPanel | Partial | Yes | Medium | Pedagogy separate from opponent |
| engine registry | Advanced Options / Runtime | Yes | Minor | Medium | Metadata is useful |
| engine adapter | Runtime service | Partial | Yes | High | Add request ownership/cancellation |
| eval bar math/render | EvaluationRail | Partial | Yes | High | Rail receives state, never owns engine |
| move list/navigation | GamesPanel / PostGameExperience | Partial | Yes | Medium | One history source |
| resign | Unified Game Lifecycle | Partial | Yes | Medium | Normalized command/result |
| undo/hint | Advanced Options / CoachPanel | Partial | Yes | High | Mode policy |
| PGN export | PostGameExperience | Yes | Wrapper | Medium | Add headers/result/copy/save |
| Play analysis mode | Analyze Integration | No | Yes | Critical | Consolidate with Analyze |
| Analyze loader/runtime | Analyze Integration | Partial | Yes | High | Add public handoff; isolate globals |
| Mentor context capture | Mentor Integration | Partial | Yes | High | CompletedGame/read-only context |
| FICS client | External System (FICS) | Partial | Adapter | High | Translate server events to lifecycle |
| Arena/eve | BotsPanel or Legacy | Partial | Decision | Medium | Do not expose as primary mode by default |
| Friend/tournament placeholders | GamesPanel/PlayersPanel | No | Yes | Medium | Product/backend decision |
| mobile quick actions | SimplifiedPlayShell | Partial | Yes | Medium | Derive from active panel/mode |
| legacy hidden controls | Legacy / Remove Candidate | No | Yes | Medium | Remove only after adapter migration |

## 22. Recommended Boundaries for Season 10.1

1. **SimplifiedPlayShell** owns desktop/mobile composition and active panel only.
2. **PlayNavigation** owns canonical route, query compatibility and history.
3. **UnifiedGameLifecycle** owns normalized state, commands, results and completed-game snapshots.
4. **ChessboardRuntime** owns one chess.js position, board mount, interaction and promotion requests; it exposes events without querying unrelated UI.
5. **ClockSystem** consumes lifecycle events and supports local/server authority.
6. **EngineService** owns workers, request IDs, cancellation and bot/evaluation isolation.
7. **EvaluationPolicy + EvaluationRail** decide availability and render state separately.
8. **Games/Bots/Coach/Players panels** configure lifecycle commands; they do not own the board.
9. **PostGameExperience** receives an immutable completed game and offers rematch/export/Analyze/Mentor actions.
10. **AnalyzeAdapter** is the only bridge to existing Analyze; **MentorAdapter** is a read-only educational bridge.

Before moving UI, add characterization tests for cold Play load, New Game as White/Black, desktop drag, mobile tap, promotion, undo, flip/eval orientation, timeout/checkmate/draw, PGN export, engine cancellation, section exit/re-entry, and requested viewport overflow.

## 23. Open Questions

1. Is CAISSA Classic still the canonical default landing, or should Season 10 make Play the default?
2. Does “Games” mean local setup, FICS matchmaking, a future CAISSA server, or an aggregation of all three?
3. Which existing Arena/engine-vs-engine functionality remains user-facing?
4. Is local human-versus-human a supported product mode?
5. Which engine evaluations, hints, undo actions and Coach interventions are permitted per rated/casual/training mode?
6. What is the authoritative Bot catalog, rating mapping, personality schema and strength behavior?
7. What persistent identity selects the current Mentor across Mentor AI, Academy and training?
8. Where should completed games persist for guests and signed-in users, and what consent applies to learning memory?
9. Is FICS the initial human-games backend, and how should its server result/clock/disconnect events map into the unified lifecycle?
10. Should Chess960 remain an advanced Play option, and which modes support it?
11. What compatibility period is required for `?section=play`, `?fen=...`, direct `index.html`, and legacy hidden control IDs?

## 24. Proposed Next Task

**SEASON 10.0.2 — CAISSA Simplified Play Architecture Blueprint**

Produce a documentation-only blueprint that:

- resolves or explicitly records the open product decisions above;
- defines component/service boundaries and dependency direction for all 20 classification destinations;
- specifies the normalized game, participant, mode, clock, result, termination, Bot, evaluation-policy, completed-game, Analyze-handoff and Mentor-review contracts;
- diagrams initialization, move, engine request/cancellation, completion, rematch, Analyze and Mentor sequences;
- defines routing/deep-link/history compatibility;
- defines worker ownership and section lifecycle;
- specifies desktop/mobile layout contracts and accessibility requirements;
- maps an incremental strangler migration from existing globals/DOM IDs with rollback points;
- establishes characterization and acceptance test matrices, including all nine required viewports;
- identifies explicit non-goals and fair-play security boundaries.

The blueprint must not redesign production UI or implement code. Its primary output should be an executable architectural contract for Season 10.1, retaining the current board and Analyze infrastructure behind adapters while ownership is separated.
