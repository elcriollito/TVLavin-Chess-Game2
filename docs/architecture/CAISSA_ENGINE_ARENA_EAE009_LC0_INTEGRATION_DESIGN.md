# CAISSA Engine Arena EAE-009 — isolated Lc0 integration design review

Date: 2026-09-21. Decision status: **architecture approved for an isolated transport
proof, not production integration**. Branch:
`design/lc0-eae009-arena-integration-review`, based on certified lab commit
`9afa02c5d0c731609d0cc749eb7ba042897b0bc3`. No production code, routes,
headers, registry, Match/Tournament selector, or deployment changes are proposed
by this document.

## 1. Evidence and scope

The EAE-008A [lab report](CAISSA_ENGINE_ARENA_EAE008A_LC0_STOP_CLEANUP.md)
certifies only pinned desktop Chromium: Lc0 `v0.33.0-dev+git.482bb4a`, source
`482bb4a830287b726ebe7d42f14ab7f5f17c18a0`, Emscripten 3.1.64,
ONNX Runtime Web 1.27.0 WASM/CPU, and CSSLab Maia 1100 v1.0 network SHA-256
`e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`.
It passed 20/20 active stop/restart, 20/20 fresh cooperative cleanup, and 20/20
legal searches; zero normal parent force-kills and zero observed workers after
each lifecycle. It requires `crossOriginIsolated`, `SharedArrayBuffer`, WASM
threads/SIMD, Asyncify, and memory growth. The prototype's upstream-related
[PR 2432](https://github.com/LeelaChessZero/lc0/pull/2432) is closed and
unmerged. Firefox, Safari, iOS, Android, physical mobile devices, and production
CAISSA have **not** been certified.

The current [`vercel.json`](../../vercel.json) gives the site
`Cross-Origin-Opener-Policy: same-origin-allow-popups` and no site-wide COEP.
Its main CSP allows specific Clerk, Stripe, PayPal, Chessbase, FICS, analytics,
font, image and other external resources. `index.html` has a separate meta CSP;
both policies need evaluation in any *future* route or transport change. Existing
auth, payments, third-party embeds, Chess TV, PGN/market integrations and
Stockfish runtimes are production contracts, not acceptable collateral damage.
No current Lc0 provider exists in [`engine-registry.js`](../../js/engine-registry.js).

## 2. Browser constraints — what actually crosses the boundary

- A threaded Emscripten build needs `SharedArrayBuffer` in a cross-origin
  isolated context. A future **top-level** Lc0 origin can use `COOP: same-origin`
  and `COEP: require-corp` with its own restrictive CSP and exclusively local
  or CORS/CORP-approved assets. The isolated page and its worker must check
  `crossOriginIsolated` before initialization. [Emscripten pthreads](https://emscripten.org/docs/porting/pthreads),
  [COEP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy),
  and [COOP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)
  explain the prerequisites.
- Putting that page in a cross-origin iframe under the present non-isolated
  `www` top-level page does **not** isolate the child. The entire ancestor/frame
  chain must participate, with the relevant permissions policy. A sandboxed
  iframe is not a shortcut. [Isolation in iframes](https://web.dev/articles/coop-coep#isolation_in_iframes).
- Opening `lc0.caissa-chess.org` as a top-level page can isolate it, but its
  `COOP: same-origin` separates it from the `www` opener's browsing-context
  group. Do **not** rely on `window.opener`, a retained `WindowProxy`,
  `window.closed`, `window.postMessage`, or a transferred `MessagePort` as the
  primary transport. `postMessage` itself supports cross-origin windows **if**
  a live reference exists; that prerequisite is the problem here. An explicit
  two-origin browser probe remains an EAE-010 verification gate, not a hidden
  assumption. [COOP opener separation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy),
  [postMessage prerequisites](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage).
- `SharedWorker`, Service Worker clients, and `BroadcastChannel` are same-origin
  (and sometimes storage-partition) tools, not a bridge from `www` to `lc0`.
  They may coordinate *within* the isolated origin only. [SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker),
  [Service Worker registration](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register),
  [BroadcastChannel partitioning](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API).
- A browser-to-server `fetch`, same-origin SSE/EventSource, or WebSocket is a
  viable transport **class** between independently isolated top-level pages.
  The main page's `connect-src 'self'` can use a future same-origin HTTPS CAISSA
  session endpoint without a new external allowance. Do not assume this
  automatically authorizes `wss:` in every browser; [CSP `connect-src`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src)
  documents that exception. The isolated origin can have its own narrowly
  scoped `connect-src`. Cross-origin WebSocket handshakes
  still require strict server-side `Origin` checks plus authentication;
  `Origin` alone is not proof of user identity. SSE is server-to-browser only;
  commands need a separate POST. Polling is technically possible but increases
  latency/load. A separate broker/pub-sub plane is required to bridge two
  server instances; a WebSocket connection alone is not durable session state.
- Vercel's [June 2026 WebSocket guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
  says Functions can accept WebSockets, pinned to an instance for its maximum
  duration with external durable state. The older/general [limits page](https://vercel.com/docs/limits)
  still says Functions cannot act as WebSocket servers. **This documentation
  conflicts.** EAE-010 must validate the actual account/runtime/plan and
  connection limits, or use a dedicated managed relay. Do not bake either
  assertion into a production design. Separate origin routing and headers
  likewise require a tested deployment topology, not merely a `vercel.json`
  path rewrite. [Vercel headers](https://vercel.com/docs/project-configuration/vercel-json).

No communication probe is added in EAE-009: the standards exclude iframe and
direct-opener designs clearly enough to choose an architecture. A **tiny
two-origin, dummy-message relay** is the first implementation gate below.

## 3. Options and decision matrix

The matrix rates **burden/risk** (Low is favorable, High is unfavorable),
except browser/mobile compatibility, performance and tournament suitability,
where High is favorable. These are qualitative design judgments, not measured
benchmarks. “Dedicated” includes option C's separate top-level window and
session relay; a dedicated origin *without* a relay does not solve transport.

| Dimension | Whole-site isolation | Dedicated isolated origin + relay | Single-thread direct browser | Remote compute |
| --- | --- | --- | --- | --- |
| Security burden | High | Medium | Medium | High |
| Production regression risk | High | Low–Medium | Medium | Medium |
| Browser compatibility | Medium, untested | Medium, desktop proof only | Unknown | High, network-dependent |
| Mobile compatibility | Unknown | Unknown; disabled initially | Unknown | Medium–High, network-dependent |
| Search performance | High local | High local, relay adds control latency | Unknown, likely worse; measure | High with provisioned GPU, queue-dependent |
| Implementation complexity | Medium–High | High | High/unknown porting | High |
| Operational cost | Low–Medium | Medium (relay/state/bandwidth) | Low after port | High (compute/concurrency) |
| Maintenance | High cross-site policy audit | Medium–High transport + isolated release | High custom build divergence | High infrastructure + model updates |
| Tournament suitability | High if isolation safe | Medium pending lifecycle/relay gates | Unknown | Medium pending queue/cost gates |
| Long-term scalability | Client-limited | Broker-limited but search client-side | Client-limited | Server compute-limited |

### A. Whole-site `COOP: same-origin; COEP: require-corp`

It offers the simplest same-origin Worker integration and keeps engine messages
local. It also changes the entire `www` browsing-context policy. The current
`same-origin-allow-popups` explicitly accommodates external popup flows;
changing it can sever Clerk/OAuth/payment window references. COEP can block
cross-origin no-CORS scripts/images/fonts/iframes unless their providers send
suitable CORS/CORP headers. Audit Clerk and challenge frames, Stripe and PayPal,
analytics, CDN scripts/fonts, Chessbase/PGN embeds, Chess TV, game-fetch/market
endpoints, and every `index.html`/route CSP before even a preview. Vercel can
set response headers, but application and third-party compatibility is not
guaranteed by that mechanism. Arbitrary Lc0 code is not introduced if assets
stay pinned, yet the site-wide regression and ongoing dependency-policy cost
are unacceptable at this stage. **Not recommended.**

### B/C. Dedicated origin, separate engine window, CAISSA session relay

Keep `www` unchanged. An explicit user gesture opens a **top-level** isolated
window, which loads pinned Lc0 and the Maia network only after a short-lived
session claim. Arena and the Lc0 window independently connect to a scoped
broker; the broker routes bounded UCI-like control/results but never performs
chess search. The browser's popup blocker, user closing the window, network
loss, stale messages and intermediary state add complexity. It minimizes
production header blast radius and retains a client-side engine. This is the
**primary architecture**, contingent on EAE-010 transport and resource gates.

```text
www.caissa-chess.org / Arena                     lc0.caissa-chess.org (top-level)
existing headers, auth, Stockfish                 COOP same-origin + COEP require-corp
LocalWorkerRuntimeAdapter                         pinned Lc0 + Maia in own Worker
          |                                                |
  same-origin authenticated API/SSE              scoped authenticated relay channel
          +------------- CAISSA session broker -----------+
                     routing, leases, sequence, quotas
                     NO neural inference or chess search
```

Initial main-origin transport preference is authenticated same-origin HTTPS
POST for commands and an authenticated `fetch` streaming/SSE-framed response
for results, fitting current `connect-src 'self'`. Native `EventSource` is an
option only if cookie-backed authorization or a short-lived scoped stream
ticket is safely designed; it cannot simply carry the existing bearer header.
If latency/backpressure is unacceptable, validate a same-origin WebSocket
endpoint on the actual Vercel plan or a separately routed managed service;
its CSP behavior must be tested and any explicit `wss:` allowance requires a
separate review. The isolated origin may use WSS to the broker under its own
CSP. Durable routing/leases live outside function memory, with bounded TTL.
No browser-to-browser socket or `window.opener` dependency is assumed.

### D. Single-thread, non-SAB build

ONNX Runtime Web documents that `env.wasm.numThreads = 1` disables its own
multithreading, as already configured in the lab. **That does not remove
Emscripten's four-worker pthread pool or threaded WASM requirement.** A real
alternative needs a separately compiled Lc0 binary *without* `-pthread`, plus
reworked safe active-stop/lifecycle behavior, the same network and identity
checks, and separate browser benchmarks. Emscripten says a threaded binary
cannot dynamically fall back to non-threaded operation; two builds are needed.
[ORT thread flag](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html),
[Emscripten build variants](https://emscripten.org/docs/porting/pthreads).
The pinned upstream-related PR supplies no certified non-SAB artifact. SIMD
may still be available separately, but usable performance, stop/reuse, cleanup
and mobile behavior are **unknown**, not “just slower.” A small separate
feasibility task can test this. It is the **fallback architecture only if**
that task passes functional/performance/mobile gates; do not ship a speculative
build.

### E. Remote compute

An authenticated session routes UCI-like requests to CAISSA-operated CPU/GPU
workers. It avoids browser SAB/pthread requirements and may broaden devices,
but replaces client-side inference with server cost, queues, capacity planning,
rate limiting and denial-of-service exposure. GPU/CPU price and throughput
depend on hardware, model, concurrency and time controls; no numeric cost is
credible without a workload benchmark. It also transmits positions/PVs to
the service, increasing privacy and operational obligations. Only signed,
fixed binaries/networks and no user-uploaded code would be acceptable. Not
recommended for the first Lc0 Arena participant.

All options require dependency and engine/network integrity controls, strict
message schemas, quotas and worker-leak observation. Client-side search does
**not** make a competitive result authoritative: a user can modify their own
browser or forge a bestmove. Rated/prize play would need a separate trust model.

## 4. Relay session and identity contract (conceptual; no tables yet)

The broker creates an ephemeral, competition-scoped record after authenticating
the main CAISSA user through the current server-side auth boundary:

```json
{
  "lc0SessionId": "opaque-random-id",
  "userSessionRef": "server-only-auth-reference",
  "arenaCompetitionId": "competition-id",
  "participantRole": "white-or-black",
  "providerId": "lc0-browser-maia-1100-cpu",
  "runtimeVersion": "v0.33.0-dev+git.482bb4a",
  "runtimeCommit": "482bb4a830287b726ebe7d42f14ab7f5f17c18a0",
  "backend": "onnxruntime-web-wasm-cpu",
  "networkId": "CSSLab Maia 1100 v1.0",
  "networkSha256": "e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4",
  "runtimeInstanceId": "per-worker-random-id",
  "state": "CLAIMING|READY|THINKING|STOPPING|DISCONNECTED|TERMINATED",
  "generation": 1,
  "createdAt": "server-time",
  "expiresAt": "bounded-server-time"
}
```

No general Clerk bearer or user cookie is copied to the isolated origin. The
main authenticated API mints a single-use, short-lived claim code, bound to
user, competition, role, origin and session. It can be handed to the top-level
window in a fragment (not an ambient query string), immediately cleared from
history with `replaceState`, then exchanged over TLS for a narrowly scoped
connection capability. A fragment still requires XSS, shoulder-surfing,
history/referrer and extension threat review; it is **not** a security boundary
by itself. Exact `Origin` allowlist, server-side ticket consumption, anti-CSRF
for cookie-authenticated endpoints, capability rotation, TTL, and revocation
are mandatory. No wildcard CORS or domain-wide session cookie.

The broker owns a lease and monotonically increasing `generation`/`commandSeq`.
Every command/result carries session, competition, role, runtimeInstanceId,
gameId, position/FEN hash, requestId, sequence and expiry. It rejects replay,
out-of-order/duplicate bestmoves, unexpected roles, stale generations,
oversized payloads and unknown commands. `stop`, `quit`, `ucinewgame`,
`isready`, `position`, `go`, `info` and `bestmove` are an allowlisted protocol,
not unrestricted JS execution. Only the runtime's exact UCI-reported name,
manifest/backend/network and worker instance binding may reach READY; the
visible label must identify “Lc0 … / Maia 1100 / WASM CPU”, not generic Lc0.
Untrusted client claims are corroborated by the pinned release manifest and
server-side session binding, but cannot prove an untampered client binary.

The broker should retain only ephemeral routing, limited recent sequence/ack
state and abuse telemetry, not neural-network data, raw auth tokens, long PV
histories or persistent game positions. Expose only redacted IDs in logs;
expire abandoned sessions and enforce one active claim per role.

## 5. Arena Runtime Manager and Tournament contract

[`ArenaRuntimeManager`](../../js/arena-runtime-manager.js) has `white`, `black`
and `evaluator` records, `acquire/reuse/replace/stop/terminate/newGame`, strict
provider/worker-asset identity checks, generations and immutable bindings.
Its current [`EngineAdapter`](../../js/engine-adapter.js) is a local Worker
adapter. A future `IsolatedBrowserRuntimeAdapter` should expose equivalent
`start/isReady/getRuntimeIdentity/stop/newGame/terminate` and UCI-line and
bestmove callbacks, while a `LocalWorkerRuntimeAdapter` retains existing
Stockfish semantics. **Do not fake** a local `workerPath` to pass the current
manager's identity check. Add an explicit transport/artifact identity contract
and tests in a later implementation review.

The manager is **not yet drop-in compatible**: `stop` sets IDLE immediately;
`terminate` records a synchronous release; `newGame` does not await remote
`readyok`; and `activeWorkers = records.size` would undercount Lc0's parent
and pthread workers. A later, backwards-compatible design must await bounded
stop/cleanup acknowledgements before IDLE or next-game advancement, preserve
generation rejection, report physical worker counts separately from logical
roles, and fail closed on transport loss. Local Stockfish behavior must remain
unchanged. Identity should bind provider, requested role, reported UCI name,
source commit, backend, network ID/SHA, artifact digest and runtimeInstanceId.

For Match, a single Lc0 participant may face a certified Stockfish provider;
the evaluator remains existing Stockfish. For Tournament, keep one isolated
window and one runtime *per competition* across games when safe, send
`stop → bestmove/idle → ucinewgame → isready` before reuse, rebind color/role
only via an explicit new game generation, and quit/clean up at competition end.
Never auto-advance a game while Lc0 is disconnected or cleanup is pending.
No invisible fallback to another engine, relabeling, or synthetic bestmove.
Multiple independent Lc0 participants would require separate workers/sessions
and memory measurement; do not multiplex concurrent roles into one UCI loop.

## 6. Latency, bandwidth and resource budget

Four classes need separate end-to-end histograms: command send→engine receive;
engine UCI line→Arena receive; high-frequency `info`/PV delivery; and
search completion→validated `bestmove` receipt. The isolated lab's local stop
gate of 2.5 seconds is **not** a relay measurement. Instrument p50/p95/p99,
disconnects, queue age and dropped information messages in a future proof.
`stop`, `quit`, handshake, `readyok` and `bestmove` are reliable and prioritized.
Coalesce `info` by game/search generation and latest PV/depth; bound bytes,
message rate, queue length and publication frequency. Never drop `bestmove`;
backpressure must fail the session rather than silently reorder control.
Server bandwidth is proportional to two relay legs plus spectator fanout,
not neural inference. Do not relay network weights through the broker.

One certified Lc0 runtime peaked at **five browser workers** (one parent plus
four Emscripten pool workers). The pinned artifacts are 1,313,193 bytes of
compressed Maia weights, 9,399,301-byte Lc0 WASM, 13,479,978-byte ORT WASM,
plus JS glue. These are **asset sizes, not peak resident memory**; decompressed
weights, WASM heap growth, ORT allocations and browser overhead were not
measured. Two independent runtimes imply approximately ten workers before the
separate Stockfish evaluator, but caching and memory are not safely inferred
by multiplying downloaded bytes. Tentative policy: **at most one Lc0
participant per competition**, pending physical memory/CPU/thermal and two-
runtime profiling. Reuse one instance sequentially, never share it between
concurrent games. Mobile Lc0 is unavailable by default until physical device
tests of startup, stop/reuse, cleanup, memory/thermal and browser support pass.

## 7. Network release and supply chain

Serve immutable, content-addressed CAISSA-origin artifacts on the isolated
origin, lazy-load on explicit session claim, and allow browser caching with
long-lived immutable asset URLs. A versioned CDN is acceptable only with
documented CORS/CORP, an exact allowlist and client SHA verification; no
floating `latest` or unverified third-party runtime. Verify byte count and
SHA-256 **before** reporting READY, and fail closed on mismatch. Keep GPL
license/source notices and provenance. Cache keys include release digest;
revocation uses a new manifest/version, not mutation of an immutable URL.

Proposed signed/reviewed release-manifest shape, **not implemented**:

```json
{
  "provider": "lc0-browser-maia-1100-cpu",
  "lc0Version": "v0.33.0-dev+git.482bb4a",
  "lc0Commit": "482bb4a830287b726ebe7d42f14ab7f5f17c18a0",
  "uciName": "Lc0 v0.33.0-dev+git.482bb4a",
  "backend": "onnxruntime-web-wasm-cpu",
  "runtimeJsSha256": "c2b1786ff568d0d5042588b5b9bbf7a78623e47930ad4358803f2a37e3ca66a9",
  "runtimeWasmSha256": "5c3cc8c72b5794092790ab2c7615a7a7e9757e1c899fa2a4cc1ca158547a07f0",
  "networkId": "CSSLab Maia 1100 v1.0",
  "networkSha256": "e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4",
  "networkBytes": 1313193,
  "patchSha256": ["89db61927a6e4709460ef8eabcdcd0b053d7f39793a333d4e21bc0595d5eb015", "0d47b067fd237e4730233b2511de84b79d2d878628e86b3c104bb0f39554c9f4", "1a370fb23195d097c0ff3c12d0c1a004e5a6ab3ac952475334cc9cb06bd6f75d"],
  "toolchain": { "emscripten": "3.1.64", "onnxRuntimeWeb": "1.27.0" },
  "license": { "engine": "GPL-3.0-or-later", "network": "GPL-3.0" }
}
```

The worker wrapper, ORT WASM/module, lockfile and all assets also need hashes
in a real release manifest; this abbreviated example is **not** sufficient
for deployment. Reproducible build, dependency/license/SBOM review, artifact
signoff and no arbitrary upload/runtime URL are required.

## 8. Failure policy and security controls

| Failure | Competition and user-visible state | Cleanup / safe retry |
| --- | --- | --- |
| User closes isolated window, blocked popup | Pause before any next move; show “Lc0 window unavailable”, offer explicit reopen | Heartbeat lease expires, revoke capability, stop/terminate role; re-claim same competition only within grace and new generation; otherwise abort unscored prototype game |
| Network or WebSocket/SSE drops | `DISCONNECTED`; stop clocks/auto-advance in prototype; no stale move accepted | Reconnect with rotated token and sequence resume if same worker lives; else explicit restart current position under new generation, never implicit result |
| Isolated origin or worker crash | Mark exact Lc0 provider unavailable, not Stockfish | Revoke lease, attempt cooperative quit if reachable, force-kill only as emergency; observe worker baseline; abort current unscored game |
| Network hash/asset mismatch or backend failure | Fail before READY; display exact asset/backend error | Release ORT/workers, revoke ticket; retry only after known-good immutable release/network, no silent swap |
| `stop`/`bestmove` deadline | Keep STOPPING, do not record result or next game | Retry idempotent stop once by command ID if connected; bounded quit, emergency cleanup; abort unscored game if unresolved |
| Tournament scheduler advances while disconnected | Generation gate rejects advancement; explicit paused competition | On reconnection revalidate game/role/position and ready; otherwise cancel; future rated adjudication needs separate product decision |
| Main Arena reloads | Session enters reconnect grace, no autonomous engine play | Re-authenticate main user, reclaim same scoped session/generation if safe; otherwise revoke and close orphan window |
| Broker restart or lease expiration | Fail closed to DISCONNECTED/EXPIRED | Durable short-lived state and sequence recover if permitted; revoke and terminate otherwise; never replay a bestmove into a new game |

For every option, disallow user-supplied executable engine/network URLs; pin
code and hashes; retain exact-origin and narrowly scoped CSP/CORS; validate
every message and legal move; rate-limit per user/session/IP/competition; cap
simultaneous sessions, worker count, message bytes/PV frequency and total
duration; reject replay/spoofing with tickets, generations and sequence IDs;
and monitor leaks. Whole-site isolation adds third-party resource and popup
regression exposure. A dedicated relay adds hijacking/CSWSH and broker DoS
exposure. Single-thread custom builds add supply-chain and unverified cleanup
risk. Remote compute adds server-side CPU/GPU exhaustion and privacy exposure.
These are boundaries to verify, not claims that browser-held secrets or code
cannot be inspected or altered by the user.

## 9. Decision and exact next task

**Primary future architecture: `DEDICATED_ISOLATED_ORIGIN`.** Implement it, if
approved later, as a separate top-level isolated Lc0 page and ephemeral,
authenticated session relay; preserve `www` headers and current Stockfish
providers. **Fallback: `SINGLE_THREAD_DIRECT_BROWSER`**, strictly conditional
on a separately pinned non-SAB build passing stop/cleanup, legal move,
performance and device gates. Neither is production-approved today.

**EAE-010 proposed task:** in isolated test origins only, build a tiny dummy
transport proof (no Lc0, no production config) with non-isolated main page,
isolated top-level page, single-use claim, authenticated same-origin main
POST/streaming fetch and isolated-origin relay connection. Send `ping`, `pong`, `stop` and
one `bestmove`-like dummy result; verify COOP opener severance, both pages'
`crossOriginIsolated`, reconnect/close/expiry, replay rejection, CSP,
latency/backpressure and actual Vercel-vs-managed broker feasibility. Present
measured transport and cost/resource evidence to Alexander **before** any
production provider, popup UX, header or deployment work. If EAE-010 fails,
evaluate the fallback in a separate build spike; do not quietly switch to
whole-site isolation or remote compute.

**Final EAE-009 verdict: `LC0_INTEGRATION_DESIGN_APPROVED` (design only).**
