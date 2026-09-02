# CAISSA Play v3 — Master Work

Status: P3-001–P3-006 committed; P3-007 Play Coach visual redesign implemented under Alexander's preauthorization through P3-010.

Branch: `feature/caissa-play-v3`

Base: `main` at `891b1fcd0e26785e7860019b12c7028e048c595f`

## Product direction

Play v3 preserves the certified board and game lifecycle while simplifying the three public experiences:

1. **Play Game** — choose time, color, and a target opponent strength from 250 to 3200 Elo.
2. **Play Bots** — choose visual character bots arranged as a permanent classic ladder plus data-driven seasonal collections.
3. **Play Coach** — play with Caissa, the chess goddess, using a clean level selector, color choice, contextual encouragement, and concise teaching observations.

The interface may learn from common interaction patterns, but it must not copy third-party artwork, assets, text, source code, or proprietary implementation.

## Approved hierarchy

| Family | Piece | Target range |
|---|---|---:|
| New to Chess | Pawn | 100–249 |
| Beginner | Bishop | 250–999 |
| Intermediate | Knight | 1000–1499 |
| Advanced | Rook | 1500–2199 |
| Master | Queen | 2200+ |
| Legends / Grandmasters / Champions | King | special style profiles |

Classic bots remain available. Seasonal collections use scheduled, active, and expired states and may overlap. Halloween is a future collection, not hardcoded product logic.

## Commercial boundary

- Registered free account: one complete Coach game.
- Eligible paid tiers: Coach access.
- The future entitlement must be enforced server-side.
- No database or RPC change is authorized until the existing auth and economy primitives are reviewed in the entitlement checkpoint.

## Implementation checkpoints

- P3-001 — architecture audit
- P3-002 — Play Game opponent-strength contract and UI
- P3-003 — bot data model
- P3-004 — classic bot UI
- P3-005 — strength and calibration layer
- P3-006 — seasonal collection architecture
- P3-007 — Play Coach visual redesign
- P3-008 — Caissa dialogue architecture
- P3-009 — Coach levels
- P3-010 — server-side free/Premium entitlement boundary
- P3-011 — mobile certification
- P3-012 — full regression and public gate
- Historical King bots remain out of scope until P3-012 is stable.

## P3-001 current architecture map

### Route and shell

- `js/play/play-route-controller.js` owns canonical `/play`, `/play/games`, `/play/bots`, and `/play/coach` routing, including QA/beta gates and route normalization.
- `js/play/simplified-play-shell.js` owns the single responsive workspace, reuses the existing board DOM, mounts the three setup panels, and selects phone/tablet/desktop geometry.
- `css/play-simplified-shell.css`, `css/play-visual-components.css`, and `css/play-visual-tokens.css` own the current Play presentation.
- `js/play/play-v2-product-boundary.js` allowlists Play modes, routes, resources, and post-game actions and prohibits Academy surfaces inside Play.

### Board and lifecycle

- The simplified shell relocates the existing `.board-with-eval` and player nodes; it does not create a second chessboard.
- Existing board ownership, compatibility commands, lifecycle, clock, engine worker, post-game, Analyze handoff, and Mentor review must remain intact.
- `js/play/chessboard-adapter.js`, `js/play/game-lifecycle.js`, `js/play/clock-service.js`, and `js/play/play-compatibility.js` are reusable boundaries and should not be duplicated.

### Play Game

- `js/play/games-panel.js` owns time presets, White/Random/Black, setup disclosure, readiness, validation, and game-start submission.
- It already exposes `setOpponentStrength`, but the only valid strength is `full-power`; this is the lowest-risk seam for P3-002.
- The existing game-start command currently passes mode, resolved color, time, and increment. A target-strength value needs an explicit, validated handoff rather than a UI-only slider.
- Current Play modules intentionally avoid direct storage access. Remembering the last strength therefore needs a separately reviewed settings owner; P3-002 must not add ad hoc `localStorage` writes to the panel.

### Play Bots

- `js/play/bots-panel.js` owns catalog selection, time, color, worker readiness, retry, and game start.
- `js/play/bots/bot-registry.js` is the catalog seam.
- `js/play/bots/bot-session.js` owns selected-profile session behavior.
- Existing strength/personality/calibration contracts and browser calibration tests should be extended rather than replaced.
- The current panel exposes internal calibration language and large cards. P3-004 will replace only presentation after P3-003 provides the stable data model.

### Play Coach

- `js/play/native-coach/coach-panel.js` owns the internal setup panel, start command, help request, and live assistance presentation.
- `js/play/native-coach/coach-configuration.js` owns current assistance level/focus/timing, two time controls, and White/Black.
- The Coach already separates configuration, assistance, and panel presentation. This is a good seam for the future visual redesign.
- Current Coach is explicitly internal and `publicReady: false`; visible certification text must not simply be relabeled as public readiness.
- No current server-side complimentary-game entitlement was identified in the Play runtime. P3-010 must audit the production auth/economy service before schema decisions.

### Engine strength

- Existing public Play defaults to fixed maximum engine strength.
- Bot profiles already use bounded strength/personality behavior and a real Stockfish position-suite calibration test.
- A 250–3200 slider cannot honestly map straight to a single Stockfish option across the entire range. P3-002 should define a target-strength contract; P3-005 should own calibration and low-rating human-like error policy.
- The browser UI must never expose UCI internals, worker paths, depth, calibration flags, or personality implementation details.

### Responsive and accessibility

- The shell already calculates distinct compact phone, standard phone, landscape phone, portrait/landscape tablet, desktop, and constrained-height layouts.
- Current Playwright owners cover shell geometry, mobile ordering, touch-sized controls, tabs, route transitions, worker lifecycle, accessibility, and public-beta behavior.
- Board-first mobile ordering and single-board ownership are hard invariants.

## Reusable primitives

- Canonical route controller and mode transition policy
- Single responsive shell and board adapter
- Games panel time/color controls and readiness gate
- Bot registry/session/worker-readiness boundaries
- Coach configuration/assistance/panel separation
- Game-start analytics wrapper with privacy restrictions
- Existing post-game, Analyze, and Mentor-review handoffs
- Product boundary and dynamic-group allowlist
- Node contract tests and Playwright acceptance suites

## Main risks

1. Passing a slider value without connecting it to the actual engine would create dishonest strength labeling.
2. Low Elo cannot rely only on `UCI_Elo`; it needs calibrated candidate selection and bounded human-like errors.
3. Adding storage directly to a presentation module would violate current static ownership guards.
4. Rebuilding the board or Worker per mode would break single-owner lifecycle guarantees.
5. Coach Premium protection cannot be client-only.
6. Seasonal dates require a trusted time/configuration policy and deterministic tests.
7. Historical style claims must use “inspired” language and documented public-game/statistical sources.
8. The existing production and QA route gates must remain fail-closed during implementation.

## Recommended P3-002 seam

P3-002 should remain narrow:

1. Add a pure target-strength contract with bounds, steps, labels, and validation.
2. Extend `GamesPanel` state/snapshot/submission with validated target strength.
3. Add an accessible range control and visible value below the existing time/color setup.
4. Pass the value through the compatibility/game-start boundary without changing bot or Coach behavior.
5. Add unit/static tests first, then browser tests for pointer, touch-equivalent input, keyboard, visible label, invalid values, game start, and mobile geometry.
6. Keep the feature on the existing Play v3/QA gate until calibration is connected and certified.

Likely P3-002 files:

- `js/play/games-panel.js`
- a new pure module under `js/play/` for the target-strength contract
- `js/play/play-compatibility.js` and/or the existing engine configuration boundary, only if required by the audited command path
- `css/play-simplified-shell.css`
- `play-v2.html` and `scripts/build-play-v2.mjs` for a new script include/version guard
- focused tests under `tests/play/` and `tests/browser/`

## P3-002 acceptance strategy

- Pure validation tests for min 250, max 3200, allowed step, label bands, and malformed input.
- Static ownership tests: no network, storage, Worker creation, or board creation in the slider contract/presentation.
- Browser tests: range accessible name/value, arrow keys, Home/End, pointer/touch-compatible change, selection survives panel rerender, correct start payload, and no effect on Bots/Coach.
- Responsive tests at phone, tablet, desktop, 200% text, and constrained height.
- Regression tests for one board, one Worker owner, time/color controls, routing, post-game, Analyze, and Coach.

## P3-002 implementation record

- Added `CaissaOpponentStrength@1.0.0` with bounded 250–3200 targets, 50-point steps, honest display bands, safe persistence, and a session-owned search mapping.
- Extended `GamesPanel@1.6.0` with an accessible range control, visible Elo/band value, keyboard semantics, persistence, and validated command payload.
- Extended `CaissaPlayCompatibility@1.4.0` so malformed, off-step, and out-of-range target values fail closed before `newGame`.
- Connected the accepted target to real opponent search. Below 3200, the target session supplies bounded depth and bypasses the full-power opening book. At 3200, existing full-power behavior remains.
- This checkpoint deliberately describes the number as an approximate target. Human-rating calibration and low-Elo candidate/error modeling remain P3-005.
- Generated internal, public-beta, promotion-QA, iPad-diagnostic, and server public-beta documents were rebuilt from the authoritative `index.html` source.
- Focused contract result: 37/37 passing after the final integration test.
- Broader selected Play result: 62/63 passing; the remaining public-entry resource-graph failure exists on the clean `main` generation because the older guard flags three already-approved Coach resources and is unrelated to P3-002.
- Supervised browser QA passed for slider presence, bounds, 50-point step, keyboard Home/End behavior, category transitions, 1450 selection, and persistence after reload. Alexander physically approved the Play v3 Games presentation.

## P3-003 implementation record

- Added a versioned, immutable collection contract without changing the current Bots interface or executable four-profile engine catalog.
- Defined the permanent piece ladder: Pawn/New to Chess, Bishop/Beginner, Knight/Intermediate, Rook/Advanced, Queen/Master, and a reserved King family for future historical styles.
- Added 24 planned Classic characters with target strengths progressing in 50, 100, or 150-point steps. These are explicitly targets, not claims of calibrated human Elo.
- Added configuration-driven collection metadata for Classic, Seasonal, and Special Event families, including enabled flag, priority, theme, schedule, artwork metadata, and bot availability.
- Added deterministic `scheduled`, `active`, `expired`, and `disabled` resolution. Multiple campaigns may be active simultaneously and are ordered by priority.
- Kept Halloween out of production data; tests use a Halloween fixture only to certify the generic seasonal contract.
- Planned bots cannot become executable until they reference an existing validated engine profile. P3-005 remains the owner of strength calibration and low-rating behavior.
- Added validation for hostile objects, invalid schedules, duplicate bot IDs, category/range conflicts, unknown executable profiles, and malformed registry queries.
- Added the two modules to the existing QA-only lazy Bots stack before the UI shell.

## P3-004 implementation record

- Replaced the public-facing technical profile cards with the compact `Play Bots` Classic ladder.
- The permanent hierarchy now renders by chess-piece family with 24 named characters. Figurine and name remain primary; the numeric value is always qualified as an `Elo target`, never as a calibrated rating.
- Added a selected-bot summary, hover/focus target details, `No Timer` through `10+0`, and White/Random/Black controls.
- Four QA characters preserve the previously certified executable profiles: Pip/Beginner, Luna/Casual, Nora/Tactical, and Vera/Solid. The remaining characters may be explored but fail closed as `Coming soon` until P3-005 owns their strength behavior.
- Added a presentation identity to the bot session so the board and completed-game record show the selected character name without replacing the underlying executable profile ID.
- Revised the honesty contract to allow numeric targets only when explicitly labeled `Elo target`; certified, federation, and exact-human rating claims remain prohibited.
- Focused static, accessibility, record, shell, lazy-load, visual-boundary, and bot tests pass 98/98.
- Chromium is unavailable in the current runtime, so Playwright did not launch. Browser and physical mobile certification remain deferred to the explicitly paused P3-011 gate.

## P3-005 implementation record

- Added `classic-target-model-1`, a versioned immutable strength layer with 63 profiles from 100 through 3200 in 50-point increments.
- The model adjusts bounded engine depth, MultiPV candidate count, acceptable evaluation-loss boundary, and deterministic variation frequency. Search grows deeper while variation and tolerated loss fall as the target increases.
- Legal-move filtering, forced mate, safe promotion, one-Worker ownership, request attribution, and lifecycle ownership remain stronger invariants than personality or target strength.
- Expanded the Classic roster to 27 named bots so the permanent ladder reaches 3200 without gaps larger than 150 points inside a family.
- All 27 Classic characters now start games through their own strength profile. The original four profiles remain available for legacy compatibility but no longer own the Play v3 Classic UI.
- Bot sessions and completed-game records preserve the character ID/name and modelled target without storing or presenting a formal rating.
- Numeric values remain explicitly labeled `Elo target`; every profile remains `modelled-uncalibrated` with `ratingClaim: none`.
- Focused strength, candidate-selection, collection, session, honesty, accessibility, game-record, post-game, and lazy-loading tests pass 88/88.

## P3-006 implementation record

- Added a versioned seasonal manifest whose production collection list is intentionally empty. No holiday or campaign is hardcoded into Play.
- Added a bounded manifest loader that validates and registers up to 16 configured collections without network, storage, or deployment-time mutation.
- Added qualified bot references (`collection-id:bot-id`) so different campaigns can safely reuse character IDs while Classic keeps its short stable IDs.
- Collection resolution fails closed outside the configured active interval. Scheduled, expired, disabled, unknown, and malformed references cannot enter a bot session.
- Play Bots now consumes all active collections from the registry, orders them by priority, keeps Classic visible, and renders multiple campaign sections when dates overlap.
- Seasonal character identity, collection title, target strength, and underlying model remain attached to the session without changing Worker or game-lifecycle ownership.
- Generic manifest, date-boundary, overlap, priority, qualified-reference, accessibility, visual-component, and lazy-loading tests pass 50/50.

## P3-007 implementation record

- Replaced `Coach · Internal`, certification disclosures, technical setup selectors, and the visible Help/Dismiss controls with the simplified `Play Coach` experience.
- Added an original transparent 512×512 portrait of Caissa as an approachable female goddess of chess. The asset is project-owned, uses CAISSA navy/gold, and does not reproduce a third-party avatar.
- Added Caissa's dialogue surface beside the portrait with the opening line: `Let's play. I'll help you along the way.`
- The public setup now exposes only `Casual`, White/Random/Black, and a single `Play` action. Existing assistance focus/timing controls remain behind the established advanced boundary.
- Random color resolves locally at game start and never enters the validated game command unresolved.
- Coach still owns no board, Worker, clock, move commit, storage, network, lesson, Academy, or Mentor capability.
- Focused Coach boundary, assistance, accessibility, lazy-loading, visual identity, asset, and automation-owner tests pass 36/36.

## P3-008 implementation record

- Added a versioned, immutable Caissa dialogue owner with an allowlisted message catalog and lifecycle events for welcome, game-ready, user-turn, completion, dismissal, and errors.
- Automatic observations are deliberately sparse: deterministic cadence, minimum-ply cooldown, duplicate suppression, user silence, and a maximum number of automatic messages per game.
- Check awareness may interrupt the normal cadence, but it remains bounded and never emits a move, variation, evaluation, board square, FEN, or PGN.
- The public speech surface accepts only the dialogue catalog or text already allowlisted by the certified assistance policy. Arbitrary engine or caller-provided prose fails closed.
- The native Coach listens to existing turn-change and game-end lifecycle events; it does not create a board, Worker, timer, analyzer, storage owner, or network transport.
- Dialogue diagnostics count speech and suppression without recording positions, moves, identities, or hidden answers.

## P3-009 implementation record

- Added seven progressive public Coach choices: Casual, Beginner, Intermediate, Advanced, Expert, Master, and Grandmaster.
- Each public choice resolves through one immutable contract to three independent internal policies: opponent strength, teaching strength, and Coach personality/cadence.
- Opponent targets progress from 500 through 2800 and enter the established target-strength session, so changing Coach level changes actual opponent search rather than only relabeling the interface.
- Teaching strength configures bounded assistance level/focus independently. Coach personality configures speaking cadence independently from both.
- The public dropdown exposes only simple level names; Elo targets, assistance policies, focus, cadence, and message limits remain internal.
- Unknown, malformed, or disconnected levels fail closed before game start.

## P3-010 implementation record

- Reused Clerk's verified server JWT, the existing server-only Supabase client, and `users.is_premium`, which Stripe fulfillment already maintains as the paid-access source of truth.
- Added one persistent complimentary-Coach-game state to the existing user record because no reusable one-time feature entitlement primitive exists. Credits and Mentor reservations remain separate economies.
- Added an atomic, row-locked, idempotent database operation. Premium users receive access without consuming the trial; free registered users may consume it exactly once; a retry with the same operation ID remains admitted.
- The database function has a fixed search path, rejects malformed subjects/operations, is revoked from public/anonymous/authenticated access, and is executable only by the server service role.
- Added a no-store authenticated endpoint for status and consumption. It derives identity from the verified Clerk token and ignores all client claims about Premium status or remaining games.
- The Coach panel remains visible after trial use, shows `Your complimentary Coach game has been used.`, offers a Premium path, and cannot enable Play until the server returns an admission.
- Anonymous, unsynchronized, rate-limited, malformed, database-failure, and network-failure paths fail closed. No entitlement is stored in localStorage or another client-controlled store.
- The migration is prepared but deliberately not applied, and the endpoint/UI remain inside the existing non-production Play v3 gate.
- Focused entitlement, Coach, authentication-boundary, lazy-loading, accessibility, and platform-security tests pass. The full Play unit run passes 726/735; its nine failures are frozen release/tag guards and two previously stale baseline assertions, not executable P3-010 regressions.

## Authorization record

Alexander preauthorized continuous implementation through P3-010. No additional checkpoint approval is required for P3-005 through P3-010. Work must pause before P3-011 Mobile Certification for Alexander's deliberate physical review.

## Stop gate

P3-002 through P3-010 remain isolated from production on the feature branch. Do not merge or deploy. Stop before P3-011 Mobile Certification.
