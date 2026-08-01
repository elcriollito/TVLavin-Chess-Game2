# Play Analytics Governance Audit

Status: governed for QA-only local observation; production analytics blocked. Governance version: `PlayAnalyticsGovernance@1.0.0`.

## Inventory and ownership

The frozen registry contains all and only 31 Season 10.13 events. Each event is version `1.0.0`, classified `product-aggregate`, retained only in page memory, requires a future authoritative Play analytics consent for external delivery, and is explicitly ineligible for external transport and production use.

| Event IDs | Category | Owner | Payload schema | Trigger/correlation | Count |
| --- | --- | --- | --- | --- | ---: |
| `play_mode_selected`, `play_mode_load_started`, `play_mode_load_succeeded`, `play_mode_load_failed`, `play_mode_selection_blocked`, `play_mode_route_normalized` | `play-mode` | `CaissaPlayModeSelectionAnalytics` | `PlayModeSelectionPayload@1.0.0` | route/mode selection sequence | 6 |
| `play_game_start_requested`, `play_game_start_succeeded`, `play_game_start_failed`, `play_game_start_blocked`, `play_game_start_deduplicated` | `play-game-start` | `CaissaPlayGameStartAnalytics` | `PlayGameStartPayload@1.0.0` | bounded active attempt | 5 |
| `play_game_completed`, `play_game_aborted`, `play_game_completion_failed` | `play-game-completion` | `CaissaPlayCompletionAnalytics` | `PlayGameCompletionPayload@1.0.0` | completion sequence | 3 |
| `play_postgame_shown`, `play_postgame_action_selected`, `play_postgame_action_succeeded`, `play_postgame_action_failed`, `play_postgame_action_blocked` | `play-postgame` | `CaissaPlayPostGameAnalytics` | `PlayPostGameActionPayload@1.0.0` | completion/action sequence | 5 |
| `play_mentor_review_requested`, `play_mentor_review_ready`, `play_mentor_review_failed`, `play_mentor_critical_moments_opened`, `play_mentor_guided_replay_started`, `play_mentor_replay_attempted`, `play_mentor_reference_revealed`, `play_mentor_knowledge_opened`, `play_mentor_summary_requested`, `play_mentor_summary_ready`, `play_mentor_summary_failed`, `play_mentor_exited` | `play-mentor` | `CaissaPlayMentorEngagementAnalytics` | `PlayMentorEngagementPayload@1.0.0` | completion/engagement sequence | 12 |

The optional game-start deduplication event is registered and emitted. No duplicate ID, conflicting schema, observer overlap, undocumented event, or missing existing failure event was found. Product/runtime ownership remains with routes, panels, lifecycle, records, PostGame, Analyze, Mentor, accessibility, performance, and event-lifecycle modules; analytics only observes their outcomes.

## Policy decisions

- Classification levels are `operational-safe`, `product-aggregate`, `restricted`, and `prohibited`. Current event records are categorical product aggregates; reason-code diagnostics are operational-safe. Restricted and prohibited values are rejected by exact payload contracts and enumerations.
- The master prohibited policy covers identity and persistent IDs; moves, notation, positions, board state; engine output; exact timing and history; Mentor prose and Knowledge evidence; free-form content; raw navigation data; and provider payloads.
- No authoritative Play analytics consent owner or control exists. External delivery is therefore blocked. Game-record consent, Microsoft Clarity, Settings, and account/session state are separate authorities and cannot be reused.
- Retention is page-memory only. The dispatcher limit is 50 with oldest-first eviction; observer records are bounded (mode/start 12, completion/PostGame 8, Mentor 12). Disposal clears active state. There is no persistence or cross-session continuity.
- Family budgets use page-lifetime counts: mode and game-start warn at 20/fail at 50; completion warns at 8/fails at 20; PostGame warns at 20/fails at 50; Mentor warns at 24/fails at 50. Clock ticks, move streams, and render cycles are prohibited triggers. Evaluation is observational and cannot alter product behavior.
- Dispatcher signatures bound duplicates for every category. Owners reject stale route, attempt, completion, action, and Mentor-session outcomes; disposal is terminal.
- Transport is `none`: no endpoint, SDK, fetch, XHR, beacon, socket, cookie, storage, Worker, or timer. Trusted sink IDs remain `local-diagnostics` and `qa-test`; current states are `local-noop` and `qa-buffer`. Arbitrary and approved-production sinks are blocked.
- Every registry record and the system-wide `PlayAnalyticsProductionEligibility@1.0.0` policy is false. Required future prerequisites are a consent owner and UI, approved sink, endpoint security review, retention approval, field validation, and release approval.

## Governance API and health

`window.CaissaPlayAnalyticsGovernance` exposes immutable copies through `getEventRegistry()` and `getPolicy()`, exact registry/owner/production validators, volume and retention evaluators, a redacted `inspect()` snapshot, and terminal `dispose()`. It exposes no buffered payload history.

Health reports registry/category/schema counts, active dispatcher and observer counts, sink states, buffer limit/current count, duplicate/stale/invalid/sink-failure counters, volume warning/failure status, production eligibility, consent state, transport, and the last reason code. All values are bounded and immutable.

## Security, privacy, and boundaries

Microsoft Clarity remains site-wide and is not a Play analytics sink. Settings owns no Play analytics consent and is not consulted. Game-record consent governs its own record feature only. No analytics module owns UI, games, boards, engines, FairPlay, lifecycle, navigation, accessibility, performance, or external integration behavior. Analytics failures remain isolated by the existing dispatcher and observers.

Static governance tests enforce registration order, unique production inclusion, no fixtures, transport/storage/cookie/resource prohibitions, fixed sinks, and false production eligibility. Existing analytics static guards continue to protect dependencies, lockfile, and the three architecture documents.

## Test matrix and blockers

The authoritative command `npm run test:play:analytics:governance` covers registry contracts, ownership, immutability, privacy policy, hostile registry shapes, consent, retention, volume/storm thresholds, deduplication/stale policy declarations, transport, sinks, production eligibility, redacted health, production registration, and Chromium/Firefox/WebKit runtime verification. The existing `npm run test:play:analytics` remains authoritative for event-family behavior and failure isolation; Play and repository suites cover responsive/Bots readiness and regression.

Analytics-governance blockers for release remain: no consent authority/UI, no approved transport or sink, no endpoint/security approval, no approved retention beyond memory, no field-validation program, and no release approval. Physical-device and screen-reader QA and external integrations also remain pending. Simplified Play remains QA-only, Players remains production-blocked, Legacy Play remains default, and Classic remains the default landing.
