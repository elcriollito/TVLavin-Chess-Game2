# CAISSA Native Play Experience — Product Boundary

Status: **Season 11.0.2 product-contamination authority**

Applies to: **Play v2 / CAISSA Native Play Experience**

Product principle: **Enter. Choose. Play.**

Audit baseline: `92cba54cf55773379bb09a14e0dd140c0079136b` on `main`, 2026-08-01

## 1. Purpose and immutable decisions

Play is for playing chess. Its primary surface begins with a game choice, keeps the board dominant, supports the game through completion, and then offers only bounded continuations of that completed game. Play v2 is not a lobby for another provider, a social-network preview, or an education dashboard.

The following decisions are immutable:

1. FICS cannot be a Play v2 provider, fallback, lobby, player/profile/identity/rating/presence source, challenge or matchmaking system, game server, clock authority, reconnect authority, recommendation, or handoff. FICS remains protected in CAISSA Classic and Legacy FICS only.
2. Academy, classes, courses, lessons, curriculum, Endgame Trainer, Endgame Library, Knowledge Units, Knowledge Platform, mastery, Training Memory, Guided Replay lessons, training recommendations, lesson cards, puzzles/exercises, and educational promotion cannot appear in the primary Play v2 experience.
3. Analyze may remain an external completed-game continuation with independent state and resources.
4. Mentor may remain only as explicit, optional, post-game review after isolation from Academy and educational-product capabilities.
5. Players remains blocked until CAISSA-native infrastructure exists. No fictitious users, ratings, presence, challenges, or matchmaking may substitute for it.
6. `/` remains CAISSA Classic; `/play` remains Legacy Play; analytics transport remains disabled. Public-beta activation is a later, separately authorized task.

## 2. Ownership and reachability model

| Boundary | Owner | Current loading/reachability | Required Play v2 relationship |
|---|---|---|---|
| Games, board, lifecycle, clocks, records, PostGame core | Play v2 over the legacy compatibility seam | Eager Play scripts; Simplified presentation only when `simplified=1` | Native Play core; remove provider/education vocabulary from shared policy inputs |
| Bots | Play v2 | `bots-stack`, five QA-only dynamic scripts | Admissible after Worker certification |
| Coach | Play v2 QA foundation | `coach-stack`, 12 QA-only dynamic scripts; depends on Bots | Current form excluded; a future assisted-play mode requires a new non-curricular contract |
| Players | Play v2 QA foundation | `players-stack`, 28 QA-only dynamic scripts | Entire mode/graph excluded until CAISSA-native services exist |
| Mentor | PostGame/Play v2 QA foundation | Six action-triggered QA-only groups, 31 dynamic scripts plus Guided Replay CSS | Review-only boundary or disabled |
| Analyze | Separate Analyze product | `analyze-deep`, two production-eligible dynamic scripts; opaque PostGame handoff | External post-game continuation only |
| CAISSA Classic | Classic owner over existing FICS runtime | Production-reachable separate section/page | Retain external-only; never import into Play v2 |
| Legacy FICS | FICS client/gateway owners | Production-reachable explicit FICS section and gateway | Retain legacy-only; regression-protected |
| Academy/endgame/knowledge products | Educational-product owners | Production sections/pages co-located in the monolithic entry documents | Retain educational-product only; never load/render from Play v2 |

Reachability terms used below:

- **unreachable**: no production or QA entry/import path found;
- **dormant bundled**: definition or eager code exists in the delivered document but is not executed without a trigger;
- **blocked runtime**: code can load or render but its own product action remains unavailable;
- **QA-reachable**: reachable through `simplified=1`, a QA mode, or a QA PostGame action;
- **production-reachable**: reachable without the Simplified QA gate as an existing product;
- **legacy-only**: owned by Classic, Legacy Play, or Legacy FICS rather than Play v2.

Dormant or blocked does not mean absent or acceptable.

## 3. Classification definitions

### FICS classifications

| Classification | Meaning |
|---|---|
| remove | Delete the occurrence from the future Play v2 graph/API/copy; do not delete a legacy owner |
| hide | Do not expose a route/tab/action while ownership is being separated; insufficient as final isolation |
| move | Relocate provider-specific vocabulary/code from Play v2 ownership to the correct legacy/shared owner |
| retain external-only | Keep as a separately navigated non-Play product |
| retain legacy-only | Keep exclusively for Classic/Legacy FICS or Legacy Play |
| isolate behind native boundary | Replace provider enumeration with a CAISSA-native interface that has no FICS implementation/fallback |
| test-only | Retain only as negative/regression evidence, never production-loaded |
| documentation-only | Historical/audit text with no runtime reachability |
| false positive | Search hit with no FICS/provider meaning, such as generic Worker fallback or chess challenge prose |

### Educational classifications

| Classification | Meaning |
|---|---|
| remove | Delete the occurrence from the future Play v2 graph/API/copy |
| hide | Suppress current UI as an interim block; insufficient as final isolation |
| move | Relocate capability to the educational or review owner |
| retain post-game only | Keep only after a completed game, with no in-game or dashboard entry |
| external link only | Permit navigation to an external product only where the boundary explicitly allows it; Play v2 currently allows Analyze, not educational promotion |
| isolate behind review-only boundary | Retain only technical completed-game review with no Academy/Knowledge/training behavior |
| retain educational-product only | Keep in Academy/endgame/knowledge products, absent from Play v2 |
| test-only | Retain solely as product-boundary/regression evidence |
| documentation-only | Historical/audit text with no runtime reachability |
| false positive | Search hit such as JavaScript `class`, CSS class names, chess `classical`, or ordinary game-phase “endgame” |

## 4. Complete FICS reference matrix

This inventory records every semantic FICS occurrence associated with or reachable from Play v2. Multiple literal lines belonging to one symbol/component are grouped under their exact file path; generic `fallback`, `challenge`, `presence`, `lobby`, `seek`, or `classic` hits without provider semantics are listed as false-positive families rather than miscounted as FICS.

### 4.1 Play-owned and shared runtime references

| Exact path | Symbol/component and import status | Reachability/activation | Ownership and risk | Classification |
|---|---|---|---|---|
| `js/play/fair-play-policy.js` | `SOURCES` includes `fics`; `FICS_LIVE_ASSISTANCE_DENIED`; eager script | Eager/dormant branch; callable by Play policy contexts | Shared Play policy. Direct provider vocabulary contaminates Play v2; moving it must preserve external-game assistance denial | move |
| `js/play/performance/play-load-registry.js` | `players-stack` statically lists FICS/Classic adapters among 28 dynamic sources | Eager registry; stack QA-loaded after Players selection | Play v2 registry. A blocked UI still carries a callable dependency graph | remove |
| `js/play/players-panel.js` | `CaissaPlayersPanel`: FICS/Classic status codes, labels, provider mapping, `open-fics`, `connect-fics`, `open-classic`, adapter creation, presence lookup, copy and buttons | Dynamic; QA-reachable via `/play/players?simplified=1` or mode tab; provider navigation actions execute | Play v2. Highest contamination: provider fallback/handoff is a visible product strategy | remove |
| `js/play/players/player-presence.js` | `PROVIDERS` includes `fics`; provider-qualified identity/rating model | Dynamic Players stack; dormant until QA mode | Play v2 Players contract. Could make FICS a player/identity/rating source | isolate behind native boundary |
| `js/play/players/presence-provider-adapter.js` | Generic presence adapter contract | Dynamic Players stack; no provider connection itself | Play v2. Valid future seam only if its registry is native-only | isolate behind native boundary |
| `js/play/players/presence-snapshot.js` | Generic provider snapshot/connection state | Dynamic Players stack | Play v2. Provider-neutral shape is reusable only behind native authority | isolate behind native boundary |
| `js/play/players/presence-registry.js` | Generic provider registry | Dynamic Players stack | Play v2. Must not register FICS/Classic in the native boundary | isolate behind native boundary |
| `js/play/players/presence-freshness-policy.js` | Generic freshness/staleness policy | Dynamic Players stack | Play v2; no FICS semantics by itself | isolate behind native boundary |
| `js/play/players/fics-presence-adapter.js` | `CaissaFicsPresenceAdapter`; dynamic import | QA-reachable, returns unsupported today | Play v2-specific FICS adapter. Dormancy does not cure dependency | move |
| `js/play/players/classic-presence-adapter.js` | `CaissaClassicPresenceAdapter`; maps Classic to provider `fics` | QA-reachable, returns unsupported | Play v2 bridge to Classic/FICS | move |
| `js/play/players/challenge-contracts.js` | `PROVIDERS` includes `fics`; provider-qualified challenge request | Dynamic Players stack | Play v2 contract can admit FICS challenge authority | isolate behind native boundary |
| `js/play/players/challenge-provider-adapter.js` | Generic challenge provider adapter | Dynamic Players stack | Reusable only behind CAISSA-native authority | isolate behind native boundary |
| `js/play/players/challenge-lifecycle.js` | Provider-qualified challenge lifecycle | Dynamic Players stack | No connection itself; must be native-only before activation | isolate behind native boundary |
| `js/play/players/challenge-registry.js` | Provider registry/dedupe/retention | Dynamic Players stack | Must not register FICS/Classic implementations | isolate behind native boundary |
| `js/play/players/fics-challenge-adapter.js` | `CaissaFicsChallengeAdapter`; dynamic import | QA-reachable, unsupported today | Direct dormant FICS challenge dependency | move |
| `js/play/players/classic-challenge-adapter.js` | `CaissaClassicChallengeAdapter`; Classic/FICS presentation relationship | QA-reachable, unsupported | Direct Classic/FICS handoff dependency | move |
| `js/play/players/caissa-challenge-adapter.js` | Future CAISSA adapter; no live backend | QA-reachable, unsupported | Correct conceptual owner but not sufficient infrastructure | isolate behind native boundary |
| `js/play/players/human-fair-play-contracts.js` | `FICS_PROVIDER_OWNED`, `CLASSIC_INHERITS_FICS` reason codes | Dynamic Players stack | Provider-specific Play vocabulary | move |
| `js/play/players/fics-human-fair-play-adapter.js` | FICS game/move/clock/result/reconnect authority report | QA-reachable, inspection-only | Explicitly models forbidden authority inside Play v2 | move |
| `js/play/players/classic-human-fair-play-adapter.js` | Inherits FICS inspection/authority | QA-reachable, inspection-only | Explicit Classic-to-FICS bridge | move |
| `js/play/players/caissa-human-fair-play-adapter.js` | Future native adapter | QA-reachable, incomplete | Keep only behind actual CAISSA services | isolate behind native boundary |
| `js/play/players/human-runtime-authority.js` | Generic authoritative runtime contract | Dynamic Players stack | Required future native seam; no provider connection itself | isolate behind native boundary |
| `js/play/players/human-clock-authority.js` | Generic authoritative clock contract | Dynamic Players stack | Must be backed only by CAISSA server clocks | isolate behind native boundary |
| `js/play/players/human-move-authority.js` | Generic authoritative move contract | Dynamic Players stack | Must be backed only by CAISSA game authority | isolate behind native boundary |
| `js/play/players/human-game-readiness.js` | Aggregates human authority readiness | Dynamic Players stack | Must fail closed until all native authorities exist | isolate behind native boundary |
| `js/play/players/human-play-infrastructure-contracts.js` | FICS actions/providers and login/lobby/seeks/games/clocks/reconnect capabilities | Dynamic Players stack | Detailed forbidden provider surface embedded in Play v2 | move |
| `js/play/players/human-play-provider-matrix.js` | FICS and Classic runtime/connection/identity ownership matrix | Dynamic Players stack | Treats FICS as product alternative | move |
| `js/play/players/human-play-coming-later-policy.js` | Recommends FICS/Classic alternatives | Dynamic Players stack | Fallback messaging violates no-FICS boundary | remove |
| `js/play/players/human-play-section-policy.js` | FICS presence/challenge source, unavailable copy, actions | Dynamic Players stack | Visible provider fallback/handoff | remove |
| `js/play/players/human-play-block-readiness.js` | FICS/Classic capability evidence, primary FICS action, authority copy | Dynamic Players stack | Blocker UI is itself contaminated | remove |

Count: **30 Play-owned/shared runtime file entries**, including **17 files with literal FICS tokens** and **13 provider-neutral/native contract files reachable through the contaminated Players graph**. The latter are classified because the requested audit includes player/identity/rating/presence/challenge/clock providers, not only the word “FICS.”

### 4.2 Protected Classic and Legacy FICS references

| Exact path/group | Symbol/component and reachability | Ownership/risk | Classification |
|---|---|---|---|
| `index.html`; `yahoo-classic.html` | FICS CSP endpoint, stylesheet/scripts, nav, Classic lobby/login/tables, Spectator, full `#ficsSection`; eager production documents | Classic/Legacy FICS. Co-location creates presentation-leak risk, but deletion would break protected products | retain legacy-only |
| `app.js` | FICS client initialization, Classic integration, section behavior and related legacy handlers | Legacy runtime, production-reachable only through its sections/actions | retain legacy-only |
| `js/fics-client.js`; `js/fics-style12.js`; `css/fics-client.css` | Gateway/socket/protocol, Style12 game state, FICS presentation | Legacy FICS owner | retain legacy-only |
| `js/yahoo-classic.js`; `css/yahoo-classic.css` | Classic presentation over existing FICS runtime | CAISSA Classic owner | retain external-only |
| `gateway/fics-local-node/fics-gateway.cjs` | Local gateway | Legacy FICS infrastructure | retain legacy-only |
| `gateway/fics-cloudflare-worker/src/worker.js`; `src/gateway-utils.js`; `wrangler.toml`; `package.json`; scripts/tests/README | Production gateway and operational tooling | Legacy FICS infrastructure; must not become a Play v2 service | retain legacy-only |
| `deployment/nginx-fics-gateway.conf`; `docs/fics/FICS-SETUP.md`; `docs/fics/FICS-DEPLOYMENT.md` | Gateway deployment/configuration/docs | Legacy operations | documentation-only |
| `package.json` (`fics:gateway`, `fics:dev`) | Explicit operator commands | Legacy tooling; not invoked by Play v2 | retain legacy-only |
| `js/caissa-navigation.js` | `fics`/`yahooClassic` section navigation and Classic default | Shared site navigation; production-reachable | retain external-only |
| `js/play/legacy-play-compatibility.js` | Legacy action adapter; no FICS provider import | Shared compatibility seam; textual “legacy” is not a FICS handoff | false positive |

### 4.3 FICS tests and documentation

| Exact paths | What they prove | Classification |
|---|---|---|
| `tests/play/presence-contracts.test.js`; `challenge-contracts.test.js`; `players-panel.test.js`; `human-play-infrastructure.test.js`; `human-fair-play.test.js` | Direct FICS/Classic adapter, provider, handoff and blocked-Players behavior | test-only |
| `tests/browser/play-players.spec.js`; `play-human-infrastructure.spec.js`; `play-human-fair-play.spec.js` | QA runtime reachability and provider blocking | test-only |
| `tests/play/fair-play-policy.test.js`; `tests/browser/play-fair-play-policy.spec.js`; `play-evaluation-rail.spec.js` | Denial of live assistance for FICS/external authority | test-only |
| `tests/play/play-regression-manifest.js`; `manual-play-qa-manifest.js`; `season-10-closure.test.js`; `tests/browser/play-accessibility.spec.js` | Classic/FICS isolation and external/manual gates | test-only |
| Other hits in board, clock, Worker, Bots, lifecycle, theme, visual and endgame tests | Generic “fallback,” “challenge,” “classic,” or fixture text without FICS authority | false positive |
| `docs/architecture/PLAY_V2_PUBLIC_BETA_READINESS_AUDIT.md`; this document; Season 10 release/audit documents | Architectural prohibition and historical evidence | documentation-only |

## 5. Complete educational reference matrix

### 5.1 Play shell, policy and PostGame references

| Exact path | Symbol/component and lifecycle position | Writes/answers/content | Classification |
|---|---|---|---|
| `js/play/performance/play-load-registry.js` | Eager definitions for `coach-stack` and six Mentor groups; action/mode dynamic imports | Enables all educational graphs; no write itself | remove |
| `js/play/performance/play-lazy-loader.js` | Readiness/global checks for Coach, educational analysis, Guided Replay, Knowledge and summary | Loads same-origin scripts only; no memory/mastery write | move |
| `js/play/simplified-play-shell.js` | Coach tab before/during game; mode click loads Coach | In-game instructional surface | remove |
| `js/play/post-game-experience.js` | Post-game Guided Replay button, educational analysis pipeline, learning concepts, Knowledge mapping/links, Academy mentor selection, Coach lesson summary, Mentor summary action | Can expose fixed instruction, Knowledge links, reference move/evaluation/PV after reveal; current memory/mastery writes are zero | isolate behind review-only boundary |
| `js/play/fair-play-policy.js` | `training` source/authority and local training allowance, during game | Allows training assistance by contract | move |
| `js/play/ui/play-visual-identity.js`; `js/play/ui/play-visual-components.js` | `learning-continuation`, `mentor-learning-bridge`, game-over expression | Educational presentation vocabulary | move |
| `js/play/analytics/play-analytics-contracts.js`; `play-mentor-engagement-analytics.js` | Knowledge-opened event vocabulary; post-game | Transport disabled, but vocabulary follows educational surface | remove |

### 5.2 Coach graph

All 12 files are dynamic, QA-only, reachable through `/play/coach?simplified=1` or the Coach mode tab, and run before/during a game. They write neither Training Memory nor Mastery and intentionally suppress exact move/PV revelation, but they deliver instructional content and therefore remain prohibited.

| Exact path(s) | Educational symbol/content | Classification |
|---|---|---|
| `js/play/coach-panel.js` | Learner/teaching metadata, “Learning goal,” “Study this verified concept,” Knowledge link | remove |
| `js/play/coach/coach-profile.js`; `coach-registry.js` | Learner levels, teaching focuses, instructor profiles, habits, lessons, Endgame Guide | retain educational-product only |
| `js/play/coach/coach-intervention-policy.js`; `coach-intervention-candidate.js`; `coach-messages.js` | Bounded instructional interventions/explanations | retain educational-product only |
| `js/play/coach/coach-session.js`; `coach-observation-service.js` | In-game educational session/observation and Knowledge attachment | retain educational-product only |
| `js/play/coach/endgame-phase-classifier.js`; `endgame-detectors.js` | Game-phase facts and lesson candidate detection; phase detection alone is chess logic, lesson selection is educational | retain educational-product only |
| `js/play/coach/endgame-knowledge-map.js`; `endgame-publication-gate.js` | Knowledge Unit IDs and `/endgame-library` links/publication gate | retain educational-product only |

### 5.3 Mentor foundation and educational graph

All entries are dynamic and QA-only. They are reachable only after a completed game and explicit PostGame actions, but post-game position alone does not make educational dependencies admissible.

| Group and exact paths | Educational dependency/content | Writes/hidden answers | Classification |
|---|---|---|---|
| `mentor-foundation`: `js/mentor/mentor-capabilities.js`, `mentor-registry.js`, `mentor-selection-resolver.js`, `mentor-context.js`, `mentor-review-readiness.js`, `mentor-review-request.js`, `mentor-review-request-registry.js`, `mentor-foundation.js` | Academy IDs/profiles/affiliation/selection precedence, Knowledge release, training recommendation/mastery capabilities | Recommendation/mastery are deferred/disabled; no writes | isolate behind review-only boundary |
| `mentor-analysis`: `js/mentor/educational-analysis-policy.js`, `educational-analysis-contracts.js`, `educational-engine-analysis.js`, `educational-analysis-pipeline.js` | Explicit educational engine analysis and technical envelopes | Captures best move and principal variation; no memory/mastery writes | isolate behind review-only boundary |
| `mentor-critical-moments`: `js/mentor/critical-moment-contracts.js`, `critical-moment-signals.js`, `critical-moment-scoring.js`, `critical-moment-selector.js` | Selects technical moments feeding Guided Replay/Knowledge | No direct writes; outputs analysis evidence | isolate behind review-only boundary |
| `mentor-guided-replay`: `js/mentor/guided-replay-prompts.js`, `guided-replay-contracts.js`, `mentor-guided-replay.js`, `guided-replay-view.js`; `css/mentor-guided-replay.css` | Exercise-like replay, attempts, reflection, scaffolds, Knowledge links | Answer/PV/evaluation hidden until attempt/reveal, then exposed; diagnostics assert zero memory/mastery writes | retain educational-product only |
| `mentor-knowledge`: `js/mentor/concept-evidence.js`, `knowledge-mapping-policy.js`, `knowledge-mapping-contracts.js`, `educational-concept-mapper.js`, `knowledge-mapping-registry.js`, `mentor-future-adapters.js` | Knowledge Unit mapping, public educational links, Training Memory/Mastery/Recommendation adapters | Adapters are readiness-only and report zero writes; recommendations false | retain educational-product only |
| `mentor-summary`: `js/mentor/mentor-summary-contracts.js`, `mentor-summary-evidence.js`, `mentor-summary-templates.js`, `mentor-summary-registry.js`, `mentor-summary.js` | Concepts, prioritized Knowledge Unit action, rematch/next-action guidance | Explicit zero memory/mastery/recommendation writes, but output is instructional | isolate behind review-only boundary |

Minimum review-only Mentor boundary: a completed immutable game record enters an isolated reviewer; explicit user action starts bounded technical analysis; output may summarize decisive moments and answer review questions; it must not read Academy selection, learner level, curriculum, Knowledge release/units, Training Memory, Mastery, recommendations, lesson/exercise systems, or educational product navigation. It must not reveal engine PV/best move as an in-game answer, start before completion, write learning state, or block core PostGame actions.

### 5.4 Protected educational products, tests and false positives

| Exact paths/group | Ownership/meaning | Classification |
|---|---|---|
| Academy markup/scripts/styles in `index.html`, `yahoo-classic.html`, `app.js`, `css/academy.css` | Separate Academy product, production-reachable through its section | retain educational-product only |
| `endgame-trainer.html`, `endgame-practice.html`, `endgame-library.html`; their `js/endgame-*`, CSS, data and knowledge repository | Separate endgame/knowledge products and routes | retain educational-product only |
| `vercel.json` routes for `/academy`, `/endgame-trainer`, `/endgame-practice`, `/endgame-library` | External educational routes, not Play v2 activation | retain educational-product only |
| `tests/play/coach-foundation.test.js`; `endgame-coach-foundation.test.js`; `educational-analysis-pipeline.test.js`; `critical-moment-selector.test.js`; `guided-replay.test.js`; `knowledge-integration.test.js`; `mentor-foundation.test.js`; `mentor-review-request.test.js`; `mentor-summary.test.js`; `post-game-experience.test.js`; `play-lazy-loader.test.js`; `play-mentor-engagement-analytics.test.js`; `play-regression-manifest.js` | Direct Coach/Mentor/education behavior and guard evidence | test-only |
| `tests/browser/play-coach.spec.js`; `play-endgame-coach.spec.js`; `play-educational-analysis-pipeline.spec.js`; `play-critical-moments.spec.js`; `play-guided-replay.spec.js`; `play-mentor-foundation.spec.js`; `play-post-game-experience.spec.js`; `play-analyze-resources.spec.js` | QA runtime reachability and isolation evidence | test-only |
| `class` declarations, `className`/CSS classes, chess `classical`, ordinary “endgame” game phases, generic puzzles/exercises outside Play reachability | No educational product meaning by themselves | false positive |
| Season 10/11 architecture, release and audit text | Historical/audit record | documentation-only |

Count: **52 Play/PostGame/lazy production file entries** in the educational reachability graph: 9 shell/policy/UI/analytics entries, 12 Coach entries, 8 Mentor foundation, 4 Mentor analysis, 4 critical-moment, 4 Guided Replay, 6 Knowledge, and 5 summary entries. Guided Replay CSS is recorded separately. **21 direct Play test files/specs** are classified test-only. Co-located external Academy/endgame/knowledge files remain educational-product only.

## 6. Route and activation matrix

| Mechanism | Target | Current state | Contamination reachability |
|---|---|---|---|
| `/`, `/yahoo-classic`, default restoration | Classic | Production-reachable | Protected Classic/FICS; external to Play v2 |
| `/play`, `/play/games` without `simplified=1` | Legacy Play presentation | Production-reachable | Does not activate Simplified shell; preserves legacy default |
| `?section=play` | Canonicalized to `/play`; Games | Production route adaptation | No Simplified shell unless `simplified=1` is also present |
| `?simplified=1` on a Play route | Simplified shell | QA-reachable | Activates mode rail and PostGame contamination paths |
| `/play/bots?simplified=1` or Bots tab | `bots-stack` | QA-reachable dynamic import | No FICS/education dependency found; Worker gate separate |
| `/play/coach?simplified=1` or Coach tab | `coach-stack` (depends on Bots) | QA-reachable dynamic import | Loads current educational Coach graph |
| `/play/players?simplified=1` or Players tab | `players-stack` | QA-reachable dynamic import; human games blocked | Loads FICS/Classic adapters/contracts/copy and permits provider navigation |
| `/play/{bots,coach,players}` without flag | Games canonical fallback | Production-reachable blocked normalization | Contaminated mode is not loaded |
| Unknown `/play/*` | Games fallback | Production-reachable normalization | No contaminated load |
| PostGame `mentor-review` | `mentor-analysis` → foundation | QA action after completed game | Loads Academy-aware foundation and educational analysis |
| PostGame critical-moment selection | `mentor-critical-moments` | QA post-game action | Analysis evidence feeding education graph |
| PostGame Guided Replay | `mentor-guided-replay` | QA post-game action | Exercise, hidden/revealed answers/PV |
| PostGame Knowledge enrichment | `mentor-knowledge` | QA post-game action | Knowledge Unit links and future learning adapters |
| PostGame Mentor Summary | `mentor-summary` | QA post-game action | Instructional action/Knowledge output |
| PostGame Analyze | `analyze-deep`, opaque session-storage handoff token | Production-capable only from completed game | Allowed external continuation; independent Analyze state |
| Players `open-fics`/`connect-fics`/`open-classic` | Navigation to legacy sections | QA-reachable after Players load | Direct forbidden fallback/handoff from Play v2 |
| Browser Back/Forward/refresh | Route controller/popstate | QA/production according to URL | Restores contaminated mode if explicit flag remains |
| Local storage | Theme/preferences, game persistence consent/recovery; navigation explicitly ignores stored section | No Play v2 feature admission found | Does not independently activate Coach/Players/Mentor |
| Session storage | Analyze opaque handoff | Post-game only | No FICS; allowed Analyze continuation |
| Hashes | Academy anchors and legacy page fragments | External products | No Simplified mode activation found |
| Runtime config/feature flags | Route query and loader `qa` option | QA only | `qa: true` is passed internally once contaminated action/mode is selected |
| Prefetch | `prefetch(id,{qa:true,intent})` | QA-only policy; no production caller found that prefetches contaminated groups | Dormant capability; still part of graph |
| Recovery/fallback | Game recovery and route canonicalization | No contaminated provider activation found | Generic recovery is not a FICS fallback |
| Tests | Direct module load, route query, action calls | Test-only | Proves dormant and QA paths are executable |

No storage key, hash, environment variable, server rewrite, or production feature flag was found that independently bypasses `simplified=1` to activate Coach or Players. The lazy source definitions are delivered eagerly, while their scripts are dynamic and QA-reachable rather than initially bundled as script elements.

## 7. Mode admission decisions

| Mode | Decision | Evidence and remaining work |
|---|---|---|
| Games | **Allowed after isolation gates** | Core Games files contain no direct FICS or educational dependency. Contamination remains in eager shared `fair-play-policy.js`, shell mode rail, PostGame, and load registry. Admit only in a beta-specific allowlist after those edges are removed/moved and device/Worker/accessibility gates close. |
| Bots | **Allowed after isolation and Worker certification** | Bot stack has no semantic FICS/Academy/lesson/Knowledge dependency; “challenge” in bot presentation is ordinary prose. It inherits contaminated shell/PostGame/shared policy edges. Worker certification remains separate and mandatory. |
| Coach | **Blocked in current form** | Twelve-file stack is structured around learner level, teaching focus, instructional interventions, lessons, Knowledge mapping and Endgame Library links. A future assisted-play mode must be non-curricular, disclose assistance/fair-play scope, give bounded optional during-game observations without profiles/lessons/Knowledge links/training state, and remain unavailable for human rated/casual games. No refactor is authorized here. |
| Mentor | **Blocked in current form** | Exact dependencies are Academy mentor identities/selection, educational engine analysis, critical moments, Guided Replay exercises with revealable engine reference/PV, Knowledge mapping/links, future Training Memory/Mastery/Recommendation adapters, and instructional summary actions. Writes are currently zero/disabled, but reachability exists. Requires the review-only boundary in §5.3. |
| Players | **Blocked** | The 28-file stack contains FICS/Classic presence, challenge, fair-play, provider matrix, capability and handoff dependencies. Future admission requires CAISSA-owned identity/profile, presence, challenge, matchmaking, authoritative game/move/clock/result/reconnect, ratings/history, moderation/reporting, fair-play, privacy, abuse and observability services. No FICS adapter/fallback and no fictional data. |

## 8. Required future isolation work

1. Create a beta-specific resource allowlist/document graph containing only Games initially; exclude Coach, Players, all FICS/Classic adapters/copy/actions, and educational Mentor groups.
2. Move FICS-specific fair-play denial and Players evidence out of Play v2 ownership while retaining provider-neutral denial for externally authoritative games.
3. Remove Coach and Players from future beta routing, mode tabs, accessibility tree, analytics vocabulary, lazy registry and prefetch graph. Hiding alone is not acceptance.
4. Split PostGame core actions from educational Mentor actions. Either implement the review-only contract or omit Mentor.
5. Preserve Analyze as an opaque, completed-game, external handoff with separate state/resources.
6. Define and test the CAISSA-native Players provider boundary before any Players UI returns.
7. Add static and runtime guards that fail on FICS literals/provider adapters, Academy/Knowledge/training imports, educational copy/links, or excluded modes in the beta graph.
8. Add negative route, DOM, network, global-symbol and loaded-resource assertions for public beta.
9. Keep `/`, `/play`, Classic, Legacy FICS and analytics transport unchanged while isolation is developed.

## 9. Classic and Legacy FICS regression protections

Future isolation must:

- never delete or change `js/fics-client.js`, `js/fics-style12.js`, `css/fics-client.css`, gateway code/configuration, Classic runtime, legacy FICS markup, credentials/login, lobby/seeks, Style12 board, server clocks, reconnect, or legacy navigation;
- relocate or exclude only Play v2-owned references; do not make legacy modules import from the new Play v2 native boundary;
- preserve `/`, `/yahoo-classic`, the `fics` section, `/play` Legacy Play, CSP gateway allowance required by legacy pages, and operator scripts;
- add regression tests proving Classic/FICS scripts still load only for their owner, Play v2 loads none of them, provider navigation remains available from legacy surfaces but absent from Play v2, and no second FICS connection is created;
- compare network/socket counts, board ownership, clocks, login/reconnect, navigation, and default routes before and after isolation.

The repository evidence supports isolation without modifying Classic or Legacy FICS now. Wholesale deletion or global string removal would be unsafe and is prohibited.

## 10. Evidence limitations

- This is static repository analysis plus existing deterministic tests; it is not a deployed network trace or production bundle analyzer.
- Dynamic reachability was inferred from route controller, shell, lazy registry/loader, panel and PostGame call paths and corroborated by tests. No production exposure was enabled.
- The monolithic entry documents co-locate Play, Classic, FICS, Academy and other products. “Not rendered in the Simplified shell” is weaker than bundle isolation.
- Search terms generate many false positives (`class`, `classical`, generic challenge/presence/fallback, ordinary endgame phase). Matrices classify semantic units rather than inflate counts with syntax/CSS words.
- No Training Memory, Mastery or recommendation write was found in the reachable Mentor implementation; explicit diagnostics/capabilities report zero or disabled. The adapters and concepts remain contamination because they are reachable.
- No physical-device, screen-reader, deployed Worker, live FICS, or public-beta behavior was exercised in this documentation-only task.

## 11. Season 11.0.2 acceptance status

**COMPLETE — AUDIT/CLASSIFICATION ONLY. PLAY V2 REMAINS NOT READY FOR PUBLIC BETA.**

Every relevant semantic FICS and educational reference found in the Play v2-owned/reachable graph has a path-specific classification; literal occurrences are distinguished from dynamic reachability and false positives. Games, Bots, Coach, Mentor and Players have explicit admission decisions. Classic and Legacy FICS remain protected. No isolation, route, feature gate, UI, runtime, Worker, analytics, dependency, lockfile, tag, push or deployment change is authorized or implemented by this document.

## 12. Enforced bootstrap boundary â€” `PlayV2FicsIsolation@1.0.0`

Season 11.1.1 establishes a document-level resource boundary for the existing QA activation. Exact `simplified=1` Play requests resolve to generated `play-v2.html`; normal `/play`, the homepage, CAISSA Classic, and Legacy FICS retain their legacy entries and behavior.

The Play v2 entry allowlists same-origin scripts/styles, approved dynamic groups, existing local Worker forms, native/local-machine providers, Play Games/Bots/Coach routes, and the external post-game Analyze transition. Ownership classification denies any FICS-named/owned resource, Players resource or group, Classic/Legacy/external provider resolution, provider route/fallback, and cross-origin network destination. The lazy loader enforces this contract only when the dedicated entry installs it, preserving legacy loader behavior.

The generator fails closed if future executable script or stylesheet elements reference FICS or `js/play/players/`. Browser tests also inspect requests and post-load resources, submit hostile FICS provider/fallback inputs, attempt Players dynamic activation, and verify no identity, rating, presence, challenge, matchmaking, or Players panel surface appears.

Before separation, the shared entry eagerly downloaded the following protected resources even when unused. Download is inclusion in the resource/network graph and creates future execution, security, privacy, caching, and fallback risk. After separation they remain solely in protected legacy entries:

- `css/fics-client.css`
- `js/fics-style12.js`
- `js/fics-client.js`
- legacy human-provider compatibility resources under `js/play/players/`

Players remains blocked until CAISSA-native identity, presence, rating, challenge, matchmaking, authoritative game/clock/result, reconnect, moderation, privacy, and abuse infrastructure exists. This boundary creates none of that infrastructure and exposes no beta route.

## 13. Enforced educational boundary â€” `PlayV2ProductBoundary@1.0.0`

The dedicated QA entry installs a frozen playing-only contract before routing, navigation, lazy registration, and shell initialization. Its policy prohibits Academy/classes/lessons/courses/curriculum, Endgame product surfaces, Knowledge Units, Guided Replay, Mastery and Training Memory surfaces/writes, recommendations, educational promotions, current Coach, current Mentor, and Players. Analyze is admitted only as `external-post-game`; a future Mentor boundary is `optional-review-only`.

The deterministic builder removes prohibited educational resource elements and DOM templates rather than hiding them after download. Runtime guards classify scripts, styles, dynamic groups, routes, transitions, PostGame actions, DOM text, and network destinations. The Play v2 lazy allowlist is exactly `bots-stack` and `analyze-deep`. FICS and product-boundary guards are both applied to every lazy group, style, and script.

Current states:

| Surface | Play v2 state | Protected ownership |
|---|---|---|
| Coach | Blocked and omitted from route, tab, registry and resources | Existing implementation remains in legacy entry/modules and unit ownership tests; future assisted-play Coach is separate work |
| Mentor | Blocked; no action, auto-launch, resource group, adapter, panel or Analyze attachment | Existing Academy/Mentor/Guided Replay/Knowledge implementation remains in legacy entry/modules |
| Players | Blocked and omitted | Requires CAISSA-native infrastructure |
| PostGame | Result-first core actions only | Original educational PostGame remains outside dedicated Play v2 entry |
| Analyze | Clean opaque external continuation | Independent Analyze state/resource ownership preserved |
| Academy and Endgame products | No Play v2 resource, DOM or navigation ownership | Standalone/legacy documents and routes unchanged |

Security/privacy evidence confirms no new cookie, storage system, analytics transport, identity/profile bridge, educational state transfer, PGN upload, external dependency, or network destination. Explicit local completed-game persistence remains consent-controlled; it is not a Training Memory or Mastery write. Analytics transport remains disabled.

The boundary does not certify physical devices, VoiceOver, TalkBack, NVDA, or JAWS, and it does not make Play v2 public-beta ready.
