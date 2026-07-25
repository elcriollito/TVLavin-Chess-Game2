# Season 10.1 Endgame Trainer V2 Shell and Quick Challenge

## Baseline and repository findings

Implementation began from `main` at `ee4a459273cafd7f9f98fb2af2a6a08dca972a62`, equal to `origin/main`, with a clean worktree. Season 10.0 is authoritative.

The audit found the stable board view, rules facade, V1 controller/runtime, SafeEngineAdapter, separate Trainer and Knowledge progress domains, immutable released Knowledge content, and canonical navigation suitable for reuse. The existing general feature-flag helper carries unrelated stored flags, so this isolated pilot uses a strict query allowlist instead of extending persistent global flag state.

## Release and flag boundary

Season 10.1 is opt-in and does not change default `/endgame-trainer`. V2 activates only with `trainerV2=1`. Any Guided Study parameter (`studyUnit`, `release`, `activity`, or `reviewFrom`) takes precedence and mounts V1. Other flag values do not activate the pilot.

## Product surface

The Modes dialog contains exactly Quick Challenge, Knowledge Practice, Endgame Run, and Custom Lab. Only Quick Challenge runs in V2. Knowledge Practice routes to Endgame Library, Custom Lab routes to unflagged V1, and Endgame Run is a non-interactive “Coming later” card.

The board remains the primary surface. One **Start Challenge** action creates and starts the session; V2 has no setup form or Prepare/Start gate. Feedback leads to Continue, and completion exposes a local summary, replay, and exit.

## Executable contracts

`endgame-v2-contracts.js` owns exact activation, four complete versioned mode definitions, source/objective allowlists, score policy, timer formatting, and creation/validation of `caissa:endgame-session` schema `2.0.0`. Runtime fields cover identity and source versions, lifecycle, counts, streak, score, timer, hints, local-unverified trust, and no-persistence eligibility.

`quick-challenge-fixture-pool.js` owns immutable pool `caissa-quick-challenge-technical-pilot` version `1.0.0`. Five stable positions include FEN, side, `only-move` objective, exact legal LAN/SAN answer, difficulty, verification state, integrity value, once-per-session policy, local-unverified trust, authored hint, and release/unit/activity provenance.

The only evaluator is `authored-exact-legal-move`. Success means a legal move equals the authored move; a different legal move ends in unsuccessful feedback; skip and answer reveal end neutrally at zero points. There is no timeout and no tablebase or best-move claim.

## Runtime ownership and state machine

The flag gate runs before V1 mounts. V2 creates one `EndgameBoardView` on the existing element and one `QuickChallengeOrchestrator`; it creates no V1 runtime/controller, engine adapter, Worker, Trainer store, or Knowledge store. `ChessRulesFacade` provides legality and exact-answer evaluation.

The guarded happy path is:

`configured → loading → ready → active → evaluating → feedback → loading-next → active … → completed`

Neutral branches are `unavailable`, `recovering`, and `error`; explicit exit reaches `abandoned`. Actions outside their owning state return false without mutation. A generation token prevents a late load from owning a newer or abandoned session. Every fixture is used at most once in fixed order.

Invalid or failed loads enter neutral unavailable/recovering handling and never change score or streak. The UI offers retry, continue, or exit. Invalid move intents do not advance. Abandonment invalidates pending ownership.

## Score, hint, streak, timer, and summary

`challenge-score-v1-preview` is always labelled **Local practice score**:

- independent correct: 100;
- correct after authored clue: 50;
- answer reveal, incorrect, or skip: 0;
- technical/unavailable: neutral.

The first Hint action reveals a concise authored clue. It then becomes **Reveal answer**; revealing completes the item without independent points. No hint creates failure or educational evidence.

The displayed streak is independent success only. Assisted, incorrect, revealed, and skipped items reset it; unavailable/technical states preserve it. Nothing persists as Personal Best.

The monotonic local timer starts when an item becomes active and stops at committed feedback. Loading is excluded. Hidden-tab throttling, device sleep, and process suspension may delay display refresh; the next monotonic sample catches up, but the value is not server-attested or competitively comparable. There is no pause contract.

The completion summary reports handled positions, successful objectives, independent and assisted successes, skips, unavailable items, local score, best streak, and local elapsed time. It explicitly denies rating, rank, Mastery, and cloud-save meaning.

## Persistence, evidence, and compatibility

All state is in memory and disappears on refresh/navigation. Quick Challenge never writes `caissa:learning-progress:v1`, `caissa:endgame-trainer:progress:v1`, Mastery, recommendations, review evidence, or cloud state.

Default V1, its controls, Training Memory, engine ownership, Guided Study, immutable releases, consent, canonical navigation, and historical query URLs remain intact. The V2 shell is hidden in static HTML and CSS is scoped by `.is-v2`.

## Responsive and accessibility behavior

The existing board-first container is reused. Metrics collapse four-to-two-to-one columns, the summary collapses to one column, controls have 44px minimum targets, and the Modes dialog becomes a safe-area-aware near-full-width mobile sheet without intentional horizontal overflow. Reduced-motion preferences suppress V2 transition/animation duration.

Controls use native buttons/links. Objective and feedback are textual; feedback has a polite live region and is not color-only. The native modal supplies focus containment and Escape behavior, has a labelled close control and safe backdrop close, and returns focus to its opener. Mode changes during a live session require confirmation. These are implemented measures, not a claim of complete accessibility certification.

## Security, performance, rollout, and rollback

Mode, source, objective, schema, pool, and flag values are allowlisted. FEN/answers pass the rules facade, fixture/session definitions are frozen, duplicate fixture IDs are rejected, transitions and completion are guarded, and local scores never receive elevated trust. There is no runtime content generation, remote flag service, account dependency, remote pool, or HTML injection.

The five-fixture module is local and small, requires no data fetch, does not start Stockfish, and changes positions without remounting the board. Observed measurements belong in the release report because they depend on the validation environment.

Rollout is per-request with `?trainerV2=1`; V1 stays default. Removing the parameter is immediate rollback. Removing the flag branch/modules is code rollback and requires no data migration.

## Validation and known limitations

Tests cover the flag and Guided precedence, complete mode/session/source/objective contracts, legal immutable fixtures, fixed selection, score/hint/reveal semantics, full happy path, invalid transitions, unavailable/recovery/abandon/stale ownership, duplicate Continue, hidden default shell, summary/mode markup, one board, and absence of engine/persistence imports. Release gates cover V1, Guided Study, Knowledge, navigation, disclosure, public artifacts, and immutable release integrity.

The answers are authored and legal, not independently tablebase-certified. The pool is not calibrated, randomized, adaptive, competitive, or tamper-resistant. Timer and score are local, there is no pause, and results disappear on refresh. Automated coverage does not substitute for a full assistive-technology matrix.

Season 10.2 should add a dedicated runtime fixture validator, repository-standard browser interaction/accessibility coverage when a harness is available, an asynchronous evaluator adapter with neutral failure tests, and a chess/editorially verified pool expansion. V2 promotion should remain a separate rollout decision.
