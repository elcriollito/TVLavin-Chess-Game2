# Play v2 Coach isolated assisted-play boundary

Season: **11.5.1**

Contract: `PlayV2CoachBoundary@1.0.0`

Status: **accepted locally for internal assisted play; assistance certification pending 11.5.2; not public-ready**

## Product and ownership boundary

Coach is a real local chess game with optional bounded assistance. It reuses the certified Games board, chess.js rules authority, lifecycle, single clock, local opponent and engine, GameRecord, clean PostGame, and Analyze handoff. The isolated layer owns only fixed configuration, bounded event observation, and presentation. It creates no board, Worker, engine, clock, lifecycle, record, PostGame, or Analyze owner and cannot commit a user move.

The contract declares assisted play as the primary purpose; one primary board; existing single clock/local opponent owners; and `isolated-play-v2-coach` as assistance owner. Academy, lessons, curriculum, Endgame Training, Guided Replay, Knowledge Units, Training Memory surfaces/writes, Mastery surfaces/writes, recommendations, Mentor, hidden answers, automatic best moves, autoplay, FICS, and analytics transport are prohibited. `publicReady` is false and content/frequency certification is explicitly `pending-11.5.2`.

## Current Coach graph audit

| Existing dependency | Classification | Play v2 decision |
| --- | --- | --- |
| Board adapter, chess.js/App game, Games compatibility command, lifecycle, clock, local engine, GameRecord, PostGame core, Analyze handoff, EvaluationRail under existing policy | reusable provider-neutral gameplay | Reused without a new owner. |
| `js/play/coach/coach-profile.js`, registry, session, intervention policy/candidates, observation service, messages, and `js/play/coach-panel.js` | standalone Coach educational ownership | Preserved for legacy/standalone use; excluded from Play v2. |
| Endgame phase classifier, detectors, publication gate | standalone Coach educational ownership | Excluded; no Endgame Coach behavior is imported. |
| Endgame knowledge map and knowledge links | Knowledge-owned / prohibited educational ownership | Excluded. |
| Academy pages/resources and lesson/course/curriculum surfaces | Academy-owned | Excluded and unchanged. |
| Mentor foundation, analysis, critical moments, Guided Replay, knowledge mapping, summary | Mentor-owned / Knowledge-owned | Excluded and unchanged. |
| Training Memory and Mastery stores/surfaces | Training Memory/Mastery-owned | No reads, writes, or resource reachability. |
| Coach mode/start/completion analytics vocabulary | analytics-only | Existing vocabulary remains, but transport remains disabled; isolated panel creates no analytics sink. |
| Coach unit/browser fixtures | test-only | Standalone tests preserved; new focused native tests are separate. |
| Architecture records | documentation-only | No runtime reachability. |

## Resource and admission model

`native-coach-stack` loads only `coach-configuration.js`, `coach-assistance.js`, and `coach-panel.js`. The legacy `coach-stack` remains registered but is denied by `PlayV2ProductBoundary@1.0.0`. Both product and FICS guards separately allowlist only the native group for Play v2.

Authorized internal QA/beta entry may show `Coach · Internal`. Default hosting keeps `/play/beta/coach` unavailable, public navigation contains no Coach entry, and normal `/play` remains Legacy Play. Coach readiness is separate: clean resources, certified Games owners, valid configuration, bounded assistance, no prohibited resource, and no learning-write owner are all required. It never inherits readiness merely because Games is ready.

## Setup and event boundary

The compact setup contains assistance level (`minimal` or `standard`), focus (`general` or `safety`), timing (`after move` or `on request`), 5+0/10+0, White/Black, and one `Play` CTA. These values configure the isolated boundary only; detailed message content and frequency remain deferred.

The observer accepts only game start, user turn, candidate user move where supported, committed user move, clock state, and terminal state. Its immutable diagnostics report zero move commits, hidden answers, Training Memory writes, and Mastery writes. Future opponent moves, unrestricted PV/best-move answers, unrelated history, identity, and educational profiles are outside its input contract.

## PostGame, accessibility, security, and remaining work

Coach uses clean PostGame result, termination, Rematch, New Game, PGN copy/download/consent-save, and Analyze. It adds no lesson summary, recommendation, progress, mastery update, Knowledge card, or automatic Mentor launch.

The internal/pending state is visible and programmatic; setup has a labeled group and labeled native controls; the single CTA is keyboard/pointer/touch operable; focus remains visible; the assistance status is a bounded atomic live region; and forced-colors, contrast, reduced-motion, zoom/reflow, Axe, and board-first layouts are automated. Physical devices and named screen readers remain uncertified.

No identity bridge, educational profile, persistence, PGN upload, external service, FICS connection, cookie, analytics transport, hidden-answer logging, or arbitrary engine configuration is introduced. Season 11.5.2 must certify assistance content, timing/frequency, event-to-message behavior, suppression, and human review before readiness can advance.
