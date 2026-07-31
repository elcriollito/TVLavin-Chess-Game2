# Play Mode Selection Analytics

Version: `PlayModeSelectionAnalytics@1.0.0`

Baseline: `88223cb20fc4803fbc02237db44a2e4554eb6221`

Scope: privacy-safe, observational mode-selection analytics for Simplified Play. This foundation has no external delivery, persistence, cookie, persistent identifier, or product decision authority.

## Existing-state audit

The application already loads Microsoft Clarity through the site-wide consent implementation. That integration is independent of this Play event contract and is not an approved sink for it. Game-record consent governs local game-history persistence, not analytics transport. No authoritative Play analytics consent, destination, or governance contract exists, so external delivery is prohibited and consent integration is deferred.

The Play route controller owns parsing, canonicalization, history, settled route state, and a subscriber boundary. The Simplified Play shell owns mode tabs and settled panel presentation. The lazy loader owns resource start and terminal outcomes. Analytics observes those completed decisions; it does not select routes, modes, panels, access, or resources.

| Event candidate | Owner/trigger | Allowed data | Forbidden data | Sink | Persistence | Risk/decision |
|---|---|---|---|---|---|---|
| Mode selected | Route observer after authoritative route notification | Allowlisted mode, previous mode, source, eligibility, load state, normalization, version, sequence | URL/query, identity, chess content, selections | Local diagnostics | none | Low; deduplicate one route cycle |
| Selection blocked | Route observer after inactive requested mode resolves | Requested mode, blocked eligibility, final normalization | Provider/player data and attempted URL | Local diagnostics | none | Low; never report blocked Players as selected |
| Route normalized | Route observer after canonical decision | Final mode and normalized state | Original raw route/query | Local diagnostics | none | Low; record category only |
| Lazy start/success/failure | Lazy loader’s authoritative attempt path | Mode, bounded outcome, allowlisted reason | Resource URL/path, exception, stack, provider payload | Local diagnostics | none | Low; stale completion ignored |
| Game/PostGame/Mentor activity | Future Season 10.13 owners | none in this task | all game and Mentor content | none | none | Excluded |

## Architecture and ownership

- `play-analytics-contracts.js` owns exact schemas, allowlists, validation, event construction, and deep freezing.
- `play-analytics-privacy-policy.js` publishes the explicit prohibited-data and no-transport policy.
- `play-analytics-dispatcher.js` owns creation sequencing, validation, deduplication, trusted local sinks, bounded buffering, failure isolation, and redacted diagnostics.
- `play-mode-selection-analytics.js` observes settled routes and correlated lazy outcomes.
- `play-route-controller.js` remains unchanged and authoritative.
- The shell supplies the allowlisted `mode-tab` source on its existing route call; it retains all interaction and focus ownership.
- The lazy loader issues optional observer notifications around its existing authoritative attempt; return values and product decisions remain unchanged.

Public API: `window.CaissaPlayAnalytics` with `createEvent`, `emit`, `registerSink`, `unregisterSink`, `getSnapshot`, `inspect`, and `dispose`. Only the fixed `local-diagnostics` sink exists by default. The only additional allowed sink ID is `qa-test`; arbitrary sinks and network targets are rejected.

## Versions

- `PlayAnalyticsEvent@1.0.0`
- `PlayModeSelectionPayload@1.0.0`
- `PlayAnalyticsDispatcher@1.0.0`
- `PlayAnalyticsSink@1.0.0`
- `PlayAnalyticsPrivacyPolicy@1.0.0`
- `PlayModeSelectionAnalytics@1.0.0`

No route, panel, lifecycle, Worker, or lazy-loader contract version changed.

## Event taxonomy

| Event ID | Authoritative trigger |
|---|---|
| `play_mode_selected` | Settled allowed/QA-only route selects Games, Bots, Coach, or Players |
| `play_mode_load_started` | Authoritative deferred resource attempt starts; `deduplicated` is represented as its bounded load state |
| `play_mode_load_succeeded` | Deferred resource reaches readiness while its selection remains current |
| `play_mode_load_failed` | Deferred resource attempt fails with an allowlisted reason |
| `play_mode_selection_blocked` | A known non-QA requested mode is denied before final route selection |
| `play_mode_route_normalized` | Canonicalization, inactive mode, unknown mode, or legacy route resolves to its final mode |

Game start, completion, PostGame, Mentor engagement, monetization, and retention events are intentionally absent.

## Event and payload dictionary

The immutable event keys are `schemaVersion`, `eventId`, `eventVersion`, `category`, `occurredAtBucket`, `sequence`, `source`, and `payload`. `occurredAtBucket` is always `null`; monotonic page-memory sequence is the only timing/correlation metadata. It resets on page load and is never persisted.

The exact payload keys are:

- `mode`: `games`, `bots`, `coach`, `players`.
- `previousMode`: those modes plus `none` or `unknown`.
- `routeSource`: `direct`, `mode-tab`, `primary-navigation`, `browser-back`, `browser-forward`, `browser-history`, `cold-restore`, `legacy-bridge`, `classic-bridge`, `qa-entry`, or `unknown`.
- `qaEligible`: boolean derived from the settled QA context.
- `productionEligible`: boolean; only Games is currently true.
- `accessState`: `allowed`, `qa-only`, `blocked`, `unavailable`, `normalized`, or `unknown`.
- `loadState`: `eager`, `not-required`, `started`, `succeeded`, `failed`, `deduplicated`, `unavailable`, or `unknown`.
- `failureReason`: `none`, `timeout`, `missing-resource`, `readiness-failed`, `dependency-failed`, `blocked`, `disposed`, or `unknown`.
- `routeNormalized`: boolean.
- `shellVersion`: bounded `SimplifiedPlayShell@x.y.z` value.
- `selectionSequence`: positive safe integer scoped to the page.

Back and Forward cannot be distinguished reliably by the existing history callback, so both use the explicitly documented `browser-history` value. No direction is guessed.

## Mode behavior

- Games: production eligible, `allowed`, eager, selected directly or after normalization.
- Bots: selected only with QA eligibility, production ineligible, `qa-only`; deferred load is correlated.
- Coach: selected only with QA eligibility, production ineligible, `qa-only`; bounded load failure cannot reverse the route.
- QA Players: selected as `qa-only`, production ineligible, and does not start a human game.
- Non-QA Players: emits blocked plus normalized Games; it never emits a selected Players event.

Classic, Legacy, and primary-navigation entry can supply only their allowlisted category. No prior page, referrer, FICS state, or game detail is recorded.

## Deduplication and stale work

The dispatcher retains at most 50 event signatures. The route observer also retains only the current normalized route signature. This suppresses click plus route notification, keyboard click synthesis, direct resolution plus cold initialization, repeated shell activation, and route synchronization duplicates without persistent identifiers. Browser-history restoration emits once when the authoritative mode changes.

Lazy attempts correlate through the current in-memory selection sequence. Start, deduplicated attempt, success, and failure use fixed outcome values. A success arriving after the user selects another mode is ignored. No retry is initiated by analytics.

## Buffer, sinks, and diagnostics

The event buffer holds at most 50 deeply frozen events and evicts oldest first. It is page-local, clears on disposal, and has no cross-tab sharing. Default snapshots expose only counts. Event snapshots require the explicit `{ qa: true, includeEvents: true }` request.

Diagnostics count created, emitted, rejected, duplicate, sink, eviction, selection, blocked, load, normalization, and disposal outcomes plus one bounded reason code. General diagnostics contain no payload history. Sink exceptions are counted and swallowed; routing, panels, focus, and games continue.

## Privacy, security, and consent

Explicitly prohibited: names, email, usernames, account IDs, IP addresses, URLs, queries, referrers, user agents, device IDs/fingerprints, session IDs, moves, PGN, FEN, positions, evaluations, PV, clock history, chat, Mentor content, Knowledge evidence, and provider payloads.

Contracts require exact keys, exact event IDs, enum values, bounded versions, safe integers, deep freezing, and dangerous-key rejection. Events contain no functions, DOM nodes, errors, stacks, resource paths, or arbitrary strings.

There is no fetch, XHR, beacon, WebSocket, SDK, endpoint, storage, cookie, service worker, persistent ID, or external sink. Because no authoritative Play analytics consent exists, transport remains disabled. A later governance task must define purpose, consent, destination, retention, deletion, access, and failure policy before any delivery can be considered.

## Resource proof

- Dispatcher instances: one global application boundary.
- Default sinks: one local no-op diagnostic sink.
- Buffer: 50 maximum; oldest-first eviction.
- Events per route cycle: one selected event, plus only applicable blocked/normalization and lazy outcome events.
- Network requests: zero analytics fetch/XHR/beacon/socket requests.
- Analytics storage writes and cookies: zero.
- Analytics listeners and timers: zero; the existing route subscription is reused and removable.
- New Workers and sockets: zero.
- Board count: unchanged at one.
- Lifecycle/FairPlay/game-start mutations: zero.
- Players human games: zero.

## Test coverage and future boundary

Unit tests cover versions, enums, immutability, JSON safety, malformed/hostile input, privacy, buffer bounds, eviction, trusted sinks, sink failure, disposal, route sources, all modes, blocked Players, normalization, deduplication, lazy outcomes, and stale completion. Static tests cover transport/resource/persistence absence, registration order, production isolation, architecture protection, and dependency/lockfile protection.

Chromium, Firefox, and WebKit cover direct Games, pointer Bots, keyboard Coach, QA Players, blocked non-QA Players, lazy start/success/failure, browser history, forbidden fields, storage/cookie neutrality, one board, Worker bound, zero human games, and zero analytics transport.

Future external transport requires the Season 10.13.5 governance and consent decision. Season 10.13.2 may add separately versioned game-start events, but it must not expand this payload or collect moves, exact chess content, identity, or private Mentor data.
