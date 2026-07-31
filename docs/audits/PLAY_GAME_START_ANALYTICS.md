# Play Game-Start Analytics Audit

Contract baseline: `PlayGameStartPayload@1.0.0`, `PlayGameStartAnalytics@1.0.0`, dispatcher `1.1.0`, privacy policy `1.1.0`.

## Ownership and path matrix

| Start path | Owner | Trigger | Configuration source | Success evidence | Failure evidence | Analytics risk |
|---|---|---|---|---|---|---|
| Games Start Game | GamesPanel / legacy compatibility | primary CTA | validated Games draft | command accepted plus active lifecycle/board | invalid draft, dependency or lifecycle rejection | exact clock/color leakage |
| Games New Game | GamesPanel / legacy compatibility | active-panel CTA | current validated draft | same authoritative readiness | command rejection | navigation confused with start |
| Bots Play Bot | BotsPanel / BotSession | primary CTA | active catalog selection | accepted command, active lifecycle/board; Worker remains product-owned | invalid selection, engine/dependency failure | Bot name or preset leakage |
| Coach Play Coach | CoachPanel / CoachSession | primary CTA | active Coach configuration | accepted command, active lifecycle/board; policy remains product-owned | invalid selection, engine/dependency failure | Coach identity/settings leakage |
| Post-game Rematch | PostGameExperience | Rematch action | retained authoritative configuration | fresh accepted start and readiness | unavailable configuration/command | prior result or game correlation |
| Post-game New Game | PostGameExperience | New Game action | retained configuration | only when the current owner actually starts | configuration-only navigation emits nothing | false success |
| Players Find Match | PlayersPanel policy | disabled/blocked action | production eligibility | never proprietary success | `production-blocked` | fabricated human game |
| FICS/provider entry | provider boundary | provider entry | provider-owned | only provider-confirmed session entry | provider unavailable | identity/provider payload leakage |
| Restore | existing runtime owner | direct restore | restored authoritative configuration | active lifecycle/readiness | stale/invalid restore | state or URL leakage |

Analytics observes these owners and never calls lifecycle, board, clock, Worker, engine, FairPlay, routing, or provider APIs. Provider and blocked-Players paths are contract-tested because no local live provider session is authoritative.

## Event taxonomy and triggers

- `play_game_start_requested`: emitted after an actual activation and authoritative categorical configuration read.
- `play_game_start_succeeded`: emitted once only after the existing command succeeds and lifecycle/board readiness is observable.
- `play_game_start_failed`: emitted once for an actual attempt that cannot complete.
- `play_game_start_blocked`: emitted for an activated policy/eligibility denial, never merely from viewing Players.
- `play_game_start_deduplicated`: optional diagnostic emitted when the bounded pending-action signature suppresses a duplicate.

CTA click alone is never sufficient success evidence. New Game that only returns to configuration produces no game-start event; a later primary CTA owns the next attempt.

## Payload dictionary and category mappings

The exact payload keys are `mode`, `startSource`, `timeControlCategory`, `colorCategory`, `opponentType`, `assistanceCategory`, `startState`, `failureReason`, `qaEligible`, `productionEligible`, `attemptSequence`, and `shellVersion`.

Time is reduced in memory to bullet (up to 2 minutes), blitz (over 2 and below 10), rapid (10 through below 30), classical (30+), untimed (zero), an explicit provider-owned category, or unknown/custom. Exact minutes, seconds, and increment never enter an event. Random records `random`, never its realized color. Opponents are only engine, bot-catalog, coach-engine, human-provider, human-unavailable, none, or unknown. Assistance is only unassisted, coach-assisted, engine-opponent, provider-owned, blocked, or unknown.

Failure reasons are the fixed allowlist: invalid-configuration, dependency-unavailable, engine-unavailable, lifecycle-rejected, fairplay-denied, provider-unavailable, production-blocked, stale-action, duplicate-action, disposed, unknown. Exception text and raw product diagnostics are discarded.

## Deduplication, stale handling, and retention

Attempts use a page-memory monotonic sequence. At most four pending records exist; oldest-first deterministic eviction bounds memory. One action key may have one pending request. Each attempt accepts one terminal outcome; replaced, completed, unknown, and disposed attempts cannot later succeed. No identifier or dedup signature persists across a page session. The shared QA buffer retains at most 50 validated redacted events and is cleared on dispatcher disposal.

## Privacy, consent, and transport

No authoritative analytics consent owner exists. Transport and persistence are therefore `none`: no endpoint, SDK, fetch/XHR/beacon/socket, local/session storage, IndexedDB, cookie, account integration, or external sink. Only the existing bounded local diagnostic buffer and explicitly registered trusted QA-test sink are possible.

Prohibited data includes identity, URLs/queries, exact time controls/increments, names/ratings, game/session/lifecycle/Worker IDs, board selections/orientation, moves, PGN/FEN/positions, engine output/evaluation/PV, Mentor or provider content, precise timestamps, results, termination, and duration. Future production delivery requires consent, governance, retention, schema, and transport approval outside this contract.

## Failure isolation and resources

Observer and sink exceptions are caught and counted. Analytics cannot retry, display an error, change focus, delay or block start, mutate configuration, create readiness, rotate lifecycle, alter FairPlay, or create boards, clocks, Workers, timers, sockets, listeners, games, or provider sessions. Expected steady state is one dispatcher, one observer per application boundary, one local diagnostic sink, buffer limit 50, pending limit 4, and zero external resources or product mutations.

## Verification

Unit coverage validates schemas, hostile keys, enums, category reduction, privacy, request/outcome correlation, blocked Players, provider fixture, deduplication, stale outcomes, disposal, and failure isolation. Browser coverage validates categorical Games request/success and resource neutrality plus deterministic blocked/provider behavior across Chromium, Firefox, and WebKit. Existing Play gates cover Games, Bots, Coach, Players, Post Game, lifecycle, board, clock, Worker, FairPlay, routing, accessibility, responsive behavior, and repository regression.
