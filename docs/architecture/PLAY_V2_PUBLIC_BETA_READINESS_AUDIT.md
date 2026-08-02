# Season 11.0.1 — Play v2 Public Beta Readiness Audit

> Season 11.3.2 update: Games first-playable readiness is enforced locally by `PlayV2PlayableReadiness@1.0.0`. The bounded state model, passive probes, CTA gate, complete failure matrix, recovery rules, security/accessibility evidence, and non-claims are recorded in [`PLAY_V2_PLAYABLE_READINESS.md`](./PLAY_V2_PLAYABLE_READINESS.md). Games Quick Play certification remains in force. Physical-device validation, Bots/Worker certification, feedback, and public rollout remain open; production defaults are unchanged.

Audit date: 2026-08-01

Architectural name: **CAISSA Native Play Experience**

Product principle: **Enter. Choose. Play.**

Audit baseline: `f38c323` on `main`; `origin/main` at `7cec9ea`; clean worktree at start; local branch two commits ahead; annotated `season-10.0.0` tag local-only at `7cec9ea`.

## Executive decision

**Current readiness: NOT READY for public beta.** The deployed QA Games flow is substantially playable and its deterministic test evidence is strong. Public exposure is blocked by product-boundary violations, an unsuitable route/gate model, uncertified physical-device and assistive-technology behavior, and unresolved production Worker certification.

No public route, production default, provider connection, Players activation, educational feature, analytics transport, deployment, push, or runtime implementation was changed by this audit.

The Play v2 boundary can be isolated without breaking CAISSA Classic or Legacy FICS, but that isolation is not implemented today. Public beta work may proceed in a later run only by constructing a beta-specific allowlist/runtime graph rather than deleting shared historical features.

## Stop-condition result

| Condition | Result | Evidence |
|---|---|---|
| Season 10 closure baseline exists | Pass | Closure report, handoff, closure manifest, deployed and rollback identities present |
| Worktree clean at audit start | Pass | `git status --short` empty |
| Play v2 boundary isolatable | Pass with required work | Games/Bots/PostGame/Analyze seams exist; Players and Coach are lazy groups that can be excluded |
| FICS removal would break Classic/Legacy FICS | No, if isolated | Classic/FICS runtime remains outside the proposed beta graph; wholesale deletion is prohibited |
| Audit requires production behavior change | No | Documentation-only audit and local commit |

## Readiness by subsystem

| Area | Current state | Beta decision / gap |
|---|---|---|
| Routes and QA gates | `/play` and `/play/:mode` rewrite to `index.html`. `/play` resolves Games at the route-controller layer, but the Simplified shell activates only with `?simplified=1`; Bots, Coach, and Players require that query flag. Non-QA reserved modes normalize to Games. | Blocked. A query parameter is a QA switch, not a public enrollment/entitlement boundary. `/play` must continue to be Legacy Play. |
| Shell and board | One board-first shell relocates the existing board, has semantic regions, responsive layouts, focus/live-region composition, and scoped QA CSS. It is stamped `data-qa-preview="true"`. | Strong foundation. Needs beta identity/copy, an allowlisted mode rail, field hardening, and physical/AT certification. |
| Games | Local human-versus-machine configuration, color/time selection, legal play, deterministic reply, rematch/new game, record, PGN, and Analyze handoff pass. | Best first beta candidate. Still needs real-device, Worker, recovery, long-session, and support validation. |
| Bots | Four truthful, non-Elo profiles map to local engine presets; selection/rematch contracts pass. Route remains QA-only. | Potential Stage 2 only after bundled Worker production certification and calibration on low/mid/high devices. |
| Coach | Explicit teaching profiles, learner levels, instructional interventions, learning goals, lessons, Knowledge mappings, and Endgame Library links. | **Prohibited in Play v2.** Exclude route, tab, lazy group, copy, and runtime registration from beta. Preserve elsewhere if desired. |
| Players | Production-blocked UI and contracts, but the lazy group loads FICS and Classic adapters and the panel recommends/opens FICS. | **Prohibited and blocked.** Remove the mode from the beta route/UI/runtime graph. Do not replace with coming-soon or fake data. |
| Worker | Bundled same-origin engine assets and legacy `EngineAdapter`/`StockfishEngine` create the actual Worker. The newer lifecycle layer tracks controlled transports, generations, restart-once, timeouts, attribution, and owner-scoped disposal; it intentionally creates no Worker or arbitrary URL. Local lifecycle and browser ownership tests pass. Season 10 records external/production Worker configuration as open. | P1 blocker. Certify deployed asset/WASM loading, CSP/MIME/cache behavior, initialization/restart/unavailable UI, low-memory termination, background/foreground behavior, and supported browser/device performance. No remote arbitrary Worker URL or silent network fallback. |
| Lifecycle | Passive shared lifecycle derives idle/active/promotion/completed; session rotation, rematch/new game, listener/Worker bounds pass. | Strong local evidence. Add crash/reload/recovery, suspended-tab, rapid route-change, and long-game field tests. |
| Clocks | Monotonic elapsed-time service, active-side switching, increment, timeout-once, pause/resume/reset/dispose pass. | Locally ready for machine games. Validate throttled/background tabs, sleep/wake, mobile suspension, display drift, and accessibility announcements on devices. Not suitable as authoritative online clock. |
| PostGame | Truthful result/termination, Rematch, New Game, copy/download PGN, consent-aware save, Analyze, and Mentor request foundations pass. | Core card is usable. Remove educational language, Knowledge links, Guided Replay/lesson continuation, and Academy-derived Mentor selection from the beta graph. |
| Analyze | Opaque bounded handoff through session storage; Analyze owns separate state/resources; Back restores PostGame. | Appropriate external continuation after completion. Add expiration/unavailable copy and cross-tab/reload manual QA. Do not present as in-game analysis. |
| Mentor | Explicit post-game request is bounded and failure-safe, but current implementation lazy-loads `educational-*`, Guided Replay, Knowledge mapping, Academy mentor selection, learning concepts, and summaries that can link to Knowledge Units. | Blocked until a review-only slice is isolated. Stage last and only as optional completed-game review; otherwise keep disabled. |
| Responsive | Automated profiles cover 320×568 through desktop, landscape, constrained height, zoom/reflow, and multi-browser representative profiles. | Emulation passes; physical phone/tablet, safe areas/notches, browser chrome, virtual keyboard, orientation, touch latency, device scale, and text scaling remain uncertified. |
| Accessibility | Semantic regions, native controls, focus management, live regions, touch targets, reduced motion, forced colors, zoom/reflow, and Axe checks pass. Board supports drag/tap and board-level focus. | P1 blocker. No square-by-square keyboard chess; no named NVDA, JAWS, VoiceOver, TalkBack, switch-control, or physical touch certification. Disabled/blocked discoverability and announcement timing require human review. |
| Navigation | History/Back/Forward and Analyze return pass. Root remains Classic; normal Play remains Legacy. | Add a dedicated opt-in beta entry/exit, refresh/deep-link/error behavior, noindex/canonical policy, and ensure primary navigation does not silently change. |
| Feedback | No beta feedback surface or support/triage contract was found. Analytics dispatcher is intentionally memory-only and transport-blocked. | P1 launch blocker. Add explicit user-submitted feedback with disclosure, rate limiting, abuse handling, retention/deletion policy, support ownership, and no automatic PGN/FEN/move/Mentor/identity attachment. Keep analytics transport disabled. |
| Rollback | Season 10 records READY rollback deployment `dpl_2izmq53NpdJ4hneQoLfwPgrRfaUG`; restoration requires authorization. | Deployment rollback alone is insufficient. Add a server-side/edge beta kill switch, enrollment revocation, direct return to Legacy Play, asset-version rollback, rehearsal, owner, and decision thresholds. |
| Security/privacy | Route parser bounds queries and rejects dangerous keys; handoff is opaque/bounded; analytics is memory-only and content-free; Worker policy forbids arbitrary URLs. | Add beta abuse/threat model, CSP review of the beta graph, dependency/asset integrity check, feedback endpoint controls, storage disclosure/expiry, cache separation, error redaction, and confirmation that excluded FICS/education scripts are not loaded. |
| Production defaults | Closure manifests assert homepage Classic, normal Play Legacy, Simplified QA-only, Players blocked, analytics transport disabled. Focused browser tests reconfirm these boundaries. | Preserve until a separately authorized release task. |

## Every FICS reference in the Play v2 code boundary

Season 11.0.2 expands this summary into the authoritative path-specific FICS, provider-contract, test, legacy-owner, classification, and activation inventory in [`PLAY_V2_PRODUCT_BOUNDARY.md`](./PLAY_V2_PRODUCT_BOUNDARY.md). That audit confirms 30 Play-owned/shared runtime file entries in the FICS/provider reachability graph: 17 contain literal FICS tokens and 13 are provider-neutral/native contract files reached through the contaminated Players stack.

The following is the complete file-level inventory from case-insensitive search under `js/play` at the audit baseline. These are references, not proof of a live socket: the specific adapters are deliberately unsupported/resource-free today. They are nevertheless prohibited from the public Play v2 graph.

| File | Reference and disposition |
|---|---|
| `js/play/fair-play-policy.js` | Enumerates `fics` and `FICS_LIVE_ASSISTANCE_DENIED`. Refactor to a provider-neutral external-authority rule before claiming a reference-free Play v2 boundary. |
| `js/play/performance/play-load-registry.js` | Players lazy group explicitly loads three FICS adapters plus Classic adapters. Exclude the entire Players group from beta; later relocate provider-specific history outside Play v2. |
| `js/play/players-panel.js` | FICS status codes, provider names, actions, navigation, adapters, presence lookup, copy, and “Open FICS Lobby” UI throughout. Entire panel is outside beta. |
| `js/play/players/challenge-contracts.js` | FICS provider vocabulary. Outside beta. |
| `js/play/players/player-presence.js` | FICS provider vocabulary. Outside beta. |
| `js/play/players/fics-presence-adapter.js` | Unsupported FICS presence adapter. Outside beta. |
| `js/play/players/fics-challenge-adapter.js` | Unsupported FICS challenge adapter. Outside beta. |
| `js/play/players/fics-human-fair-play-adapter.js` | FICS authority/handoff inspection. Outside beta. |
| `js/play/players/classic-presence-adapter.js` | Models Classic as FICS presentation. Outside beta. |
| `js/play/players/classic-challenge-adapter.js` | Models Classic challenge ownership through FICS. Outside beta. |
| `js/play/players/classic-human-fair-play-adapter.js` | Inherits FICS authority/reason codes. Outside beta. |
| `js/play/players/human-fair-play-contracts.js` | FICS/Classic reason codes. Outside beta. |
| `js/play/players/human-play-infrastructure-contracts.js` | FICS providers, actions, login/lobby/seeks/games/clocks/reconnect capabilities. Outside beta. |
| `js/play/players/human-play-provider-matrix.js` | FICS and Classic ownership/provider matrix. Outside beta. |
| `js/play/players/human-play-coming-later-policy.js` | Recommends FICS/Classic alternatives. Outside beta. |
| `js/play/players/human-play-section-policy.js` | FICS presence/challenge copy and actions. Outside beta. |
| `js/play/players/human-play-block-readiness.js` | FICS/Classic capability evidence, providers, actions, and explanatory copy. Outside beta. |

FICS references in `index.html`, `yahoo-classic.html`, `app.js`, FICS CSS/client/gateway/deployment sources, and their tests belong to CAISSA Classic or Legacy FICS and must remain operational. Their co-location in the monolithic SPA means public-beta verification must prove that the beta entry neither presents nor invokes those sections; a later packaging split is safer than deleting them.

## Every educational reference in the Play v2 product surface

Season 11.0.2 expands this summary into the authoritative path-specific educational, lifecycle, hidden-answer/PV, write-capability, test, classification, and activation inventory in [`PLAY_V2_PRODUCT_BOUNDARY.md`](./PLAY_V2_PRODUCT_BOUNDARY.md). It confirms 52 Play/PostGame/lazy production file entries in the educational reachability graph, plus the separate Guided Replay stylesheet; current Training Memory, Mastery, and recommendation writes remain zero/disabled, but their reachable adapters and vocabulary are still contamination.

False positives such as JavaScript `class`, CSS class names, and time-control `classical` are excluded. The material product references are:

| Surface/files | Reference and beta disposition |
|---|---|
| `js/play/coach-panel.js`; `js/play/coach/*` | Learner levels, teaching focus, learning goals, instructional prompts, supported lessons, endgame detectors, Knowledge Unit mappings, and `/endgame-library` links. Exclude entire Coach mode/group. |
| `js/play/performance/play-load-registry.js` | Registers Coach, `mentor-analysis`, `mentor-critical`, `mentor-guided-replay`, `mentor-knowledge`, and `mentor-summary` lazy groups. Beta allowlist must omit Coach and all educational Mentor groups unless replaced by a review-only group. |
| `js/play/post-game-experience.js` | “Educational analysis,” learning concepts, Guided Replay, Knowledge mapping/links, Academy mentor selection, supported endgame lesson summaries, and prioritized Knowledge Unit action. Remove from beta PostGame/Mentor slice. |
| `js/play/fair-play-policy.js` | `training` source/authority and training allowance. Move to a provider-neutral shared policy outside the Play v2 bundle or omit from beta graph. |
| `js/play/ui/play-visual-identity.js`; `js/play/ui/play-visual-components.js` | “learning-continuation” and “mentor-learning-bridge” presentation vocabulary. Rename/re-scope to post-game review continuation for beta. |
| `js/play/analytics/play-analytics-contracts.js`; `js/play/analytics/play-mentor-engagement-analytics.js` | Knowledge-opened event vocabulary. Transport is disabled, but educational event registration must not ship in the beta graph. |
| `js/mentor/educational-*`, `knowledge-*`, `guided-replay-*`, `mentor-capabilities.js`, `mentor-context.js`, `mentor-foundation.js`, `mentor-registry.js`, `mentor-review-*`, `mentor-selection-resolver.js`, and `mentor-summary*` | The current Mentor stack is substantially educational/Academy/Knowledge-aware. It may remain elsewhere, but beta Mentor must be isolated to optional completed-game review or remain off. |
| Monolithic `index.html`/`yahoo-classic.html` | Academy, lessons/training, Endgame products, Coach and Mentor content exist as separate SPA sections. They are not acceptable Play v2 surfaces. Beta navigation and runtime tests must prove non-presentation; a dedicated entry document/bundle would give the strongest isolation. |

Analyze itself is permitted only as the external completed-game continuation defined in `PLAY_V2_PRODUCT_BOUNDARY.md`. Chess terms such as an endgame phase or an endgame reached during ordinary play are not promotional education by themselves; instructional lessons, mappings, links, or recommendations are prohibited.

## Playable-flow gaps

1. There is no public opt-in enrollment, beta entitlement, terms/disclosure, exit, or kill switch.
2. The current canonical `/play` route semantics conflict with the immutable requirement that normal Play remain Legacy; Simplified activation depends on a discoverable query flag.
3. Games is locally playable, but deployed Worker behavior and low-resource-device calibration are uncertified.
4. Repetition and fifty-move public-history scenarios remain accepted test limitations; validate organic long-game handling and user-visible termination.
5. Recovery exists as a consent-aware persistence foundation, but reload/crash/session-expiry UX is not publicly certified.
6. Background throttling, sleep/wake, offline/online transitions, asset failures, and stale service-worker/cache combinations lack field evidence.
7. Mentor cannot meet the new boundary without separating review from education; Coach and Players cannot be beta modes.
8. No beta feedback/support/incident workflow exists.

## Physical-device gaps

- real iOS Safari and Android Chrome phones, including small screens and notches;
- real iPadOS and Android tablets in both orientations and split view;
- safe-area insets, browser chrome collapse/expansion, standalone/PWA mode, and rotation during play;
- tap-to-move, drag/drop, promotion, scrolling near the board, touch cancellation, latency, and accidental zoom;
- virtual keyboard overlap for dialogs/feedback and hardware keyboard behavior;
- low-memory Worker eviction, thermal throttling, battery impact, background/foreground restoration, and screen lock;
- device text scaling, high contrast, reduced motion, and 200%+ zoom behavior beyond emulation.

## Accessibility gaps

- named manual passes with NVDA/Firefox or Chrome, JAWS/Chrome, VoiceOver/Safari on macOS/iOS, and TalkBack/Chrome on Android;
- a documented non-pointer board interaction model: current board-level focus does not provide square-by-square keyboard chess;
- spoken move, check, promotion, clock urgency/timeout, game result, error, reconnect/recovery, and PostGame action verification;
- rotor/landmark order, focus restoration across Analyze/Back, mode changes, dialogs, and responsive reflow;
- switch control/voice control and touch exploration;
- disabled/unavailable state discoverability, forced-colors visual review, and long localized copy testing.

## Safest beta route and gate

The safest future route is **`/play/beta`**, implemented as a dedicated explicit opt-in entry with a server/edge-controlled beta flag and a beta-specific allowlist. It must not reuse `?simplified=1` as public authorization and must not alter `/play`.

Required behavior for the future route:

- gate off by default and fail/redirect safely to current Legacy Play;
- require an explicit user choice from a non-default beta entry surface;
- initially register only shell, Games, board/lifecycle/clock/Worker, PostGame, and Analyze handoff resources;
- omit Players, Coach, FICS adapters/copy/actions, Academy/Endgame/Knowledge groups, Mentor educational groups, and analytics transport;
- provide “Return to current Play,” beta status, support/feedback, privacy disclosure, and a no-data-loss exit;
- use `noindex` until product approval, preserve canonical/default navigation, and support instant server-side revocation.

`/play/beta` does not exist as a valid beta route today: the current controller would interpret `beta` as an unknown mode and normalize it. Creating it is an implementation task for a later run.

## Staged rollout recommendation

| Stage | Audience and surface | Entry criteria | Rollback trigger |
|---|---|---|---|
| 0 — internal QA | Existing `?simplified=1`; Games only for certification | Boundary guards, Worker/device/AT plans, feedback and rollback rehearsal ready | Any regression in Classic/Legacy/defaults |
| 1 — invite opt-in | Small allowlisted cohort at `/play/beta`; Games only | P1 gates closed; explicit consent/exit/support; production Worker certified; zero FICS/education graph | game-start/completion blocker, Worker failure trend, accessibility blocker, privacy/security issue |
| 2 — bounded open beta | Public opt-in entry; Games plus certified Bots | Stage 1 stability and support capacity; device matrix passed | threshold breach or material support/abuse issue |
| 3 — review experiment | Optional review-only Mentor for completed games | Review separated from Academy/Knowledge/training; accessibility/privacy/content approval | education leakage, misleading advice, failure blocks core actions |
| Deferred | Players, Coach, `/play` migration, analytics transport | Separate architecture and authorization | Not applicable |

## Required tasks before public beta

### P0 product-boundary tasks

1. Add automated static/runtime guards proving the beta graph and rendered route contain no FICS reference, adapter, provider action, or network dependency.
2. Remove Coach and Players from the beta mode registry, navigation, prefetch/lazy graph, markup, accessibility tree, and analytics vocabulary; preserve their historical code outside the beta graph.
3. Reduce PostGame to play continuations. Isolate a review-only Mentor or leave Mentor disabled; remove Academy selection, Guided Replay lessons, Knowledge Units, Endgame Library links, learning recommendations, and educational copy.
4. Define a dedicated beta entry document/bundle or equally strong allowlist boundary so co-located Classic/Academy/FICS SPA markup cannot leak into Play v2.

### P1 release tasks

5. Implement `/play/beta` opt-in gating, server-side kill switch, safe fallback/exit, noindex/canonical rules, and preserve `/`, `/play`, Players, and analytics defaults.
6. Certify the deployed bundled Worker/assets across supported browsers and representative low/mid/high physical devices; document failure UI and no-network fallback.
7. Execute physical-device chess, responsive, safe-area, virtual-keyboard, suspension, recovery, and performance protocols.
8. Execute named screen-reader, keyboard-board, switch/voice, announcement, focus, and forced-colors protocols; resolve the board keyboard model.
9. Create explicit feedback/support flow, privacy notice, triage owner/SLA, abuse/rate limits, retention/deletion, incident path, and content-free defaults.
10. Rehearse beta disablement and deployment rollback; record owners, thresholds, cache/asset behavior, and restoration verification.
11. Add security review for gate bypass, XSS/content injection, handoff/storage abuse, feedback abuse, CSP/Worker sources, dependencies, secrets, headers, cache isolation, and error redaction.

### P2 quality tasks

12. Validate organic repetition/fifty-move completion, long games, clock throttling/sleep, reload/crash recovery, storage denial/quota, offline transitions, and expired Analyze handoffs.
13. Establish release smoke checks for beta entry, Games start/move/finish/rematch/new game/PGN/Analyze/exit, plus negative checks for FICS, education, Players, analytics transport, and changed defaults.
14. Define browser/device support, known limitations, beta status page/copy, and a go/no-go evidence packet.

## Test evidence from this audit

| Command | Result |
|---|---|
| `npm run test:play:unit` | **530 passed, 0 failed, 0 skipped** |
| Focused Chromium: routing, Simplified shell, Games, lifecycle, clocks, PostGame, accessibility, Worker lifecycle | **39 passed, 0 failed** |
| Static repository searches for FICS and educational terms | Completed; inventories above |

These tests validate the existing QA architecture, not public-beta eligibility. No physical device, named screen reader, deployed Worker, live feedback endpoint, beta gate, or rollback rehearsal was tested in this audit.

## Files inspected

Directly read or searched during this audit:

- release/baseline: `docs/releases/SEASON_10_FINAL_CLOSURE_REPORT.md`, `SEASON_10_TO_SEASON_11_HANDOFF.md`, `season-10-closure-manifest.js`, `season-10-release-readiness-manifest.js`, Git branch/tag/diff state;
- architecture/audits: `PLAY_CURRENT_STATE_AUDIT.md`, `CAISSA_SIMPLIFIED_PLAY_ARCHITECTURE.md`, `PLAY_WORKER_LIFECYCLE_AUDIT.md`, `PLAY_MANUAL_CHESS_QA.md`, `PLAY_RESPONSIVE_TEST_COVERAGE.md`, `PLAY_ACCESSIBILITY_AUDIT.md`;
- routing/entry: `server.js`, `vercel.json`, `index.html`, `yahoo-classic.html`, `js/play/play-route-controller.js`, `js/play/simplified-play-shell.js`, shell/visual CSS;
- play runtime: all files under `js/play`, with direct focus on Games, Bots, Coach, Players, fair play, records/persistence, lifecycle, clocks, PostGame, Analyze handoff, accessibility, lazy loading, analytics governance, and Worker lifecycle/registry/fallback;
- engine/Mentor boundary: `js/engine-adapter.js`, `stockfish-worker.js`, all files under `js/mentor` by boundary search;
- tests/configuration: `package.json`, `playwright.config.js`, all `tests/play` unit tests executed, and the eight focused browser specs listed in Test evidence.

## Final recommendation

Keep production exactly as it is. Treat Games as the only viable first public-beta mode, but do not expose it until the beta-specific graph is free of FICS and educational surfaces and all P1 gates close. Bots may follow Worker/device certification. Mentor follows only after review-only isolation. Coach, Players, `/play` migration, and analytics transport are explicitly outside this rollout.

## Season 11.1.1A bootstrap-separation update (2026-08-01)

Season 11.1.1 originally stopped before commit because the QA URL and protected legacy products shared `index.html`. `/play/games?simplified=1` therefore downloaded `css/fics-client.css`, `js/fics-style12.js`, and `js/fics-client.js`. Downloading unused provider code is still a failed isolation boundary: it expands the executable supply chain, permits future evaluation side effects, and makes a negative-network guarantee false.

The recovery uses a dedicated generated `play-v2.html` bootstrap. `scripts/build-play-v2.mjs` derives it deterministically from the preserved legacy document, removes FICS-owned CSS/JavaScript and Play Players resources, removes legacy FICS WebSocket destinations from its CSP, installs `PlayV2FicsIsolation@1.0.0`, and fails generation if a prohibited resource element remains. Provider-neutral board, lifecycle, route, game state, engine, Worker, Analyze, and UI modules remain shared implementations; no second runtime owner exists.

Local and Vercel routing select this document only for `/play` or `/play/:mode` with the existing exact `simplified=1` QA query. Normal `/play` still resolves to `index.html`; `/` remains Classic and `/yahoo-classic` retains its standalone legacy document. No `/play/beta` route or public navigation was added.

| Owner | Entry and resources after separation |
|---|---|
| Play v2 QA | `play-v2.html`; provider-neutral shared runtime; isolation contract; no FICS/Players resource element or FICS WebSocket CSP destination |
| Homepage / Legacy Play | Preserved `index.html`, including existing FICS CSS, Style12, client, and human-provider compatibility resources |
| CAISSA Classic / Legacy FICS | Preserved legacy bootstraps and FICS internals |

Chromium evidence confirms no FICS-owned request or loaded resource for the QA entry, including hostile provider/fallback queries and failed attempts to load `players-stack`. Games and Bots initialize with one board and one Worker. Classic, Legacy FICS, Legacy Play, homepage, and normal `/play` retain their legacy resources and defaults. Players is unavailable in routing, shell, and lazy registry and cannot be enabled by query, storage, history, configuration, or retry.

**Season 11.1.1 is complete for FICS isolation only. Play v2 remains QA-only and NOT READY for public beta.** Educational isolation, Worker production certification, physical-device and assistive-technology validation, feedback, rollback operations, and the other readiness gates remain open.

## Season 11.1.2 educational-isolation update (2026-08-01)

`PlayV2ProductBoundary@1.0.0` now enforces the principle that Play is for playing. The dedicated QA document removes Academy markup/navigation/styles/scripts, current Mentor bootstrap and panels, the Analyze Mentor panel, educational help/promotion fragments, Endgame product navigation, and Mentor engagement registration. The runtime lazy registry exposes only `bots-stack` and `analyze-deep` when the product boundary is installed; current Coach and all Mentor/Guided Replay/Knowledge groups remain registered only for protected legacy/standalone ownership.

Play v2 route and shell admission now omit Coach and Players rather than presenting disabled promotional tabs. Query, storage, configuration, history, recovery, retry, and direct lazy-load attempts cannot admit either mode or any current Mentor group. Coach is not rejected permanently as a product concept: its current lesson/Knowledge-aware implementation is excluded. A future Coach requires a separately bounded assisted-play design. Mentor may return only through a separately proven optional review-only boundary; none is implemented here.

The contaminated PostGame module is replaced only in `play-v2.html` by `post-game-core.js`. The clean card contains result, termination reason, opponent where applicable, Rematch, New Game, Copy/Download/Save PGN, and external Analyze. It contains no Mentor action, Guided Replay, Knowledge mapping, recommendation, lesson card, Training Memory write, or Mastery write. Analyze continues through its opaque external handoff and does not expose PGN/FEN in the URL.

Legacy `index.html` continues to own Academy, current Coach/Mentor modules, Guided Replay/Knowledge registrations, and the original PostGame implementation. Standalone Endgame Trainer and Endgame Library documents/routes are unchanged. Negative browser evidence covers resource requests, loaded resources, DOM, globals, registry definitions, hostile activation, zero learning writes, PostGame, Analyze, remaining keyboard tabs, one board, one Worker, and FICS preservation.

Automated keyboard, focus, touch-target, reduced-motion, forced-colors, reflow, and Axe checks remain regression evidence only. No physical device or named screen reader has been certified.

**Season 11.1.2 status: complete for educational isolation only. Play v2 remains QA-only and NOT READY for public beta.** Worker production certification, physical-device and assistive-technology testing, feedback, operational rollback, public enrollment/gating, and later release gates remain open.

## Season 11.2.1 controlled-entry update (2026-08-01)

`PlayV2BetaEntry@1.0.0` establishes `/play/beta` as the canonical future beta namespace without exposing it publicly. Authorized local internal requests for the root, Games, and Bots map only to `play-v2.html`; the exact server/build-time stage value owns admission before document selection. Default hosting and disabled/invalid access select a deterministic runtime-free, non-indexable unavailable document. There is no Legacy Play or FICS fallback and no invented invite or identity system.

The client preserves authorized Games/Bots deep links, refresh, back/forward, queries and fragments without depending on `simplified=1`. Coach, Mentor, Players, unknown modes, encoded aliases and malformed descendants fail closed. Normal `/play`, `/`, Classic, and Legacy FICS ownership remains unchanged. The old exact QA query remains temporarily for regression compatibility and retires only after separately authorized migration.

Rollback is deterministic: remove or change the exact internal stage value. This prevents Play v2 runtime loading without deleting the implementation or rewriting history. Gate details, route mapping, security/accessibility behavior, test scope, and retirement conditions are recorded in [`PLAY_V2_BETA_ENTRY.md`](./PLAY_V2_BETA_ENTRY.md).

**Season 11.2.1 status: accepted locally for controlled internal entry only. Play v2 is still NOT a public beta.** Public authorization/entitlement, deployment, feedback, Worker/Bots production certification, physical-device and named-screen-reader validation remain open. No production verification is claimed.
