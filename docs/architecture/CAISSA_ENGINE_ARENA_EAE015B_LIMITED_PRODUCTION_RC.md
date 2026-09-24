# CAISSA Engine Arena — EAE-015B limited production RC

Date: 2026-09-23

Verdict: `LC0_LIMITED_PRODUCTION_RC_CERTIFIED`

Final mode: `DISABLED`

## Checkpoint

- Authoritative certified SHA:
  `daf3404fbfaf9401783875626bb7eed403c0d9c4`.
- Certified lineages: `hotfix/lc0-eae015b2-stage1-reliability` and
  `integration/lc0-limited-production-rc`.
- Immutable certification branch: `archive/lc0-limited-production-certified`,
  pointing exactly to the authoritative certified SHA.
- Annotated release-candidate tag: `lc0-limited-production-rc1`, whose peeled
  target is exactly the authoritative certified SHA.
- Historical blocked tag: `lc0-eae015b-stage1-blocked`, unchanged at peeled
  target `87c6808ed6ba6a60c4c72b01d5186972ba5d070a`.
- `origin/main` remains
  `1d2f05e1d4214e3a9e067e0e16199f20f29feca2`.
- No main merge, public CAISSA deployment, public Lc0 registration, or Stage 2
  enablement occurred.

The detailed remediation and certification evidence remains in
`docs/architecture/CAISSA_ENGINE_ARENA_EAE015B2_STAGE1_RELIABILITY.md`. This
closeout changes release documentation and references only; the certified
runtime artifact remains the authoritative SHA above.

## Legal and corresponding source

Legal sign-off is recorded as `APPROVED`, reviewed 2026-09-22, and
`LEGAL_SIGNOFF_COMPLETE` in `docs/compliance/LC0_PRODUCTION_LEGAL_SIGNOFF.md`.

- Release: `lc0-browser-source-v0.1.1`
- Archive: `caissa-lc0-browser-corresponding-source-v0.1.1.zip`
- Archive SHA-256: `7d0a514f6f212a2d151bb340708d485670fba0ee338145e63f5cc8db46f731ec`
- Public source: https://github.com/elcriollito/TVLavin-Chess-Game2/releases/tag/lc0-browser-source-v0.1.1
- The published archive was downloaded and verified byte-for-byte; it was not modified.

## Production topology

- Main site: `www.caissa-chess.org`, unchanged and non-isolated.
- Protected RC main alias: `eae015a-main-elcriollitos-projects.vercel.app`.
  Final disabled preview deployment:
  `dpl_B6BvxJEU1DBuAkmw7xyZGYP4mJ5S`.
- Separate relay alias: `eae015a-lc0-relay-elcriollitos-projects.vercel.app`
  (final disabled production deployment
  `dpl_C7xw4Dd8MUKPBCNZRWmRkxe2yaQz`).
- Dedicated isolated runtime: `caissa-lc0-runtime-eae015a.vercel.app`
  (production deployment `dpl_FPaGa9ZHdikqctUJenN8phtcDxr9`).
- Production database: Supabase project `jczauvkfkweuvdpurpem`.

The main site has no global COOP/COEP change. The runtime origin alone emits
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`.

## Runtime identity and delivery

The final Stage 1 candidate was rebuilt from the committed source and reproduced
the certified manifest exactly:

- Release: `eae015b2-lc0-0.33.0-maia1100-r3`
- Manifest SHA-256: `648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d`
- Artifacts: 8
- Total bytes: 24,785,017
- Network: Maia 1100
- Network SHA-256: `e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4`

The runtime health endpoint reports this manifest. Versioned artifacts are
immutable-cached; the shell is no-store. Required artifact integrity is checked
before READY and mismatch fails closed.

## Schema and lifecycle

Eight ordered migrations were applied through the Supabase migration API. They
create the session and creation-window tables, null-safe audit tombstones,
heartbeat and pending-deadline evidence, the production control/rate model,
bounded cleanup, aggregate metrics, and six alert rules.

All seven Lc0 tables have RLS enabled. Anonymous and authenticated grants are
revoked; only the relay service role has the scoped grants. The post-migration
Supabase security advisor reported INFO-only `rls_enabled_no_policy` notices,
which are intentional for service-role-only tables. No error or critical advisor
finding was introduced.

Lifecycle states are CREATED, CLAIMED, INITIALIZING, READY, SEARCHING, STOPPING,
IDLE, DISCONNECTED_GRACE, CLEANING, CLEANED, FAILED, and EXPIRED. Terminal
states cannot be resurrected. Production limits include one active Lc0 session
per user, one Lc0 participant per competition, a 10-second STOP bound, bounded
command/INFO rates, a ten-minute idle bound, and a two-hour absolute cap.

## Feature flags and kill switch

Required deployment controls:

- `EAE015B_PRODUCTION_CANDIDATE=1`
- `EAE015B_RELEASE_STAGE=DISABLED` (current)
- `EAE015B_INTERNAL_PREVIEW=1` only on the protected RC deployment
- database control `eae015a_control.mode=DISABLED` (current)
- exact candidate branch guard and manifest digest

The server recognizes only `DISABLED` and `INTERNAL_ONLY` release stages.
There is no general-public Stage 2 server mode in this RC.

Database control behavior:

- ENABLED: sessions may be created, subject to the internal release gate.
- DRAINING: new sessions are denied; existing sessions may finish or clean up.
- DISABLED: all new sessions are denied; existing state is cleanup-only.

Missing or invalid configuration fails to DISABLED. Stockfish does not use this
control path.

## Browser and product policy

- Supported for a later Stage 1 exercise: desktop Chrome and desktop Edge.
- Firefox and Safari: unverified/unsupported for initial release.
- iOS, Android, and mobile layouts: blocked before provider registration.
- Truthful visible identity: **Lc0 — Maia 1100**, badge **Experimental**.
- Backend: CPU/WASM; version: 0.33-dev; evaluator: existing Stockfish.
- Maximum one Lc0 participant; Lc0-vs-Lc0 is rejected.
- A visible user gesture opens the runtime companion window.
- No automatic Stockfish substitution is implemented.

## Stage 0 results

Pass:

- Production schema applied with control mode DISABLED and zero sessions.
- Dedicated runtime deployed with correct isolation and certified manifest.
- Separate relay deployed and independently disableable.
- Relay health reports `productionShape:true`, `releaseStage:DISABLED`,
  and `mode:DISABLED`.
- A create request returns `LC0_DISABLED`.
- A third-origin request returns `ORIGIN_REJECTED`.
- Protected RC configuration returns `enabled:false`.
- Public `/arena` response retains `same-origin-allow-popups` and has no COEP.
- Supabase cleanup cron succeeded repeatedly; Vercel cleanup emitted
  `scheduled_cleanup=1`, `cleanup_success=1`, active sessions 0.
- All six HIGH alert rules were non-firing.
- No DNS/custom domain was assigned.

Verification:

- Arena/Lc0 unit suite: 68/68.
- Relay, lifecycle, compliance, and metrics suite: 48/48, with one optional
  staging-store test skipped.
- Isolated local Chromium Arena suite: 69/70 functional checks passed. The one
  static-server failure was only the scoped SF19 CSP response-header assertion;
  the deployed SF19 response separately verified the exact
  `script-src 'self' 'wasm-unsafe-eval'` policy without `'unsafe-eval'`.
- A direct deployed Playwright run is unavailable because the RC deployment is
  intentionally protected by Vercel authentication.

## Release chronology

The certification record preserves the complete sequence:

1. Stage 0 established the isolated production-shaped topology in a dark,
   default-disabled state.
2. Stage 1 was blocked by a reproducible Pause/Resume race and a suspended SSE
   transport failure during the lifecycle soak. The immutable blocked tag
   preserves that result.
3. EAE-015B.2 remediated both failures without changing Maia, Lc0, ORT,
   Stockfish, browser-support policy, or general-user exposure.
4. Stage 1 then passed the complete reliability plan.
5. EAE-015B is therefore certified as a limited-production release candidate,
   while remaining `DISABLED` and without authorizing Stage 2.

## Stage 1 final evidence

The final lifecycle soak passed **50/50** accepted cycles, split evenly between
Lc0 White (25) and Lc0 Black (25). It recorded:

- `arena-error`: 0;
- forced terminations: 0;
- orphan workers: 0;
- orphan pthreads: 0;
- relay residue: 0.

The controlled transport campaign passed **25/25** interruptions: 13 during
search and 12 while paused, with 25 successful reconciliations/reconnections.
The deliberate-expiry probe also passed: local cleanup was confirmed, the
broker truthfully returned HTTP 410 after expiry, and the final snapshot showed
zero workers, pthreads, and forced kills.

The five-round SF18/SF19/Lc0 Tournament passed **5/5**. Lc0 played both colors,
Pause/Resume passed, and every companion runtime terminated cleanly. The drain
probe passed, including `503 LC0_DRAINING`, `503 LC0_DISABLED`, completion and
cleanup of the active match, and a real four-move SF18 Lite versus SF19 Lite
independence check while Lc0 remained disabled.

Regression evidence passed:

- Arena/Runtime/Generation Cup units: **88/88**;
- directed Chromium: **37 passed**, 1 conditional skip, 0 failed;
- EAE-015B.2 focused transport contract: **10/10**;
- HIGH alert rules: **0/6 firing**.

No previously accepted lifecycle, transport-fault, or tournament cycle was
repeated for this administrative closeout.

## Closed root causes

### Pause/Resume race

Resume could allocate or start the next search generation before the
asynchronous Pause STOP, ACK, BESTMOVE, and STOPPED sequence had fully settled.
The `_pausePending` synchronization barrier now owns that transition, and
Resume cannot proceed until it settles.

### `ERR_NETWORK_IO_SUSPENDED`

A browser SSE transport could accept a server write without delivering the
event, or could close immediately afterward. The result was a cursor advanced
beyond durable acknowledgement. Durable sequence and cursor reconciliation,
the reconnect queue, ACK recovery, outbound retry within the lease, and bounded
local cleanup close that path. Local cleanup and broker cleanup acknowledgement
remain separate evidence; no remote cleanup is fabricated.

Stage 2 was never enabled. The final database and deployment gates are both
`DISABLED`.

## Security evidence

Passing automated evidence covers cross-user rejection, one-use claim replay,
third-origin rejection, payload bounds, rate limiting, identity and network hash
failure, kill-switch drain/disable policy, bounded cleanup, reconnect races,
lease expiry, and terminal-state non-resurrection. Secrets are excluded from
application logs and aggregate metrics.

## Observability and operations

Aggregate metrics include active sessions, create, claim, READY latency/failure,
STOP request latency and STOP timeout, SESSION_GONE, forced termination, worker
and network-integrity failures, origin/auth/rate rejection, reconnect, lease
expiry, scheduled cleanup, relay errors, and cleanup success/failure.

The six HIGH alerts are unexpected SESSION_GONE, STOP timeout spike, forced
termination spike, relay error spike, cleanup failure, and active growth without
cleanup. At the EAE-015B.2 final observation all six were non-firing. The final
60-minute snapshot reported active sessions 0, cleanup success 66, forced
termination 0, cleanup failure 0, relay error 0, and STOP timeout 0. The
EAE-015B.3 closeout rechecked the alert RPC and again found 0 of 6 firing.

## Rollback

1. Keep `eae015a_control.mode=DISABLED` and
   `EAE015B_RELEASE_STAGE=DISABLED`.
2. Confirm `eae011_sessions` is empty; if not, use DRAINING and wait for
   cooperative cleanup/lease expiry.
3. Remove the RC main/relay aliases or point them back to their previous
   protected deployments. Do not change `www.caissa-chess.org`.
4. Roll back the relay and runtime projects independently in Vercel.
5. Only after zero sessions, apply
   `supabase/rollback/20260923020000_eae015b_lc0_production_rollback.sql`
   as a reviewed Supabase migration. It unschedules cleanup and drops the Lc0
   functions/tables in dependency order.
6. Re-run Supabase security advisors and the Stockfish Match/Tournament smoke.

The rollback SQL was statically reviewed and the cleanup/drop ordering is covered
by the migration tests. It was not executed against production because doing so
would destroy the completed Stage 0 dark deployment.

## Final infrastructure state and rollout rule

The EAE-015B.3 read-only closeout verification recorded:

- gateway HTTP 200: `releaseStage=DISABLED`, `mode=DISABLED`, `enabled=false`;
- relay HTTP 200: `ok=true`, `productionShape=true`,
  `releaseStage=DISABLED`, `mode=DISABLED`;
- database control: `DISABLED`;
- active sessions: 0;
- relay rows: 0;
- HIGH alerts firing: 0 of 6;
- `origin/main`:
  `1d2f05e1d4214e3a9e067e0e16199f20f29feca2`;
- public main merge/deployment performed by this release: none;
- public Lc0 registration: none;
- Stage 2: disabled and not authorized.

The limited-production release candidate is certified, but certification is
not authorization to enable it. The explicit allowlist remains protected and
default-closed. No general-public enablement or Stage 2 work is permitted
without a separate explicit owner authorization.
