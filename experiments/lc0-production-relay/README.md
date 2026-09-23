# EAE-015A isolated relay project

This Vercel configuration is used only by the dedicated Lc0 relay preview
project. Build the deployment root with `node build-artifact.mjs`, then deploy
`.caissa-eae015a-relay`. The generated root contains exactly two functions: the
relay and the authenticated cleanup endpoint. Route filtering is not treated as
artifact isolation; unrelated CAISSA functions are absent from the upload.

The deterministic schedule itself is owned by the staging Supabase Cron job
`eae015a-lc0-cleanup`; the HTTP cleanup endpoint is retained for authenticated
manual recovery and observability, not as the primary scheduler.

The project must be configured with Preview-only environment variables and a
separate project link. It must never own `www.caissa-chess.org` or the future
`lc0.caissa-chess.org` production DNS name during EAE-015A.

## Final route and action inventory

The uploaded artifact has two functions. `/health` is only a route alias for
`/api/eae011?action=health`; it is not another function. Every unlisted path is
an explicit 404.

All relay actions enforce the exact configured HTTPS origin and the dedicated
relay host. Main actions accept only the protected Arena preview origin; engine
actions accept only the protected runtime-appliance origin. Request objects are
closed-schema and limited to 4 KiB. Streams allow 12 connects per session per
minute, commands allow 30 per second, INFO allows 4 per second and is coalesced,
claims allow 8 attempts, users may create at most 20 sessions per minute and
hold 10 concurrent sessions.

| Route/action | Method, origin, auth | Payload/purpose | Exposure and mutation |
| --- | --- | --- | --- |
| `/api/eae011?action=health` (`/health`) | GET, main/engine/relay, no bearer | Health, preview-shape, mode | Protected preview; read-only |
| `config` | GET, main, no bearer | Exact main/engine/relay origins and mode | Protected preview; read-only |
| `create` | POST, main, Clerk bearer | `{participantRole:white\|black}`; server creates competition/session/claim IDs | Protected user action; inserts session and creation-rate state |
| `inspect` | GET, main, Clerk bearer, `sessionId` | Owner-safe lifecycle view (secrets and event journal removed) | Protected owner action; read-only except expiry cleanup |
| `command` | POST, main, Clerk bearer, `sessionId` | Closed UCI command envelope with sequence/search identifiers | Protected owner action; mutates lifecycle/event journal; 30/s |
| `advance` | POST, main, Clerk bearer, `sessionId` | `{mode:release\|reuse,searchId}`; enforces STOP/cleanup gate | Protected owner action; mutates gate state |
| `terminate` | POST, main, Clerk bearer, `sessionId` | Empty object; explicit audited termination | Protected owner action; deletes session |
| `stream_main` | GET, main, Clerk bearer, `sessionId,cursor` | SSE engine-to-main events | Protected owner stream; updates lease/cursor; 12/min |
| `heartbeat_main` | POST, main, Clerk bearer, `sessionId` | `{epoch,cursor}` | Protected owner action; renews lease/compacts journal |
| `claim` | POST, engine, one-use claim token in body | `{sessionId,claimToken}`; returns engine credential | Protected runtime action; binds engine once; 8 attempts |
| `message` | POST, engine, engine bearer, `sessionId` | Closed `ACK/READY/INFO/BESTMOVE/STOPPED/CLEANUP/ERROR` envelope | Protected runtime action; mutates lifecycle/journal; INFO 4/s |
| `engine_state` | GET, engine, engine bearer, `sessionId` | Minimal engine-safe state | Protected runtime action; read-only except expiry cleanup |
| `claim_command` | POST, engine, engine bearer, `sessionId` | `{commandSeq}`; exactly-once delivery claim | Protected runtime action; advances command claim cursor |
| `stream_engine` | GET, engine, engine bearer, `sessionId,cursor` | SSE main-to-engine commands | Protected runtime stream; updates lease/cursor; 12/min |
| `heartbeat_engine` | POST, engine, engine bearer, `sessionId` | `{epoch,cursor}` | Protected runtime action; renews lease/compacts journal |
| `/api/cron/eae015a-lc0-cleanup` | GET, relay host, constant-time `CRON_SECRET` bearer | No payload; bounded cleanup (100), audit tombstones, metrics | Internal protected preview; deletes expired/abandoned state only |
