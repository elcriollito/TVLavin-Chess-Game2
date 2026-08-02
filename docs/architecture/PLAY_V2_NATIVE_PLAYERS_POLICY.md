# Play v2 CAISSA-native Players policy

**Contract:** `PlayV2NativePlayersPolicy@1.0.0`

**Season:** 11.7.1

**Status:** policy accepted locally; Players is blocked and is not public-ready

## Immutable decision

Play v2 Players has exactly one permitted future provider: `caissa-native`. The current runtime is `blocked`, the route is blocked, the tab is omitted, runtime resources are prohibited, and public readiness is false. FICS is prohibited as provider, fallback, identity/profile/presence/rating source, lobby, seek/challenge/matchmaking system, game server, clock or reconnect authority, and moderation provider. FICS remains legitimate only in CAISSA Classic and Legacy FICS.

No user, account, profile, presence, rating, challenge, match, database, credential, cookie, network service, analytics transport, or fictional substitute is created by this policy. Even complete-looking evidence cannot activate Players under version 1.0.0; a future explicit policy version and independently certified native infrastructure are required.

## Current inventory and ownership

| Occurrence | Classification and disposition |
| --- | --- |
| `js/play/players-panel.js` | Blocked dormant legacy graph; FICS/Classic copy, actions, and adapters make it prohibited in Play v2 runtime. |
| `js/play/players/fics-presence-adapter.js`, `fics-challenge-adapter.js`, `fics-human-fair-play-adapter.js` | Prohibited Play v2 providers; dormant and excluded, not absent. |
| `js/play/players/classic-presence-adapter.js`, `classic-challenge-adapter.js`, `classic-human-fair-play-adapter.js` | Dormant bridges to Classic-owned behavior; excluded from Play v2. Classic ownership itself remains protected. |
| `js/play/players/caissa-challenge-adapter.js`, `caissa-human-fair-play-adapter.js` | Provider-neutral/future names only; not native multiplayer infrastructure and excluded while certification is missing. |
| `presence-snapshot.js`, `presence-registry.js`, `presence-provider-adapter.js`, `presence-freshness-policy.js`, `player-presence.js` | Provider-neutral future contracts in the blocked graph; no presence is produced. |
| `challenge-contracts.js`, `challenge-lifecycle.js`, `challenge-provider-adapter.js`, `challenge-registry.js` | Provider-neutral future contracts in the blocked graph; no challenge is produced. |
| `human-runtime-authority.js`, `human-move-authority.js`, `human-clock-authority.js`, `human-game-readiness.js` | Dormant authority/readiness contracts; not certified native services. |
| `human-fair-play-contracts.js`, `human-play-infrastructure-contracts.js`, `human-play-provider-matrix.js`, `human-play-section-policy.js`, `human-play-block-readiness.js`, `human-play-coming-later-policy.js` | Blocked dormant policy graph containing historical provider/FICS vocabulary; excluded. No “Coming Soon” presentation is enabled. |
| Route controller | Reserved `players` vocabulary is a blocked-state guard; direct, mixed-case, encoded, query, fragment, history, storage, and configuration attempts cannot admit the mode. |
| Shell, mode registry, lazy loader, generated entry | Players tab/panel/resource group is omitted; direct `players-stack` load rejects. |
| Analytics vocabulary | Dormant/test vocabulary only; transport remains disabled and no Players event is emitted by this work. |
| `index.html`, `yahoo-classic.html`, FICS client/gateway and legacy tests | Classic-owned or Legacy FICS-owned; retained and unchanged. |
| Players tests and architecture records | Test-only or documentation-only evidence, never providers. |

The detailed historic FICS occurrence matrix remains in `PLAY_V2_PRODUCT_BOUNDARY.md`. No dormant code is represented as absent.

## Native capability gates

Every row is a public-activation dependency. Every security, privacy, reliability, and testing gate is `required-not-certified`, and every current status is `missing`.

| Capability | Required owner |
| --- | --- |
| Authentication and identity | native-identity-authority |
| Public/private profile boundaries | native-profile-authority |
| Presence | native-presence-authority |
| Challenges | native-challenge-authority |
| Matchmaking | native-matchmaking-authority |
| Game-session authority | native-game-session-authority |
| Server-authoritative clocks | native-clock-authority |
| Reconnection | native-reconnection-authority |
| Ratings and provenance | native-rating-authority |
| Moderation and abuse reporting | native-moderation-authority |
| Blocking and safety | native-safety-authority |
| Privacy and consent | native-privacy-authority |
| Data retention/deletion | native-data-governance-authority |
| Observability | native-operations-authority |
| Operational rollback | native-release-authority |
| Availability and failure recovery | native-reliability-authority |

## Identity, privacy, and rating honesty

Future authentication identity, public chess profile, display name, rating identity, presence, and private account data are separate boundaries. A future design must establish purpose limitation, consent, authorization, disclosure, retention/deletion, and abuse controls before collecting data; this record does not pretend that a retention policy governs nonexistent data.

Future ratings require a defined system, game-eligibility rules, provisional status, anti-abuse controls, authoritative results, auditability, an uncertainty policy, rollback/correction, and explicit product approval. FICS ratings, bot estimates, local strength, and invented initial ratings cannot be presented as earned Players ratings.

## Threat gates

The following are unmitigated future threats, not completed controls: account enumeration, impersonation, presence leakage, challenge spam, matchmaking abuse, rating manipulation, clock tampering, reconnect hijacking, moderation evasion, personal-data overexposure, cross-product identity confusion, and FICS fallback reintroduction. Their mitigations belong to the corresponding security/privacy/reliability/testing certification gates and must include server authority, least disclosure, abuse throttling, auditable decisions, revocation, incident response, and fail-closed rollback as appropriate.

## Fail-closed and accessibility behavior

Beta-shaped malformed routes are classified before Legacy Play fallback and receive the runtime-free unavailable document. Client parsing canonicalizes blocked attempts to Games without loading Players or FICS, and direct lazy recovery rejects. Analyze, optional Mentor review, PostGame, Classic handoff, and Legacy FICS handoff cannot activate Players.

Because Players is omitted, it has no tab, panel, `aria-controls` target, focus target, or announcement. Keyboard mode order remains Games, Bots, Coach. Automated Chromium and WebKit checks cover omission, focus order, reduced motion, forced colors where supported, and serious/critical axe findings. This is not physical-device or named-screen-reader certification.

## Guards and evidence

The deterministic builder requires this policy, rejects Players scripts/resource groups and Players DOM, while its scoped exclusions preserve legitimate Classic/Legacy FICS assets. Contract tests freeze all declarations and 16 gates, reject route/resource/provider/state bypasses and fabricated data, verify a passive no-I/O policy, and preserve legacy ownership. Browser tests cover malformed routes, state/lazy bypasses, network/DOM omission, and accessible mode order. Existing Games, Bots, Coach, PostGame, Mentor, FICS, product-boundary, beta-entry, route, lazy-loader, and Worker suites remain regression authorities.

Season 11.7.1 accepts policy enforcement only. Native multiplayer remains unimplemented, Players remains blocked, and public activation remains prohibited. Public presentation work is deferred to Season 11.7.2.

## Season 11.7.2 presentation decision

[`PlayV2PlayersPresentationPolicy@1.0.0`](./PLAY_V2_PLAYERS_PRESENTATION_POLICY.md) formally omits Players from the initial beta: no enabled or disabled tab, card, route, panel, lobby, accessible copy, layout slot, fallback, or analytics event. “Coming Soon” remains separately approval-gated and is not displayed. All native capability gates remain missing.
