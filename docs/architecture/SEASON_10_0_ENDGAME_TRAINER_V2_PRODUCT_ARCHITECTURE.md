# Season 10.0 — Endgame Trainer V2 Product Architecture

Status: approved architecture baseline
Scope: product and technical architecture only
Production behavior changed: no
Authorized baseline: `3d085629cf8a12f92322d79f1d058b91085ca322`

## 1. Executive summary

Endgame Trainer V2 will add one product orchestration layer above the stable Board API,
engine, generated-position pipeline, released-activity runtime, and persistence systems.
It will not create another chess runtime or another educational evaluator.

The surface principle is **simple on the surface, deep underneath**. Quick Challenge
will eventually become the low-friction entry. Knowledge Practice will delegate to
the released Knowledge activity runtime. Endgame Run will use immutable curated
pools only when comparable scoring is enabled. Custom Lab will retain the complete
V1 generated-position experience.

Season 10.0 does not implement visible V2 behavior. It establishes decisions,
contracts, ownership boundaries, migration gates, and the Season 10.1 component map.

## 2. Baseline verification

The repository was verified before documentation:

- branch: `main`;
- local HEAD: `3d085629cf8a12f92322d79f1d058b91085ca322`;
- `origin/main`: `3d085629cf8a12f92322d79f1d058b91085ca322`;
- divergence: 0 behind, 0 ahead;
- worktree: clean, with no untracked files;
- pinned Knowledge release:
  `rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84`;
- Knowledge schema: `1.1.0`;
- taxonomy: `1.4.0`;
- official test baseline: 888 tests.

The immutable release and Knowledge Units are inputs to V2, not mutable session
state.

## 3. Current Trainer audit

### 3.1 Route and entry

`endgame-trainer.html` is served at `/endgame-trainer`.
`js/endgame-trainer/endgame-trainer-page.js` mounts the page and creates one
`createEndgameTrainerRuntime`. Query handling is limited to:

- `studyUnit`, `release`, `activity`, and `reviewFrom` for released Guided Study;
- `diagnostic=1` for local diagnostics.

Free Practice setup is not represented by a versioned route contract. Bookmarks
cannot encode a complete generated-position setup.

### 3.2 Controls before first play

The default Setup surface exposes seven controls:

1. Training Mode;
2. Piece Count;
3. Category;
4. Play As;
5. Engine Strength;
6. Prepare Position;
7. Start Training.

Play As is visibly disabled and fixed to White in the current beta. Defaults exist,
but the learner must still activate Prepare and then Start before board input is
enabled.

### 3.3 Setup lifecycle

The page synchronizes piece-count and category options in DOM code. Prepare creates
a timestamp-derived seed and asks the binding to select one of 24 candidates. Start
then moves the prepared controller from `ready` to the learner or engine turn.
Engine initialization is part of preparation.

### 3.4 Session lifecycle

`EndgameSessionController` version `1.0.0` owns:

`idle → preparing → ready → user-turn ↔ engine-thinking → completed|resigned|error`

It also supports restart, new position, undo, flip, resign, and dispose. It does not
model configured, paused, evaluating, feedback, loading-next, recovering, a
multi-item session, or a restorable competitive session.

### 3.5 Generated-position pipeline

The real pipeline is:

`material catalog → seeded generator → position validator → feature extractor →`
`position scorer → exercise classifier → theme validator → candidate selector`

Relevant modules:

- `endgame-material-catalog.js`: categories and material;
- `endgame-position-generator.js`: seeded procedural candidates and KRPvKR templates;
- `endgame-position-validator.js`: legal and category-specific validation;
- `endgame-position-features.js`: descriptive geometry;
- `endgame-position-scorer.js`: position-quality heuristic;
- `endgame-exercise-classifier.js`: descriptive exercise class;
- `endgame-theme-validator.js`: educational/theme constraints;
- `endgame-candidate-selector.js`: deterministic selection and recent-position penalty;
- `endgame-rook-pawn-templates.js`: bounded KRPvKR fallback.

The heuristic score describes candidate quality. It is not learner score and is
not a calibrated competitive difficulty measure.

### 3.6 Categories, pieces, side, and strength

Current categories are KQK, KRK, KPK, KPKP, and KRPvKR. Piece count selects
compatible category sets for 3, 4, or 5 pieces, or random supported material.
Free Practice enforces White as strong side, side to move, and learner side during
the beta. Engine strength uses four page presets mapped to Stockfish options.

Piece count is a material filter, not difficulty.

### 3.7 Educational validation

Generated candidates are legal, structurally validated, scored, classified, and,
for bounded lessons, checked against theme and role. This supports useful practice.
It does not establish tablebase truth or cross-position competitive equivalence.

### 3.8 Board and engine

- `EndgameBoardView` implements Board API v1 behavior.
- `EndgameSessionBoardBinding` projects controller state, reuses the board, applies
  incremental moves, and blocks input when work is pending.
- `SafeEngineAdapter` owns initialization, UCI readiness, timeouts, cancellation,
  replacement, and transport generations.
- `stockfish-worker-factory.js` creates isolated Worker transports.
- Stale operations are guarded by controller and binding generations, session IDs,
  FEN ownership, and operation IDs.

One page runtime owns one board and one engine adapter. New positions do not remount
the board.

### 3.9 Coaching, hints, and objectives

`endgame-coach.js` generates deterministic coaching from explicit context.
The first three themed hint stages are instructional. The fourth requests a legal
engine move. Hint count and level are stored in controller state.

Objectives are learner-facing strings derived from a lesson, KRPvKR metadata, or
exercise classification. They do not yet declare versioned success, failure,
timeout, score, source, or evaluator contracts.

### 3.10 Evaluation and next position

`ChessRulesFacade` owns legal moves and terminal chess state. Stockfish supplies
opponent moves and final hint analysis. KQK/KRK checkmate by the learner becomes
`exerciseOutcome=completed`; many other terminal positions remain `unknown`.
New Position uses the prior normalized options and a new seed.

There is no item feedback phase or preloaded next-item handoff.

### 3.11 Timer and scoring

There is no active session timer, countdown, time bonus, competitive score, or
Personal Best. Duration is calculated at terminal persistence time. The visible
Heuristic score is candidate-position quality and must not be reused as learner
score.

### 3.12 Persistence, Mastery, and Recommendation

Traditional Trainer data is stored under
`caissa:endgame-trainer:progress:v1`. The store records prepared, started,
terminal, recent, curriculum, and Training Memory state. It supports bounded
history, migration, import/export, reset, cross-tab refresh, and corruption-safe
fallback.

`endgame-training-memory.js` calculates legacy theme “mastery” summaries and a
local recommendation. These are V1 Training Memory concepts, not Knowledge
evidence. V2 challenge score must not write to or influence either.

Guided Study independently uses `caissa:learning-progress:v1`, schema v2, and the
existing consent/evidence contracts. The namespaces remain separate.

### 3.13 Mobile and accessibility baseline

At 900 px and below, layout becomes board-first and secondary panels follow.
Navigation has a 48 px control, safe-area top support, collapsible panels, reduced
motion rules, and tested no-overflow behavior. At 360 px, primary actions stack.
The board exposes announcements, keyboard input, focus, promotion, and textual
status hooks.

The page still carries a long vertical stack of setup, session, curriculum,
Knowledge, and progress surfaces. Accessibility is tested at component level but
no V2 compliance claim is made.

### 3.14 Test coverage

Existing suites cover controller transitions, binding races, board interaction,
worker replacement, generator validity, candidate scoring, classification,
curriculum, coaching, persistence, import/export, multi-tab behavior, responsive
contracts, and repeated board/worker lifecycle. There are no executable V2 mode,
competitive-session, curated-pool, timer, challenge-score, or Personal Best
contracts yet.

## 4. V1 pain points

1. Entry exposes implementation choices before value.
2. Prepare and Start are two separate gates despite usable defaults.
3. Setup, board, session facts, curriculum, Knowledge Study, and Progress share one
   page module of roughly 80 KB.
4. “Score” means candidate quality, which would conflict with challenge score.
5. Objectives are strings rather than evaluator contracts.
6. Generated positions are useful but not competitively comparable.
7. Session state models one position only.
8. There is no pause, timer trust boundary, feedback state, next-item preload, or
   Personal Best compatibility key.
9. Free Practice configuration lacks stable URL/session contracts.
10. V1 Mastery and Recommendation labels could be confused with Knowledge evidence
    unless explicitly isolated.

## 5. Product principles

- The board is the protagonist.
- One primary action should start the default experience.
- Mode complexity is progressive disclosure.
- Educational result, competitive score, and learner history are distinct.
- Released Knowledge remains the authority for Knowledge Practice.
- Curated immutable pools are required for comparable score.
- Generated positions remain valuable in Custom Lab without false comparability.
- Technical failure is neutral to score, streak, and evidence.
- Board and engine instances are reused; stale asynchronous work never owns new state.
- Every stored or comparable record declares versions and trust.

## 6. Mode contracts

Mode contract schema version: `1.0.0`. Initial mode registry contains exactly four
IDs. Mode behavior belongs in the registry and mode adapters, not DOM conditionals.

Common fields:

`modeId`, `contractVersion`, `label`, `description`, `defaultConfiguration`,
`positionSource`, `sessionLengthPolicy`, `supportedObjectives`, `timerPolicy`,
`hintPolicy`, `scoringPolicy`, `evidencePolicy`, `persistencePolicy`,
`personalBestEligibility`, `exitBehavior`, `nextPositionBehavior`,
`eligibilityRequirements`, `comparabilityLevel`, `futureLeaderboardEligibility`.

| Mode | Source | Default length | Timer | Score/PB | Evidence | Comparability |
|---|---|---:|---|---|---|---|
| `quick-challenge` | curated pool | 5 | count-up | local, eligible | only explicit mappings | pool-version |
| `knowledge-practice` | immutable Knowledge activity | unit/activity policy | optional/none | educational, no default PB | authoritative Knowledge | not competitive |
| `endgame-run` | curated pool | 10 | count-up | local, eligible for finite runs | explicit mappings only | pool-version |
| `custom-lab` | educational generator/custom | one position | none | no comparable PB | Trainer Memory only | none |

Future leaderboard eligibility is `architecturally-possible` only for curated Quick
Challenge and finite Endgame Run. It is `none` for Knowledge Practice, generated
Custom Lab, custom positions, endless runs, and imported records.

## 7. Quick Challenge

Defaults:

- published beginner mixed curated pool;
- five positions;
- learner side declared by each position;
- count-up timer;
- progressive hints;
- deterministic score `challenge-score-v1`;
- local-only history/PB if local challenge storage is enabled.

Flow:

`open → Start Challenge → load verified item → show objective → activate board →`
`evaluate → concise feedback → Continue → next item → summary → replay`

Theme, difficulty, and length live inside Modes. The initial visible surface needs
only Start Challenge and optionally the last selected compatible preset.

Selection uses a deterministic shuffled order derived from a local session nonce,
pool fingerprint, and position IDs. It prevents repeats until the pool is exhausted.
The replay record stores the actual order. A missing item is marked unavailable,
does not affect learner results, and advances to another verified item. If the pool
cannot supply the target, the session becomes unavailable; it never silently falls
back to generated content for comparable score.

## 8. Knowledge Practice

Architecture decision: introduce one shared released-activity session controller
around the existing pure functions in `released-activity-runtime.js`. Guided Study
and V2 Knowledge Practice become views over that controller. The controller does
not replace released evaluation, evidence derivation, review resolution, consent,
or local store.

Knowledge Practice accepts an explicit release ID, Knowledge Unit ID, activity ID
or activity type, and optional review context. It supports guided, independent,
assessment, and explicit transfer activities already present. It returns to the
Library using the existing scoped slug.

Competitive score is absent by default. Knowledge evidence remains authoritative,
consent-checked, and local. Opening, reading, score, or timer state cannot create
evidence. No second educational runtime is permitted.

## 9. Endgame Run

Supported lengths: 5, 10, 20, and endless. Only 5/10/20 curated runs can qualify
for comparable local PB. Endless is practice-only.

Rules:

- deterministic no-repeat order within a versioned pool;
- difficulty sequence is pool-authored or a transparent band schedule;
- objective and evaluator belong to each curated item;
- count-up timer excludes loading and evaluator downtime;
- hint and skip costs are explicit;
- retry is allowed only if the mode contract says the item becomes non-independent;
- an unavailable/invalid/technical item is replaced without score or streak impact;
- finite completion produces a componentized summary and replay;
- pause freezes eligible elapsed time and forfeits future trusted leaderboard
  eligibility unless a later server contract permits pause;
- hidden tabs auto-pause local runs after a short grace boundary;
- browser suspension is detected from monotonic/wall-clock drift and lowers timer
  trust rather than inventing elapsed precision.

## 10. Custom Lab

Custom Lab preserves:

- piece count and categories;
- generated positions and KRPvKR templates;
- category/piece synchronization;
- learner side restrictions until independently expanded;
- engine strength;
- position scoring/classification;
- educational validation;
- hint, undo, restart, new position, resign, flip;
- current curriculum adapters and generated-position lessons;
- existing Training Memory and progress;
- current Board API and Stockfish lifecycle.

Controls can be grouped into Position, Learner Side, Engine, and Educational
Filters. Prepare and Start may be combined after parity tests, but the existing
adapter remains available during migration.

Generator, candidate selector, feature/scorer/classifier, theme validator,
curriculum, legacy progress store, and controller V1 are Custom Lab adapters.
They must not be used as comparable curated sources.

Custom FEN or board setup is included only when a verified Trainer-owned capability
exists; the current standalone Trainer does not expose one and V2 must not invent it
in 10.1.

## 11. Versioned session contract

Contract ID: `caissa:endgame-session`; schema version `2.0.0`.

Required immutable configuration:

- `sessionId`, `schemaVersion`, `modeId`, `modeVersion`;
- `sourceType`, `sourceId`, `sourceVersion`;
- `poolId`, `poolVersion`, `knowledgeReleaseId`;
- `objectivePolicy`, `timerPolicy`, `scoringPolicy`, `scoringVersion`, `hintPolicy`;
- `sessionLengthTarget`, `personalBestEligibility`;
- `consentState`, `persistenceEligibility`, `trustLevel`.

Required mutable snapshot:

- `startedAt`, `endedAt`, `status`;
- `currentItemIndex`, `completedItems`, `failedItems`, `skippedItems`,
  `unavailableItems`;
- `currentStreak`, `bestStreak`, `score`, `accuracy`.

Additional required ownership data:

- configuration fingerprint;
- source/pool content fingerprint;
- current item identity and attempt;
- hint profile;
- elapsed active milliseconds;
- operation generation;
- resumability and expiry;
- score breakdown;
- technical incidents.

Snapshots are cloned/frozen at boundaries. Knowledge releases contain no session
state. Unknown schema/mode/source/scoring versions fail closed.

## 12. State machine

Canonical states:

`configured → loading → ready → active → evaluating → feedback → loading-next →`
`active → completed`

Additional states: `paused`, `abandoned`, `unavailable`, `recovering`, and `error`.

Transition rules:

- start: configured → loading;
- load success: loading/loading-next/recovering → ready;
- board activation: ready → active;
- submission or terminal chess state: active → evaluating;
- deterministic result: evaluating → feedback;
- continue: feedback → loading-next or completed;
- pause: active|feedback → paused when policy permits;
- resume: paused → active|feedback using saved return state;
- skip: active → evaluating with learner skip, then feedback;
- retry: feedback → ready with incremented attempt and revised independence;
- abandon/mode switch/route change: any live state → abandoned after confirmation;
- source/evaluator unavailable: loading|evaluating → recovering, then replacement or
  unavailable;
- unrecoverable contract error: any nonterminal state → error.

Every async operation receives `{sessionId, itemId, attemptId, generation,
sourceVersion}`. A completion commits only when all fields still match current
ownership. Route change, mode switch, new load, skip, retry, pause, and dispose
increment generation and cancel engine/evaluator/timer ownership.

Timer expiry is an event, not a direct mutation; it competes through the same guard.
Stale worker messages are ignored by the existing transport generation and the V2
session generation.

Restoration is allowed only for explicitly resumable local modes. A restored
client-only competitive session has `trustLevel=local-restored` and cannot later be
upgraded to verified.

## 13. Position-source contracts

Source contract version: `1.0.0`.

Common fields:

`sourceType`, `sourceId`, `sourceVersion`, `immutability`, `positionIdentity`,
`provenance`, `comparability`, `verificationMethod`, `difficultyMetadata`,
`supportedObjectives`, `scoringEligibility`, `personalBestEligibility`,
`futureLeaderboardEligibility`, `educationalEvidenceEligibility`,
`replayEligibility`, `failureBehavior`.

- `curated-pool`: immutable/versioned; stable IDs; comparable within exact pool and
  scoring versions; reviewed evaluator.
- `knowledge-activity`: immutable release/activity IDs; authored evaluator;
  educational evidence eligible; competitive comparison off.
- `educational-generator`: deterministic from category/generator version/seed but
  mutable across generator versions; practice-only; Trainer Memory only.
- `custom-position`: user-provided/locally prepared; validated before use;
  noncomparable; no Knowledge evidence unless independently mapped.

No source adapter may elevate its own trust beyond its declared contract.

## 14. Curated pool contract

Pool schema version: `1.0.0`.

Required fields:

`poolId`, `poolVersion`, `label`, `theme`, `difficultyBand`, `positionIds`,
`objectivePolicy`, `resultExpectation`, `verificationState`, `scoringWeight`,
`hintEligibility`, `repeatPolicy`, `calibrationMetadata`, `publishedAt`,
`provenance`, `contentFingerprint`.

Each referenced position requires stable ID, FEN, side/orientation, objective,
evaluator, expected result, difficulty signals, verification boundary, feedback,
and replay data. IDs and canonical bytes determine the fingerprint.

Published pool versions are immutable. Correction requires a new pool version.
Pool loaders reject missing/unexpected positions, hash drift, unsupported schema,
unsafe FEN, objective/evaluator mismatch, and duplicate IDs. Season 10.2 owns
authoring, review, calibration, and publication; 10.0 authors no production pool.

## 15. Objective contract

Objective schema version: `1.0.0`.

Fields:

`objectiveId`, `contractVersion`, `label`, `learnerDescription`,
`successCondition`, `failureCondition`, `evaluator`, `timeoutBehavior`,
`scoringBehavior`, `feedbackBehavior`, `supportedSourceTypes`.

Initial vocabulary:

- `win`;
- `draw`;
- `hold`;
- `promote`;
- `stop-promotion`;
- `only-move`;
- `convert-advantage`;
- `defend-accurately`;
- `select-plan`;
- `complete-assessment`.

The learner label, evaluator, expected result, and concept mapping are separate.
Authored choice objectives use released evaluation. Chess-result objectives use
rules plus an approved source evaluator. Engine evaluation alone does not silently
change the objective.

## 16. Difficulty model

Difficulty schema version: `1.0.0`. Four noninterchangeable kinds:

1. `authored-activity`: released authored difficulty;
2. `curated-calibrated`: pool band and later observed calibration;
3. `generated-complexity`: transparent descriptive features;
4. `engine-strength`: opponent configuration.

Initial transparent signals are concept count, legal branching band, only-move
requirement, authored calculation depth, side-to-move sensitivity, expected
conversion length, defensive precision, allowed hint profile, and authored band.
Each signal is stored, with a named band rather than a falsely precise universal
rating.

Piece count is one complexity input only. No opaque adaptation ships in 10.0.
Historical success may later recommend noncompetitive practice but cannot alter a
comparable pool mid-session.

## 17. Deterministic scoring

Scoring contract: `challenge-score-v1`.

For each eligible item:

`round(baseObjective × difficultyFactor × independenceFactor`
` + timeBonus + streakBonus - skipCost)`

Initial bounded proposal:

- base objective: 100;
- difficulty factor: foundation 1.0, developing 1.15, intermediate 1.3,
  advanced 1.5;
- independence: no hint 1.0, instructional hints 0.8, strong guidance 0.5,
  final answer 0;
- time bonus: 0–20, declining only after an authored target time;
- streak bonus: 0–20, +2 per qualifying independent success;
- skip cost: 10, never below zero for the item;
- retry: highest eligible result is capped at 70% unless source policy differs;
- technical/unavailable: zero contribution and zero cost.

These values require validation in 10.3 before publication. They are architecture,
not active product constants.

The summary exposes every component. Educational result, score, accuracy, streak,
and PB qualification are stored separately. Different scoring versions are never
compared. Terminal records are idempotent by session ID and fingerprint.

## 18. Hint-cost model

Stages:

1. observation;
2. concept recall;
3. directional hint;
4. decision process;
5. strong guidance;
6. final answer.

Quick Challenge and Endgame Run reduce independence/score according to scoring
version. Knowledge Practice follows released hint/evidence rules and does not add a
punitive competitive cost. Custom Lab retains V1 hints and records usage only.

Hints never mark failure. Final-answer reveal removes independent, transfer, PB
no-final-hint, and competitive-streak eligibility for that item. It may still
produce guided success in Knowledge Practice. Timer continues for instructional
hints unless mode policy explicitly pauses it; loading an engine hint is excluded
from timed active work.

## 19. Timer model

Timer contract version: `1.0.0`.

- Quick Challenge/Endgame Run: count-up.
- Knowledge Practice/Custom Lab: none by default.
- Start: first item becomes active and board input is enabled.
- Excluded: source loading, engine/evaluator loading, technical recovery, and
  next-item loading.
- Explicit pause: permitted locally by mode; recorded in trust profile.
- Hidden tab: after a small grace window, auto-pause local sessions.
- Browser suspension: compare monotonic `performance.now()` with wall time; mark
  drift and lower trust rather than charging uncertain time.
- Route change: abandon or save a resumable local snapshot after confirmation.
- Clock: monotonic clock for elapsed work, wall time only for timestamps.
- Maximum item/session time and timeout result are objective/pool policy.

Client timing is `local-unverified`. It is acceptable for labeled local PB and not
for a global leaderboard.

## 20. Streak model

Streak contract version: `1.0.0`.

- independent success continues competitive and independent streaks;
- guided success may continue a separate practice streak only;
- final-answer success does not continue independent streak;
- learner failure breaks the mode’s competitive streak;
- skip breaks competitive streak;
- unavailable/invalid/technical failure changes no streak;
- abandoned session ends the live session streak;
- best streak is session-scoped;
- local PB streak uses the exact mode/pool/scoring/length compatibility key.

Knowledge Practice displays educational continuity only if useful; it does not
convert streak into evidence. Rules are selected by the mode contract.

## 21. Personal Best

PB contract version: `1.0.0`; local-only in initial V2.

Fields:

`recordType`, `modeId`, `modeVersion`, `poolId`, `poolVersion`,
`scoringVersion`, `sessionLength`, `score`, `accuracy`, `bestStreak`,
`elapsedTime`, `hintProfile`, `completedAt`, `consentOrStorageState`,
`trustLevel`, `localOnly`.

Compatibility key:

`modeId/modeVersion/poolId/poolVersion/scoringVersion/sessionLength/recordType`

Generated, custom, endless, differing length, differing pool/scoring version, and
imported records are not cross-compared. Imported/manual records are
`local-imported-untrusted`. Reload cannot duplicate a terminal record because
session ID plus completion fingerprint is idempotent.

## 22. Evidence integration

- Quick Challenge: Knowledge evidence only when the curated item explicitly names
  a released concept/unit mapping, evaluator trust is sufficient, and Knowledge
  consent permits it.
- Knowledge Practice: existing released activity, learning event, evidence,
  review-resolution, and consent contracts are authoritative.
- Endgame Run: practice evidence only for explicit reviewed mappings; score is
  never evidence.
- Custom Lab: existing Trainer Memory or no persistence. Visual similarity to a
  Knowledge concept is insufficient.

No result automatically becomes Knowledge Mastery. Ordinary wrong answers do not
become misconception evidence. Technical events produce no educational evidence.

## 23. Persistence boundaries

Ownership is explicit:

1. active session: memory first; optional resumable namespace
   `caissa:endgame-v2:active:v1`;
2. challenge history: `caissa:endgame-v2:history:v1`;
3. Personal Best: `caissa:endgame-v2:personal-best:v1`;
4. Knowledge progress: existing `caissa:learning-progress:v1`;
5. Trainer progress/Training Memory: existing
   `caissa:endgame-trainer:progress:v1`;
6. analytics: no storage until a separate approved policy.

V2 challenge history/PB requires a dedicated, plainly explained local-storage
choice, bounded retention, clear controls, export/import policy, schema recovery,
and no cloud sync. It does not inherit Knowledge consent. Declining challenge
history still permits ephemeral sessions.

No namespace merges. Imported challenge data cannot write Knowledge evidence or V1
Training Memory.

## 24. Future leaderboard trust boundary

No global leaderboard is implemented. A future trusted system requires:

- authenticated identity and applicable guest policy;
- server-issued challenge/session ID;
- immutable pool and scoring versions;
- signed start and authoritative timestamps;
- server-side move/result and score validation;
- anti-replay and tamper detection;
- disconnect, pause, duplicate-account, engine-use, privacy, moderation, and
  seasonal-reset policies.

Current scores are client-controlled and `local-unverified`. Client guards improve
correctness, not global trust. The versioned IDs and event sequence permit a later
server verifier without changing the learner-facing mode contract.

## 25. UI information architecture

Primary V2 shell:

- compact route/header and Modes trigger;
- learner-visible objective;
- timer only when enabled;
- score, streak, and item progress;
- one large board;
- Hint;
- Continue/Next;
- concise feedback live region;
- optional collapsed Personal Best on wide desktop.

Only state-relevant controls render. Before start, Quick Challenge shows one
primary Start Challenge action. During active play, Continue is absent. During
feedback, board input is locked and Continue/Next is primary.

V1 Progress Workspace is not permanently adjacent to the board. It remains
reachable as a separate/collapsed view during migration.

Component boundaries for 10.1:

- `V2TrainerShell`;
- `ModeRegistry` and `ModeAdapter`;
- `TrainingSessionOrchestrator`;
- `ObjectiveBar`;
- existing `EndgameBoardView`;
- `SessionMetrics`;
- `HintControl`;
- `FeedbackPanel`;
- `PrimarySessionAction`;
- `ModesMenu`;
- optional `PersonalBestSummary`;
- legacy `CustomLabAdapter`;
- released `KnowledgePracticeAdapter`.

## 26. Modes menu

Trigger sits in the compact header and remains reachable in every nonmodal state.
It opens a modal dialog on desktop/tablet and full-width bottom/full-screen sheet
on mobile.

Requirements:

- current mode is announced and visually selected;
- four mode cards use label and concise description;
- arrow or Tab navigation follows DOM order;
- initial focus is selected mode, otherwise first card;
- native dialog or equivalent focus trap;
- Escape and explicit Close share one close path;
- outside click closes only when no destructive decision is pending;
- active session mode switch opens abandon confirmation;
- ephemeral unsaved session text is explicit;
- confirmation precedes any cancellation;
- focus returns to trigger;
- mobile respects safe areas and 44 px targets;
- route/back handling cannot bypass abandonment ownership.

## 27. Responsive behavior

### Desktop

Board remains largest element. Objective/metrics sit above it; primary actions and
feedback below. Modes is compact. PB may occupy a narrow optional column. No setup
form or full Progress Workspace is permanently displayed.

### Tablet

Board remains first. PB, settings, and summaries collapse into disclosures/sheets.
Metrics use a stable one-line or two-row area so feedback does not shift the board.
Modes remains directly reachable.

### Mobile

Board uses available width without duplicate instances. Objective and metrics are
compact; feedback follows the board; actions are thumb-safe and sticky only when
they do not cover the board. Modes is a full-width sheet. Safe-area insets,
orientation changes, zoom, and no horizontal overflow are mandatory.

## 28. Accessibility

Architecture requirements:

- semantic buttons, labels, fieldsets, and dialog/sheet semantics;
- logical keyboard order, visible focus, focus trap/restoration;
- screen-reader objective and textual position description;
- restrained timer announcements at meaningful thresholds, never every second;
- text alternatives for score/streak/progress;
- no color-only result;
- `role=status` for concise feedback and `role=alert` for blocking failure;
- reduced motion and no board flicker;
- explicit pause when timer is enabled;
- minimum 44 px touch targets;
- orientation and zoom resilience;
- Board API keyboard and announcement behavior preserved.

Accessibility compliance is claimed only after automated and manual tests.

## 29. V1 migration

### Phase A — Season 10.1

Add V2 behind an explicit route flag or separate internal surface. V1 remains
default and rollback is removal/disablement of the flag.

### Phase B

After Quick Challenge parity and performance gates, make it the default Trainer
entry. Preserve `/endgame-trainer` and route old query contracts to their adapters.

### Phase C

Move V1 setup/curriculum-generated controls into Custom Lab while retaining the
same controller, store, board, worker, generator, and saved data.

### Phase D

Remove legacy presentation only after route, bookmark, generated-position,
curriculum, Training Memory, mobile, engine, and accessibility parity.

Compatibility adapters:

- `LegacyFreePracticeAdapter` maps current setup to Custom Lab;
- `GuidedStudyAdapter` maps `studyUnit/release/activity/reviewFrom`;
- current V1 controller adapter exposes a one-position session to V2;
- old progress store remains owner of V1 history.

No migration rewrites old local data. Safe rollback keeps the old HTML/page module
available until Phase D.

## 30. Analytics boundary

No tracking is added. Potential future product events are mode selected, session
started, item loaded, hint revealed, skip, completed, abandoned, and technical
failure.

Product analytics, educational evidence, and competitive verification are three
different schemas, policies, consent decisions, retentions, and transports.
Educational evidence cannot be repurposed as analytics without approval.

## 31. Security

Initial defenses and limits:

- client score/timer/PB are labeled local-unverified;
- immutable pool fingerprints detect accidental/manipulated content drift;
- session IDs and terminal fingerprints prevent ordinary replay duplication;
- legal moves and FEN use `ChessRulesFacade`/existing validation;
- route IDs use bounded allowlists and exact versions;
- authored display uses text-safe rendering;
- dialog actions use explicit ownership and confirmation;
- operation generations reject stale workers/evaluators/timers;
- worker failure moves to recovery/error without learner penalty;
- storage schemas reject unknown versions and preserve recoverability;
- release mismatch fails closed;
- imports remain untrusted and cannot elevate evidence/PB trust.

These controls do not constitute server anti-cheat.

## 32. Performance

Targets to validate on representative production hardware:

- cached shell to board-ready: ≤1.0 s desktop, ≤1.5 s median mobile;
- warm next curated item: ≤150 ms to board-ready;
- first engine readiness: ≤2.5 s, with honest loading state;
- warm engine reuse: no new Worker between normal items;
- zero board remounts during a session;
- zero duplicate board/engine runtimes;
- no visual empty-board frame during a warm next transition;
- bounded pool manifest first load, with item-level lazy loading;
- at most one safely preloaded next item;
- preload token cannot commit after skip/mode/route change;
- release worker/pool caches on dispose or memory pressure.

Existing board, binding, and SafeEngineAdapter lifecycle behavior is the baseline.
Targets are budgets, not claims until measured.

## 33. Error model

Stable error categories:

- `position-unavailable`;
- `pool-unavailable`;
- `evaluator-unavailable`;
- `engine-unavailable`;
- `invalid-position`;
- `unsafe-fen`;
- `release-mismatch`;
- `unsupported-pool-version`;
- `unsupported-scoring-version`;
- `corrupted-local-history`;
- `session-recovery-failed`;
- `worker-crash`;
- `stale-operation`;
- `route-changed`.

Technical errors increment `unavailableItems` or incidents, never failed items.
They do not reduce score, break streak, create misconception/remediation, or emit
false evidence. Recovery may replace an item only from the same compatible source.
Unsupported versions and unsafe data fail closed with a clear return/reset path.

## 34. Test strategy

Season 10.1+ tests:

- exact four-mode registry and version rejection;
- session schema, immutability, and compatibility;
- every allowed/forbidden state transition and guard;
- stale engine/timer/load/hint/skip races;
- source trust and failure behavior;
- immutable pool hash/completeness/version;
- deterministic no-repeat/replay order;
- objective evaluator compatibility;
- transparent difficulty signals;
- byte-identical score breakdown;
- hint, retry, skip, technical-error costs;
- monotonic timer, pause, hidden tab, suspension drift;
- independent/practice streak separation;
- PB compatibility and imported trust;
- evidence/consent/no-Mastery/no-Recommendation boundaries;
- namespace isolation, retention, reset, corruption;
- V1 routes, queries, generator, store, board, engine;
- keyboard, dialog focus, live regions, reduced motion, zoom;
- desktop/tablet/mobile no-overflow and board dominance;
- public artifact excludes contracts/docs/fixtures as applicable;
- rollback and deterministic replay.

10.0 adds no fake tests: no runtime contract or UI was implemented.

## 35. Implementation roadmap

### Season 10.1 — V2 shell, Modes, Quick Challenge

Implement pure mode/session/state contracts, orchestration shell, feature flag,
Modes dialog/sheet, one noncompetitive fixture adapter, and V1 rollback. Do not
claim comparable PB until curated publication.

### Season 10.2 — Curated pools

Author pool schema, validator, deterministic loader, immutable publisher, small
reviewed pools, verification, and initial calibration.

### Season 10.3 — Endgame Run and local competition

Implement continuous finite/endless sessions, scoring v1, timer, streaks, summary,
challenge storage, PB, import trust, and failure-neutral transitions.

### Season 10.4 — Knowledge Practice

Extract the shared released-activity controller and mount both Guided Study and
Knowledge Practice without changing evidence authority.

### Season 10.5 — Custom Lab parity

Move V1 generated/curriculum controls behind Custom Lab adapters. Verify routes,
Training Memory, generator, board, worker, mobile, and rollback before retiring
presentation.

### Season 10.6 — Daily Challenge foundation

Select immutable daily pool items with local identity and replay protections. No
global trust claim.

### Season 10.7 — Trusted leaderboard

Only after separate approval: backend identity, signed sessions, authoritative
validation, policies, moderation, privacy, and seasonal operations.

## 36. Risks and open questions

- Curated pools and calibration do not exist yet; Quick Challenge cannot honestly
  be comparable until 10.2.
- Non-mate conversion/defense evaluators need explicit reviewed contracts.
- Timer pause/hidden-tab policy needs product testing before PB publication.
- Dedicated challenge-history opt-in language requires product/privacy review.
- V1 “Mastery” terminology may confuse users and should be clarified during Custom
  Lab migration without changing its data semantics.
- The 80 KB page module should be decomposed incrementally, not rewritten.
- Firefox validation depends on environment availability.
- Tablebase verification may improve bounded positions later but is not universal.
- Custom FEN is not currently a standalone Trainer feature.
- Season 10.1 must decide the exact feature-flag/route mechanism and rollback owner.

## 37. Architecture decisions and rejected alternatives

### Decisions

1. Add one V2 product orchestrator above stable chess runtimes.
2. Use exactly four versioned initial modes.
3. Keep comparable score on immutable curated pools.
4. Treat generated positions as noncomparable Custom Lab practice.
5. Share the released educational evaluator between Guided Study and Knowledge
   Practice.
6. Separate challenge score, Knowledge evidence, V1 Training Memory, and analytics.
7. Use explicit guarded state transitions and versioned replay identity.
8. Keep local PB visibly unverified.
9. Preserve V1 until measured parity and rollback gates pass.

### Rejected alternatives

- Full Trainer rewrite: rejects proven board/engine/generator/store behavior.
- Mode logic in the current DOM page: repeats the current coupling problem.
- Second Knowledge evaluator: risks contradictory evidence.
- Generated positions for comparable PB: lacks calibration/equivalence.
- Heuristic candidate score as learner score: measures the wrong subject.
- Automatic Mastery or recommendation from challenge score: violates evidence rules.
- One merged local store: destroys consent and ownership boundaries.
- Global leaderboard now: client timing and score are not trustworthy.
- Mass-authored pools in 10.0: bypasses review and calibration.
- Full visible redesign in 10.0: precedes executable contracts and migration gates.

## 38. Repository component map

| Responsibility | Current component | V2 disposition |
|---|---|---|
| Page composition | `endgame-trainer.html`, `endgame-trainer-page.js` | preserve; shell introduced beside/behind flag |
| Board | `endgame-board-view.js` | reuse unchanged through adapter |
| Board/controller projection | `endgame-session-board-binding.js` | reuse; V2 orchestrator owns item transitions |
| One-position chess session | `endgame-session-controller.js` | Custom Lab/V1 adapter |
| Session state | `endgame-session-state.js` | wrap; do not mutate into V2 multi-item schema |
| Engine safety | `safe-engine-adapter.js` | reuse |
| Worker transport | `stockfish-worker-factory.js` | reuse |
| Rules/FEN | `chess-rules-facade.js`, `endgame-fen-utils.js` | reuse |
| Generator | `endgame-position-generator.js` | Custom Lab source |
| Candidate selection | `endgame-candidate-selector.js` | Custom Lab source |
| Validation/features | validator/features/theme modules | reuse for source validation |
| Candidate quality | `endgame-position-scorer.js` | never learner score |
| Coaching/hints | coach/messages/renderer | adapt by mode policy |
| Curriculum | `endgame-curriculum.js`, pilot | preserve in Custom Lab/Guided paths |
| V1 progress | `endgame-progress-store.js` | preserve namespace and ownership |
| V1 Training Memory | `endgame-training-memory.js` | preserve; no challenge writes |
| Released activities | `released-activity-runtime.js` | authoritative Knowledge evaluator |
| Guided Study entry | `guided-study-entry.js` | shared controller consumer in 10.4 |
| Knowledge evidence/store | `js/learning/*` | preserve authority/consent |
| Immutable release | browser reader + release JSON | explicit pin only |
| Public boundary | `scripts/build-public-release.mjs` | keep docs/source protected |

## 39. Season 10.1 acceptance boundary

Season 10.1 is ready to start only if its implementation proposal:

- defines executable mode/session/state contracts before UI;
- uses a feature flag or additional surface with immediate rollback;
- mounts one board and one engine runtime;
- shows a one-action Quick Challenge entry;
- keeps non-curated fixtures explicitly noncompetitive;
- contains no PB/global leaderboard claim;
- preserves all V1 routes, Guided Study, stores, releases, and tests;
- includes keyboard/focus/mobile/error tests with the first visible shell.
