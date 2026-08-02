# Play v2 Bot Worker readiness

> Season 11.6.1: shared result-first PostGame explicitly tears down active Bot Worker ownership and prepares a fresh Worker only for successful Rematch. Worker certification and public gates remain unchanged.

Season 11.4.2A / 11.4.2 local certification record
Contract: `PlayV2BotWorkerReadiness@1.0.0`

## Acceptance status

Native Bots is locally certified against the production-equivalent build and
server configuration. It remains internal, `publicReady = false`, has not been
deployed, and has no physical-device certification.

## Architecture before and after

Previously, shared application bootstrap constructed `EngineAdapter`, whose
constructor immediately created a route-relative Worker. The Worker therefore
existed before a Bots session and outlived several ownership exits.

`EngineAdapter` remains the only technical Worker owner. Its legacy default is
still eager. The dedicated Play v2 bootstrap explicitly supplies
`autoStart: false`; the dormant adapter provides the existing interface without
constructing or fetching a Worker. The Native Bots lifecycle validates route,
profile, color and time, creates the Bots session, and then requests `start()`.
The existing game lifecycle remains the only move-commit owner.

## Contract and ownership

The frozen contract declares one maximum active Worker; zero at bootstrap,
passive entry, readiness, setup and profile selection; one permitted after the
Play commit; EngineAdapter technical ownership; Native Bots session lifecycle
ownership; no automatic Retry; and no silent, main-thread, FICS, remote, or
analytics fallback. Deployed production and physical-device verification are
false.

## Asset, provenance, CSP and MIME

The sole approved URL is `/engine/stockfish-working.js`. EngineRegistry and the
adapter use that root-relative allowlisted path, which cannot be replaced by a
query, storage, profile, or remote configuration value. Direct checks passed
from `/play/beta`, `/play/beta/games`, and `/play/beta/bots`.

The 1,579,948-byte embedded JavaScript/WebAssembly asset has SHA-256
`723fda70117bfa8d5053a7bc4ae50cdc96dc9e3fd41b57627e4dfa0a0025957a`.
Repository commit `f8659abcf87ba914a7bafe7e04cb15b8a0625018` records its source as
`stockfish.js@10.0.2` via jsDelivr. Its embedded header and
`engine/STOCKFISH-NOTICE.md` preserve upstream and GPL-3.0 attribution. Runtime
performs no CDN engine download and makes no supporting WASM request.

The generated document and response header use `worker-src 'self'` without
`blob:`, wildcard, remote Worker origin, or `unsafe-eval`. The local production-
equivalent server returned status 200 and `text/javascript`; the release output
contains the exact engine and notice.

## Generation-attributed bounded handshake

Each construction increments a private generation. Listener closures accept
messages only when both generation and Worker identity remain current. The
ordered sequence is construct, attach listeners, send `uci`, require `uciok`,
apply allowlisted options, send `isready`, require `readyok`, and mark ready.
The separate `uciok` and `readyok` deadlines are 4,000 ms each. Timeout,
constructor error, Worker error, or message error invalidates the generation
before detaching listeners and terminating. A terminated generation cannot make
its replacement ready.

## Search and teardown

Attributed candidate searches retain their session/FEN/personality generation,
accept one terminal result, reject stale output, and restore MultiPV. The Bots
search deadline is 10,000 ms. Malformed terminal output times out closed;
illegal personality output cancels isolation, stops the clock, ends the partial
game, and releases ownership.

| Exit | Required result |
| --- | --- |
| Initialization/handshake/Worker/message/search failure | Invalidate, detach, terminate, zero Workers |
| Resignation, timeout, mate, stalemate or rule draw | Terminate before/with PostGame |
| PostGame | No idle Worker retained |
| Rematch or New Game | Prior zero, then one fresh generation after explicit action |
| Analyze, Back, Games switch or route exit | Stop, invalidate, detach, terminate |
| Page hide/refresh, gate disable or disposal | Best-effort synchronous termination |
| Explicit Retry | Complete teardown before exactly one replacement |

## Failure and Retry policy

Deterministic fixtures cover constructor rejection, missing/stale handshake
responses, Worker/message errors, search timeout, malformed and illegal output,
termination and route/mode exit during work, duplicate Play/Retry, delayed old
generation output, and delayed-resource behavior. Failures create no clock,
GameRecord, partial-game commit, fallback, or orphan Worker. One initialization
failure exposes a concise focused keyboard Retry while preserving selections.
Retry is never automatic or concurrent; a second failure remains unavailable.

## Accessibility and WebKit contrast

The panel communicates preparing, active, recoverable error and unavailable
states without technical details or an announcement loop. Play is disabled
during initialization; Retry is keyboard-operable and receives focus after the
error. Reduced motion, forced colors, zoom/reflow and automated serious/critical
Axe checks pass.

WebKit reproduced the Games time-option contrast defect at 1.24–1.38:1 because
translucent light surfaces retained white text. Opaque theme card/selected fills
and explicit theme text now pass the same Chromium and WebKit Axe gate without
suppression.

## Local performance observations

Three headless Chromium production-equivalent runs, using the real bundled
Worker and a depth-2/two-candidate fixture, observed:

- first-ready: 153.5–160.2 ms; median 159.5 ms;
- bounded candidate search: 22.6–27.0 ms; median 26.2 ms;
- synchronous termination signal: 0–0.1 ms; median 0.1 ms.

These are local automation observations, not field or physical-device claims.

## Legacy and product boundaries

Analyze, Arena, Classic and Legacy Play retain explicit eager EngineAdapter
compatibility. Homepage and `/play` defaults are unchanged. Legacy FICS remains
isolated from Play v2. Games lazily starts its existing full-power engine only
after its own Play action and does not acquire Bots lifecycle ownership. Coach,
Mentor, Players, educational surfaces, Training Memory, Mastery and analytics
transport remain blocked.

## Remaining gates

Actual deployed response verification, physical mobile/tablet testing, named
screen-reader testing, and public-beta authorization remain pending. No public
availability claim is made.
