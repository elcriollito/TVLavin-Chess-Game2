# CAISSA Engine Arena — EAE-011 preview relay certification

Scope: a dummy-message relay experiment only. There is no Lc0, ORT, Maia network, EngineRegistry provider, Match/Tournament UI change, production merge, or production deployment.

## Checkpoint and topology

- EAE-010 baseline: `05da5ae1d5a2da27b5a43c613c9db94241f2652a`, preserved by annotated remote tag `engine-arena-expansion-eae010-relay-certified`.
- Experiment branch: `experiment/lc0-eae011-preview-relay`, forked from that baseline.
- Main preview alias: `https://eae011-main-elcriollitos-projects.vercel.app`.
- Isolated preview alias: `https://eae011-engine-elcriollitos-projects.vercel.app`.
- Both are preview deployments of the existing Vercel project, not production aliases. Their immutable deployment IDs and deployed source commit are recorded in the certification report below.
- Shared store: existing Supabase staging project `CAISSA-READER-STAGING` (`aqizagaskicotorfpwfn`), using dedicated `eae011_*` tables and RPCs. The relay refuses a database URL for any other project and refuses `VERCEL_ENV=production`.
- The four relay configuration variables are restricted to the experiment branch's Vercel Preview environment: two exact origins, staging URL, and staging service-role secret. No project-wide production variable was changed.

The main browser obtains a fresh CAISSA Clerk session token for each Arena-side request. The existing `api/_lib/auth.js` verifier resolves the Clerk user ID; no parallel account database exists. Only the owner may inspect, command, connect, advance, or terminate a session. The isolated page never uses Clerk sign-in or a CAISSA cookie. It receives a one-use fragment claim token, removes the fragment immediately, and exchanges that token for a session-scoped engine credential. The claim token and engine credential are 32 random bytes encoded as base64url; only session-bound SHA-256 verifiers are stored. The engine credential is revoked on CLEANUP. A browser reload stores only the scoped engine credential and stream cursor in that origin's session storage, not Clerk credentials.

## Shared state and protocol

Authoritative state is a versioned Postgres JSONB record with compare-and-swap updates. It contains owner/competition/role identifiers; claim/engine verifiers; phase; claim, idle, hard and stream-lease timestamps; command and engine sequence counters; last ACK; search generation; terminal result; cleanup flag; journal cursor; and persisted per-session rate windows. No module-global map controls a session. An atomic SQL create RPC serializes each owner's 20-per-minute creation window and 10-active-session cap. RLS is enabled with no anon/authenticated policies; only the server-held staging service role is granted access. The database linter's “RLS enabled no policy” notice is intentional for these service-only tables.

The state path is `UNCLAIMED → CLAIMED → HELLO/READY → POSITION_ACKED → SEARCHING → STOP_ACKED → STOPPED → QUIT_ACKED → CLEANED`. Reuse instead takes `STOPPED → RESET_ACKED → REUSE_READY` and requires the matching completed search ID. The Tournament-style release gate checks STOP ACK, exactly one accepted BESTMOVE for the current search generation, STOPPED, QUIT ACK and CLEANUP. A transport disconnect alone never opens the gate. A late BESTMOVE for search A during search B is rejected.

Commands are ordered by owner `commandSeq` and journaled before the POST returns. The isolated client atomically claims each command sequence before dummy execution; duplicate delivery is not executed again. A crash after that claim but before execution can lose the command, causing a fail-closed timeout rather than a false exactly-once guarantee. ACK and engine-message sequences reject retries/duplicates; one BESTMOVE per current generation is accepted. INFO is deliberately lossy: the journal keeps only the newest low-priority INFO per recipient, while high-priority control events remain ordered. CLEANUP has a single durable effect and revokes the engine credential; a retried CLEANUP after revocation is rejected, not acknowledged again. The preview does **not** claim general exactly-once distributed delivery.

Commands and engine messages are POSTed. Each origin reads its own server-sent streaming response with a durable event cursor. A reconnect resumes from that cursor and replaces the old stream epoch. The server stream only reads state; it does not renew a client lease. The current browser client must POST an authenticated heartbeat with the current epoch every 1.5 seconds. A proxy-held server response without client heartbeats expires after the 3-second heartbeat window plus 5-second grace. A stale epoch cannot renew a replaced stream. Claim lifetime and idle lifetime are 30 seconds; hard lifetime is 120 seconds. Expiry is checked against durable timestamps on every access, with explicit termination and a service-only cleanup RPC available for row removal. There is no preview cron; if no later request or cleanup RPC runs, expired rows can remain stored but cannot become live again.

The relay's request schemas reject unknown fields, large payloads, malformed IDs, invalid move syntax, out-of-order sequences and illegal state transitions. Shared state enforces per-session 30 commands/s, 100 INFO/s, 20 reconnects/min, eight claim attempts, 20 creations/min per owner and 10 active sessions per owner. These are preview limits, not a hardened public-abuse policy. High-priority journal capacity is 128 entries; overflow fails closed. Every request validates its exact preview Host and, on POST, exact same-origin `Origin`; cross-site fetch metadata is rejected. No authenticated CORS wildcard is emitted by the API. Static hosting may send permissive asset CORS headers, which do not grant API access.

Only the isolated experiment document and assets receive path-specific COOP `same-origin`, COEP `require-corp`, CORP `same-origin`, and a self-only CSP. The main page retains the normal CAISSA `same-origin-allow-popups` policy. A generic directory URL does not receive the isolation override, so the handoff targets `/engine/index.html` explicitly. No global production headers were changed.

## Verification and operational limits

The local unit suite simulates separate brokers sharing one store, conflict/retry, duplicate POST/command claims, store failure, late terminal messages, separate reconnects, expired claim/idle/lease/hard timestamps, owner isolation and 10 sessions. The opt-in staging test uses the real Postgres store. The live preview suite creates temporary users and sessions in the existing Clerk development instance, tests unauthenticated and cross-user requests, third-origin rejection, a simultaneous claim race, 10 concurrent full lifecycles, separate-origin streaming/cursor reconnect, and expiry. Temporary users and relay rows are removed after certification. Production Supabase was not used.

The two immutable preview deployments prove requests can cross deployment/function boundaries through Postgres. Vercel does not expose deterministic function-instance targeting, so a specific instance kill is not claimed; the broker-reconstruction test proves no authoritative module-global state. Browser checks verify `crossOriginIsolated === true` and `SharedArrayBuffer` on the isolated origin, no Clerk credential there, and no Lc0/ORT/Maia asset load.

Latency is client-observed from the preview run, not the EAE-010 loopback benchmark. No SLA is inferred from this small sample. The per-message Postgres compare-and-swap and 250 ms SSE polling are intentionally simple and can increase database read/write and function-duration costs; no bill-level cost measurement is available. At 10+ streams or longer sessions, polling, the 120-second hard cap, and retained expired rows require a separate scale/cleanup design before any production consideration.

## Certification report — 2026-09-21

The certified runtime source is commit `18d5b19c350d6ba0ab071431b42ba26c6e830734`. The main alias points to preview deployment `dpl_4FjP4rpWgbsV5CpEeJ2q7wHt2Cew` (`tv-lavin-chess-game2-2ewu9fnlf-elcriollitos-projects.vercel.app`); the isolated alias points to separate preview deployment `dpl_8Uyx8cXZ7PYqL8HdgpKRAwhTz7tx` (`tv-lavin-chess-game2-hoqzm4lju-elcriollitos-projects.vercel.app`). Both were `Ready` and target `preview`. Subsequent test/documentation commits on the experiment branch do not change the deployed broker behavior or these two aliases.

The final live run, with Arena-side API requests on the main deployment and engine-side API requests on the other deployment, passed 10 concurrent HELLO/POSITION/GO/INFO/STOP/BESTMOVE/STOPPED/QUIT/CLEANUP lifecycles in 46.8 seconds. An unauthenticated create, a different Clerk user attempting owner actions, a third Origin, an invalid claim, a simultaneous duplicate claim, and a replayed command were rejected. A separate streaming session resumed both streams from cursors after independent interruptions, then passed the terminal gate. Live unclaimed and idle expiry returned `CLAIM_EXPIRED` and `IDLE_EXPIRED`; the disconnected lease could not reconnect after its heartbeat stopped. The engine browser reloaded using its scoped credential only. The staging `eae011_sessions` table held **zero rows and zero unexpired rows** afterward. The unit suite passed 11/11, the staging-store test 1/1, the Arena provider/runtime/Generation Cup units 33/33, and the existing Generation Cup browser smoke 5/5. No production merge or deployment occurred.

Client-observed preview latency (milliseconds; median / p95) in that final cross-deployment run:

| Measure | n | Median | p95 |
|---|---:|---:|---:|
| Create | 10 | 203.8 | 317.4 |
| Claim | 10 | 166.8 | 686.2 |
| Command POST acceptance | 50 | 131.4 | 154.5 |
| ACK POST completion from command send | 50 | 123.7 | 252.3 |
| INFO POST acceptance | 10 | 143.0 | 311.2 |
| INFO SSE propagation from INFO POST start | 1 | 211.9 | 211.9 |
| STOP through BESTMOVE/STOPPED | 10 | 375.6 | 449.3 |
| QUIT through CLEANUP | 10 | 249.4 | 335.0 |

The single INFO propagation observation is not a statistically useful p95; it is shown only for completeness. The live ACK metric covers command send through the ACK HTTP response, while the SSE probe separately checks delivery. No performance SLA or cost estimate is inferred. Verdict: `LC0_PREVIEW_RELAY_CERTIFIED`, limited to the short-lived dummy preview architecture described here. This does not authorize a real Lc0 attachment or production Arena integration.
