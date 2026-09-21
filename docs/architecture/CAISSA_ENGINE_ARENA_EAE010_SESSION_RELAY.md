# CAISSA Engine Arena EAE-010 — two-origin ephemeral session relay

Date: 2026-09-21. Scope: isolated, **dummy-message transport proof only** on
`experiment/lc0-eae010-session-relay`, based on EAE-009 design SHA
`f948dae015a381516d6777a2be7da8998a593b2a`. No Lc0, Maia, ONNX Runtime,
chess engine, Arena provider, production route/header change, merge, or deployment.
The local proof does not certify a production broker or Vercel-hosted relay.

## Topology and browser boundary

```text
Origin A: http://127.0.0.1:8791        Origin B: http://127.0.0.1:8792
Arena-like top-level page                Engine-like top-level page
non-isolated                             cross-origin isolated + SAB
  | same-origin POST + fetch stream        | same-origin POST + fetch stream
  +---------------- in-memory Node broker -+
                  session + bounded queues
```

The two loopback ports are distinct browser origins. Loopback HTTP is a
potentially trustworthy local context; a hosted version would require HTTPS.
Origin A sends `COOP: same-origin-allow-popups` and **no COEP**, matching the
current CAISSA policy model. Origin B sends `COOP: same-origin`,
`COEP: require-corp`, and `CORP: same-origin`. Both use `connect-src 'self'`,
`no-store`, `nosniff`, `Referrer-Policy: no-referrer`, and a restrictive CSP.
Chromium confirmed Origin A `crossOriginIsolated === false`, Origin B
`crossOriginIsolated === true` and `SharedArrayBuffer` available. A popup probe
confirmed its `window.opener` is null. The main page uses `noopener`, never
retains a `WindowProxy`, and neither client uses `postMessage` or `MessagePort`.
The claim arrives via a one-time URL fragment, which is not sent in the HTTP
request and is removed with `history.replaceState` before network claim.
This is a test handoff, not a production secret-delivery design.

## Session and transport

`server.mjs` runs two local HTTP servers backed by one in-process
`SessionBroker`. The browser uses authenticated same-origin JSON POSTs for
commands/messages, plus an authenticated `fetch` response whose frames use SSE
`data:` syntax. `EventSource` is not used because it cannot carry the bearer
header. The broker has no chess logic or persistence. The session record holds
`sessionId`, `claimToken`, separate Arena/engine credentials and client IDs,
synthetic `userId`, `competitionId`, `participantRole`, creation/claim/hard/idle/
lease deadlines, `lastSequence`, state, pending ACKs, and bounded channels.
Tokens use `crypto.randomBytes(32)` (256 bits) and constant-time comparison.

```mermaid
sequenceDiagram
    participant A as Main origin
    participant B as Broker
    participant E as Isolated origin
    A->>B: POST /api/session (test identity, competition, role)
    B-->>A: sessionId + single-use claimToken + expiry + Arena credential
    A-->>E: explicit one-time fragment handoff (no opener messaging)
    E->>E: remove fragment; check isolation + SAB
    E->>B: POST /api/claim (sessionId, claimToken)
    B-->>E: scoped engine credential + client ID
    A->>B: authenticated GET fetch stream
    E->>B: authenticated GET fetch stream
    A->>B: HELLO seq=1
    B->>E: HELLO seq=1
    E->>B: ACK HELLO seq=1; READY
    B->>A: ACK; READY
```

Claim is session-bound, valid for 30 seconds, consumed atomically in this
single-process implementation, and rejected on second use, wrong token,
wrong session, or expiry. Arena and engine credentials are separate. The
synthetic `X-Test-User` check demonstrates future binding shape only: a caller
can spoof it and it is **not authentication**. Production must replace it with
a validated CAISSA auth/session identity and enforce competition/role authority.
No claim token or bearer credential is logged by the broker.

Commands require exact `lastSequence + 1`; duplicate, stale, and future
sequences are rejected. Broker acceptance returns `delivered: false`: the
Arena-like client waits for a matching engine-generated ACK. `POSITION`, `GO`,
`STOP`, and `QUIT` all require positive ACK. Commands and responses are state
checked, not just sequence checked. Only a properly ACKed `GO` enters search.

```mermaid
sequenceDiagram
    participant A as Arena-like client
    participant B as Broker
    participant E as Dummy engine client
    A->>B: POSITION seq=2
    B->>E: POSITION seq=2
    E->>B: ACK POSITION seq=2
    B->>A: ACK POSITION seq=2
    A->>B: GO seq=3
    B->>E: GO seq=3
    E->>B: ACK GO seq=3; INFO ...
    B->>A: ACK GO seq=3; throttled INFO
    A->>B: STOP seq=4
    B->>E: STOP seq=4 (high priority)
    E->>B: ACK STOP; BESTMOVE; STOPPED
    B->>A: ACK STOP; BESTMOVE; STOPPED
    A->>B: QUIT seq=5
    B->>E: QUIT seq=5 (high priority)
    E->>B: ACK QUIT; CLEANUP
    B->>A: ACK QUIT; CLEANUP
    B->>E: close engine stream / revoke credential
    A->>B: advance Tournament gate, then terminate
    B-->>A: advanceAllowed=true; session removed
```

The gate stays closed until STOP ACK, one valid BESTMOVE, STOPPED, QUIT ACK,
and CLEANUP. A late/duplicate BESTMOVE or INFO after cleanup is rejected.
`STOP` or `QUIT` ACK timeout fails the session closed; broker interruption,
Arena stream disconnect/reload, hard/idle/claim expiry, and engine lease expiry
likewise revoke credentials and close streams. Main reload intentionally kills
its session: recovery is not assumed. An engine stream disconnect starts a
5-second lease; only its existing scoped credential can reconnect within it.
Expiry rejects the old reconnect credential. A reconnected stream receives
any queued high-priority commands. There is no arbitrary-client takeover.

## Priority, quotas, and security policy

High priority is a bounded FIFO queue (max 64) for control, ACK, ERROR,
BESTMOVE and terminal messages. Low priority stores only the newest INFO;
it delivers at most every 50 ms and coalesces intermediate depth/PV/score.
If high priority cannot be bounded, the session fails closed rather than
silently dropping a control frame. INFO is capped at 100 messages/second per
session; commands at 30/second, creation at 20/minute and concurrent sessions
at 10 per synthetic user. Limits: request JSON 4096 bytes; command 2048;
INFO 1024; PV string 512; BESTMOVE 128; ERROR 256 bytes. A 120-second hard
TTL and 30-second idle TTL bound memory even if a peer stalls. The broker sweeps
and removes tombstones after 60 seconds. These are prototype values, not
production capacity recommendations.

Each origin serves its own endpoints and validates exact `Host`, exact
same-origin `Origin` for every POST, and rejects cross-site fetch metadata.
Preflight is rejected; no `Access-Control-Allow-Origin` is emitted, especially
not `*`. Authenticated stream GET requires a bearer credential; a different
origin cannot issue the bearer-header fetch under the browser CORS policy.
An attacker with a stolen bearer can impersonate a client outside a browser:
Origin/CORS is CSRF and browser-boundary defense, **not** credential security.
Production needs authenticated user binding, TLS, anti-leak handling,
observability without secrets, and review of token handoff. The local URLs
must never be treated as production endpoints.

## Evidence and local-only latency

Run from repository root:

```powershell
node --test experiments/lc0-session-relay/tests/broker.test.mjs
cd experiments/lc0-session-relay
npx playwright test --config playwright.config.mjs
```

The isolated suite covers claim/replay/expiry, ordered ACK lifecycle,
INFO coalescing/rate and payload limits, STOP/QUIT timeouts, reconnect/lease,
main reload, broker interruption, wrong Origin/CORS, popup severance, and
Tournament advancement. Twenty real-Chromium cycles yielded 20 successful
gates and zero active sessions after each. A separate 10-concurrent-session
broker stress test delivered each session's HELLO only to its own engine
channel, rejected cross-session credentials and an eleventh session, and
closed all 20 streams with zero active sessions. That stress sent 10 HELLO
commands; it was not a throughput benchmark. INFO-flood testing verified
STOP/BESTMOVE responsiveness and newest-value coalescing.

One local Chromium run (20 cycles, loopback, same host, 2026-09-21):

| Metric | Samples | Median | p95 |
| --- | ---: | ---: | ---: |
| Broker command acceptance | 100 | 3.5 ms | 7.8 ms |
| Engine ACK round trip from command send | 100 | 5.8 ms | 14.7 ms |
| INFO emitted-to-main receipt | 20 | 3 ms | 8 ms |
| STOP send-to-BESTMOVE receipt | 20 | 7.9 ms | 19.7 ms |
| BESTMOVE emitted-to-main receipt | 20 | 2 ms | 7 ms |
| QUIT send-to-CLEANUP receipt | 20 | 7.7 ms | 20.1 ms |

`performance.now()` is used for same-page intervals and `Date.now()` for
cross-page emitted/received timestamps; the latter has millisecond resolution.
These are **laboratory loopback observations, not Internet or production
latency estimates**. They include browser scheduling and local HTTP, but not
TLS, geographic RTT, Vercel routing, a distributed store, or live chess work.

## Vercel feasibility spike (read-only; no deployment)

The live `tv-lavin-chess-game2` project was inspected read-only on
2026-09-21: its team is **Pro**, the project is Node.js **24.x**, its project
resource configuration reports **Fluid Compute enabled**, elastic concurrency
enabled, default function timeout **300 seconds**, and primary function region
`iad1`. The checked-in [`vercel.json`](../../vercel.json) has no EAE-010 route,
function, or isolated origin; it was not changed. Vercel's
[streaming guide](https://vercel.com/docs/functions/streaming-functions)
supports Node streaming responses, and its
[duration guide](https://vercel.com/docs/functions/configuring-functions/duration)
documents configurable maximum duration. The
[limits page](https://vercel.com/docs/functions/limitations) gives Pro Fluid
300 seconds default and 800 seconds generally configured maximum; a newer
[June 2026 changelog](https://vercel.com/changelog/vercel-functions-can-now-run-up-to-30-minutes)
adds a 1800-second Pro/Enterprise beta for supported runtimes. Treat the
project's observed **300-second default** as the known limit until a preview
function is actually tested. Long-running streams need explicit reconnect and
periodic renewal before the function deadline; current 120-second hard TTL is
within that default. Function concurrency/autoscaling does **not** imply shared
in-memory state. [Vercel's Fluid guidance](https://vercel.com/docs/fluid-compute)
describes concurrent invocations; a production broker needs an external
atomic session/queue/pub-sub plane and reconnection across instances. The
prototype's `http.createServer` pair cannot simply be copied into a Vercel
Function. A deployed Node Function/managed relay adapter, provider-side
streaming behavior, buffering, timeout, cost, two-host routing/headers,
connection duration, and real concurrency remain **unverified**.

Vercel's [June 2026 WebSocket KB](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
says WebSockets are supported and pinned to one Function until its duration
limit, with durable state externalized. EAE-010 did **not** test WebSockets;
they are not needed for this proof and should not replace POST + streaming
fetch without an isolated provider preview and operational comparison. The
recommended next transport is same-origin HTTPS POST plus authenticated
streaming fetch on both origins, backed by a separately designed durable
relay. Edge is unnecessary for the Node-based broker and has its own
[25-second initial response / 300-second stream constraints](https://vercel.com/docs/functions/runtimes/edge).

## Remaining gates

This result certifies the **local browser/session architecture**, not Lc0
integration or provider operations. Before any production adapter, create a
preview-only two-origin deployment with a distributed broker, validate the
actual plan/runtime stream and connection caps, demonstrate fault/restart and
regional behavior, implement real auth/role binding and secure claim handoff,
and re-run browser/mobile and Arena compatibility. Keep production CAISSA's
COOP/CSP, EngineRegistry, Runtime Manager, Match/Tournament selectors, and
Game tab unchanged until those separate gates pass.
