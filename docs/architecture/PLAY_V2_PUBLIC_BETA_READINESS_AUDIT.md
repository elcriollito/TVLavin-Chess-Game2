# Season 11.0.1 — Play v2 Public Beta Readiness Audit

> **Season 11.9.3 direct Public Beta conversion:** [`PlayV2PublicBetaPolicy@1.0.0`](./PLAY_V2_PUBLIC_BETA_ARCHITECTURE.md) removes Supabase invitations, sessions and automatic feedback from the active release path. Exact `public-beta` admits only Games, Bots and Coach routes; Players, invite, QA and direct HTML routes fail closed. Feedback is local JSON plus explicit Discord handoff. Invite-only and Supabase migrations remain unmodified history. Manual localhost acceptance, Preview validation, invite rotation, kill-switch timing, focused device smoke and release authorization remain required.

> **Season 11.9.2A feedback boundary:** invite-only sessions now receive a local manual QA report generator governed by [`PlayV2ManualQaFeedbackPolicy@1.0.0`](./PLAY_V2_MANUAL_QA_FEEDBACK_POLICY.md). Reports remain volatile until the tester copies or downloads the sanitized JSON and manually posts it to the private channel. Automatic Supabase feedback transport is disabled and its endpoint fails closed; migrations remain historical. This does not certify invitation, session, revocation, kill-switch, Preview, NVDA or device-smoke gates.

> **Season 11.8.2 FINAL iPad certification:** the sanitized independent record is [`PLAY_V2_IPAD_QA_11_8_2_CONSOLIDATED.md`](./evidence/PLAY_V2_IPAD_QA_11_8_2_CONSOLIDATED.md), attributed to iPad Pro 11-inch (4th generation), iPadOS 26.4.2, bundled Safari and build `c4eaba751c11ec3318457655c3c0c19386322877`. The verdict is **IPAD PHYSICALLY ACCEPTED — ALL REQUIRED DEVICE-AVAILABLE GATES PASSED WITH DECLARED P2 ANALYZE RESIDUAL RISK**. `IPAD-11.8.2-002` preserves the real historical collapse, absence of a specific fix and unknown root cause; its automatic P1 reopening conditions remain binding. Device-unavailable capabilities remain BLOCKED/N/A, `SEC-001` passed, and Mentor contrast remains nonblocking P3 polish. This certification does not activate or establish readiness for an invite-only or public beta.

> **Season 11.8.1 FINAL iPhone certification:** the sanitized physical record is [`PLAY_V2_IPHONE_QA_11_8_1_CONSOLIDATED.md`](./evidence/PLAY_V2_IPHONE_QA_11_8_1_CONSOLIDATED.md). Findings `IPH-11.8.1-003` through `IPH-11.8.1-008`, `IOS-009` and `IOS-011` through `IOS-026`, VoiceOver, and `SEC-001` passed within their recorded scopes. The general matrix is attributed to build `bce7c7e94ba3c5f425ff41862b1ad90cf5a5f56f`; all eight White/Black promotion choices and the promotion portion of `IOS-026` are attributed to build `01c771a4d7ce2e6a1118a06c4feb44033c08f02d`. Native drag, pinch zoom, and external-keyboard Tab order retain honest BLOCKED dispositions. The authorized verdict is **IPHONE PHYSICALLY ACCEPTED - ALL REQUIRED DEVICE-AVAILABLE GATES PASSED**. A same-origin Clarity bootstrap was requested once in the internal harness but failed closed before initialization, storage, event, or network activity; analytics activity, transport, and external destinations remained zero. This does not advance public-beta readiness.

> **Season 11.8.1D-A auth-bootstrap update:** `PLAYV2-11.8.1D-BOOT-001` traced an inherited, unused account bootstrap in the dedicated Play v2 document. Play v2 requires no account authentication for its admitted modes or completed-game continuations, so the deterministic builder now excludes the shared auth configuration, session, access, and account-UI resources only from `play-v2.html`. Classic, Legacy Play, Sign In/Sign Up, account and premium ownership remain unchanged. Architecture and secret boundaries are recorded in [`PLAY_V2_AUTH_BOOTSTRAP.md`](./PLAY_V2_AUTH_BOOTSTRAP.md). Clean laptop retest and physical iPhone retest remain required; this is not a public-readiness claim.

> Season 11.8.1A mobile-polish status: physical iPhone core observations are partial PASS, but findings `IPH-11.8.1-003` through `IPH-11.8.1-007` keep certification **NOT CERTIFIED — PAUSED FOR MOBILE PLAYABILITY POLISH**. Local remediation and automated evidence do not authorize public exposure or resume physical QA.

> **Season 11 desktop product-acceptance update — 2026-08-02:** The product owner explicitly approved the Play v2 desktop product experience documented in [`PLAY_V2_DESKTOP_PRODUCT_ACCEPTANCE.md`](./PLAY_V2_DESKTOP_PRODUCT_ACCEPTANCE.md). This closes only the desktop visual and functional acceptance prerequisite. Physical-device certification remains **NOT CERTIFIED — PAUSED** and requires separate authorization to resume. Named assistive-technology review, the public opt-in gate, feedback and rollback operations, and production-equivalent verification remain open. Play v2 remains internal, `/play` continues to resolve to Legacy Play, and this update makes no public-readiness or Season 11 completion claim.

> Season 11.4.1A update: `PlayV2BotPersonalityPolicy@1.0.0` adds four locally calibrated, deterministic personalities and a simplified internal selection surface. Evidence and limitations are recorded in [`PLAY_V2_BOT_PERSONALITIES.md`](./PLAY_V2_BOT_PERSONALITIES.md). Bots and the production Worker remain uncertified and not public-ready. Games certification, physical-device validation, feedback, and public rollout gates are unchanged.

> Season 11.5.2: internal Coach is `locally-assistance-certified` by automation only. It remains a public-beta blocker until named human content review and physical-device and named-screen-reader gates pass. `publicReady` remains false; routes, navigation, defaults, analytics, Players, FICS isolation, and educational isolation are unchanged.

> Season 11.6.1: Games, Bots, and Coach share the internal `PlayV2PostGamePolicy@1.0.0` result-first PostGame owner. Mentor remains prohibited, production defaults are unchanged, and this does not authorize public beta.

> Season 11.4.2A update: `PlayV2BotWorkerReadiness@1.0.0` locally certifies
> Native Bots lazy Worker ownership, the canonical same-origin engine asset,
> bounded generation-attributed handshake, teardown/Retry behavior, narrow CSP,
> MIME and production-equivalent output. The prior “production Worker
> uncertified” statement above is historical. Bots remains internal and not
> public-ready; deployed and physical-device verification remain open. See
> [`PLAY_V2_BOT_WORKER_READINESS.md`](./PLAY_V2_BOT_WORKER_READINESS.md).

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

- Season 11.8.2 FINAL: the independently reviewed iPad matrix passed every required device-available gate. The sanitized record discloses the accepted `IPAD-11.8.2-002` P2 residual risk, BLOCKED/N/A capabilities and P3 Mentor polish; this closes the iPad physical-device gate only and does not advance public-beta readiness;
- real Android Chrome phones and additional iOS Safari compatibility targets beyond the certified iPhone;
- real Android tablets and additional iPadOS hardware; traditional Split View remained unavailable on the certified iPad interface;
- standalone/PWA mode and safe-area, browser-chrome and rotation coverage on remaining untested device families;
- tap-to-move, drag/drop, promotion, scrolling near the board, touch cancellation, latency, and accidental zoom;
- virtual keyboard overlap for dialogs/feedback and hardware keyboard behavior;
- low-memory Worker eviction, thermal throttling, battery impact, background/foreground restoration, and screen lock;
- device text scaling, high contrast, reduced motion, and 200%+ zoom behavior beyond emulation.

## Accessibility gaps

- named manual passes with NVDA/Firefox or Chrome, JAWS/Chrome, VoiceOver/Safari on macOS, and TalkBack/Chrome on Android; attributed VoiceOver sessions passed on the certified iPhone and iPad;
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

## Season 11.4.3 bot strength and identity honesty update (2026-08-01)

`PlayV2BotStrengthHonesty@1.0.0` now fail-closes the internal Bots registry to the four fictional product profiles and the exact `Unrated · calibration pending` disclosure. Numeric/certified Elo, federation rating/title, human-equivalent strength, real-person identity/replica/likeness, and depth-as-rating remain prohibited. Short public style phrases are owned by the existing calibrated personality policy; the complete focused claim inventory and future numeric-rating evidence gate are recorded in [`PLAY_V2_BOT_STRENGTH_HONESTY.md`](./PLAY_V2_BOT_STRENGTH_HONESTY.md).

This improves claim integrity but does not advance exposure. Bots remains internal, analytics transport remains disabled, and deployed production, physical-device, named-screen-reader, human-rating calibration, and public-beta gates remain open. Classic, Legacy Play, Legacy FICS, homepage, `/play`, Games readiness, FICS/product boundaries, and the one-CTA board-first experience are unchanged.

## Season 11.5.1 isolated Coach update (2026-08-02)

`PlayV2CoachBoundary@1.0.0` admits an internal-only `Coach · Internal` mode through the separate `native-coach-stack`. It starts and completes the certified local Games flow while its bounded observer reports zero move commits, hidden-answer exposure, Training Memory writes, and Mastery writes. The existing educational `coach-stack`, Academy, Mentor, Guided Replay, Knowledge, Endgame Training, recommendations, and educational analytics resources remain outside the reachable graph.

Coach is not public-ready: assistance content, timing, frequency, suppression, and human review remain pending Season 11.5.2. Default hosting still serves the unavailable document for the beta namespace, public navigation remains absent, and deployed-production, physical-device, and named-screen-reader verification remain open. See [`PLAY_V2_COACH_BOUNDARY.md`](./PLAY_V2_COACH_BOUNDARY.md).

**Season 11.1.2 status: complete for educational isolation only. Play v2 remains QA-only and NOT READY for public beta.** Worker production certification, physical-device and assistive-technology testing, feedback, operational rollback, public enrollment/gating, and later release gates remain open.

## Season 11.2.1 controlled-entry update (2026-08-01)

`PlayV2BetaEntry@1.0.0` establishes `/play/beta` as the canonical future beta namespace without exposing it publicly. Authorized local internal requests for the root, Games, and Bots map only to `play-v2.html`; the exact server/build-time stage value owns admission before document selection. Default hosting and disabled/invalid access select a deterministic runtime-free, non-indexable unavailable document. There is no Legacy Play or FICS fallback and no invented invite or identity system.

The client preserves authorized Games/Bots/isolated-Coach deep links, refresh, back/forward, queries and fragments without depending on `simplified=1`. Educational Coach, Mentor, Players, unknown modes, encoded aliases and malformed descendants fail closed. Normal `/play`, `/`, Classic, and Legacy FICS ownership remains unchanged. The old exact QA query remains temporarily for regression compatibility and retires only after separately authorized migration.

Rollback is deterministic: remove or change the exact internal stage value. This prevents Play v2 runtime loading without deleting the implementation or rewriting history. Gate details, route mapping, security/accessibility behavior, test scope, and retirement conditions are recorded in [`PLAY_V2_BETA_ENTRY.md`](./PLAY_V2_BETA_ENTRY.md).

**Season 11.2.1 status: accepted locally for controlled internal entry only. Play v2 is still NOT a public beta.** Public authorization/entitlement, deployment, feedback, Worker/Bots production certification, physical-device and named-screen-reader validation remain open. No production verification is claimed.
## Season 11.6.2 update

Optional review-only Mentor is locally QA-certified behind the existing Play v2 gate. It remains `publicReady: false`; human copy review, WebKit automation, physical-device, and named-screen-reader validation remain gates. No production route or navigation changed.
## Season 11.6.3 update

Clean PostGame exits are locally certified by `PlayV2PostGameExitPolicy@1.0.0`. This adds no routes, recommendations, public navigation, or fallback and does not change the existing public-readiness gates.

## Season 11.7.1 update

[`PlayV2NativePlayersPolicy@1.0.0`](./PLAY_V2_NATIVE_PLAYERS_POLICY.md) freezes the only future provider as CAISSA-native and records all 16 native capability owners as missing with uncertified security, privacy, reliability, and testing gates. Static and runtime guards keep Players routes, tabs, DOM, resources, state bypasses, fictional data, and all FICS roles blocked. This is policy evidence only: Players remains not public-ready, no multiplayer infrastructure exists, and Season 11.7.2 presentation work has not begun.

## Hotfix 11.6.2.1 update

Mentor Review now has automation-backed zero-overflow reflow at 320, 360, 390, 768, and 1440 CSS pixels and at 200% zoom in Chromium and WebKit. The fix replaces clipped content-box board overflow with intrinsic shrink-safe sizing and makes workspace activation deterministic before measurement. All review controls and behavior remain present. This does not close physical-device or named-screen-reader gates and does not advance public readiness.

## Season 11.7.2 update

[`PlayV2PlayersPresentationPolicy@1.0.0`](./PLAY_V2_PLAYERS_PRESENTATION_POLICY.md) certifies the honest initial-beta state: Players is completely omitted rather than disabled, promoted, fabricated, or handed to FICS/Legacy Play. The generated entry removes inherited Classic/FICS navigation and homepage promotion metadata; compatibility-required legacy roots remain explicitly hidden, inert, aria-hidden, resource-free, and unreachable while source owners remain unchanged. Routes, state, resources, accessible navigation, and layout fail closed. Native infrastructure, product approval for any future presentation, physical-device/named-screen-reader validation, and public exposure remain open gates.

## Season 11.8.0 physical-device QA preparation update

[`PlayV2PhysicalDeviceQAPlan@1.0.0`](./PLAY_V2_PHYSICAL_DEVICE_QA_PLAN.md) defines a secure, reproducible manual matrix for iPhone Safari, Android Chrome, and tablet portrait/landscape. The versioned evidence schema and issue template require exact build attribution, real-device confirmation, observed behavior, sanitized evidence references, severity, reproduction, and retest disposition. They contain no fabricated device results.

The local server now binds to loopback by default. The documented device architecture keeps CAISSA on loopback behind a user-provisioned private-LAN HTTPS reverse proxy with a trusted local certificate, private name resolution, and narrowly approved firewall access. No server, proxy, public tunnel, firewall rule, certificate, DNS mapping, analytics transport, deployment, or production gate was started or changed by this preparation.

**Season 11.8.0 prepares QA; it does not certify a physical device.** Physical-device execution, named assistive-technology validation, evidence review, and public-beta authorization remain open gates. Play v2 remains internal-only and not publicly ready.

## Season 11.8.0A automation reconciliation update

[`PlayV2AutomationOwnerCatalog@1.0.0`](./PLAY_V2_AUTOMATION_OWNER_CATALOG.md) separates current Season 11 acceptance from preserved historical characterization. All 17 pre-physical-QA findings have evidence-based classifications. The beta entry now reflects isolated Coach and passive policy resources; Worker assertions reflect zero before Bots Play and one after; and current mobile ownership uses the gated beta document rather than the pre-Season-11 compatibility query.

The start-counter finding was a test timing race, not duplicate runtime ownership: the snapshot preceded completion of the first asynchronous start while the second activation was already rejected. Runtime behavior was unchanged. Status remains **NOT PHYSICALLY TESTED**; physical-device, named assistive-technology, evidence-review, and public-release gates remain open.

## Season 11.9.3D Vercel Hobby remediation update

The failed Production deployment `dpl_2GYYuLgGYMcXRipFUpeBfezga2PX` established the exact platform blocker: 18 Serverless Functions exceeded the Hobby limit of 12. The preceding schema failure had masked this deterministic quota rejection. Production remained disabled and its established aliases remained on the prior Ready deployment throughout the investigation and remediation.

The direct Public Beta no longer adds a Serverless Function. The existing middleware owns exact `disabled`/`public-beta` document selection for `/play/beta`, `/play/beta/games`, `/play/beta/bots`, and `/play/beta/coach`; prohibited descendants and the retired API namespace fail closed without loading a store or transport. All six invite-only endpoint files remain unchanged as excluded architectural history. The resulting deployment inventory is 12 production API functions plus middleware.

The first closed-gate deployment exposed a Vercel filesystem-precedence gap: `/play-v2-public-beta.html` could be served directly before its unavailable rewrite. The forward-only routing owner now includes all five generated Play v2 HTML filenames in the middleware matcher and always returns the runtime-free unavailable 404 document for direct access. Canonical Public Beta routes remain the only stage-authorized entry points.

Deployment hygiene now explicitly excludes historical endpoint sources, recursive `.vercel` output, reports, coverage, logs, certificates, keys, and QA artifacts. Size verification uses a clean deployment-source copy rather than a developer worktree containing ignored local datasets. This remediation is local evidence only: Production remains `disabled`, and a release retry still requires separate authorization and a new closed-gate deployment verification.
