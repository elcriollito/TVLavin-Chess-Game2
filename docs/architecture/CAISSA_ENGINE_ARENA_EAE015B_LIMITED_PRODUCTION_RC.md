# CAISSA Engine Arena — EAE-015B limited production RC

Date: 2026-09-23

Verdict: `LC0_LIMITED_PRODUCTION_RC_PARTIAL`

Final mode: `DISABLED`

## Checkpoint

- Previous `origin/main`: `1d2f05e1d4214e3a9e067e0e16199f20f29feca2`
- Integration branch: `integration/lc0-limited-production-rc`
- Integration checkpoint before this report: `0e5fdd6bc129eb9eeef42bb53e8e196796cf972d`
- Remote backup: `backup/main-pre-lc0-limited-release` at the previous main SHA
- No main merge and no main-site production deployment occurred.
- The certification archive branch and RC tag are intentionally withheld until Stage 1 and the 25-cycle soak pass.

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
- Protected RC main alias: `eae015a-main-elcriollitos-projects.vercel.app`
  (preview deployment `dpl_6dpmDuYQfThn1e4rYhK76bSJup5e`).
- Separate relay alias: `eae015a-lc0-relay-elcriollitos-projects.vercel.app`
  (production deployment `dpl_DhrL6WMCR9xnGUpEuGzb6w24gDwU`).
- Dedicated isolated runtime: `caissa-lc0-runtime-eae015a.vercel.app`
  (production deployment `dpl_FPaGa9ZHdikqctUJenN8phtcDxr9`).
- Production database: Supabase project `jczauvkfkweuvdpurpem`.

The main site has no global COOP/COEP change. The runtime origin alone emits
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`.

## Runtime identity and delivery

The candidate was rebuilt from the committed source and reproduced the certified
manifest exactly:

- Manifest SHA-256: `492c6749989f429c269725d6d2761d4687c8096ca437f5651189fcfbe4ffbb9f`
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

## Stage 1 and soak

Not executed. No internal Clerk user ID was supplied for the explicit allowlist,
and the protected deployment does not provide a test identity to this run.
Therefore:

- Lc0 White vs SF19 Black: not run.
- SF19 White vs Lc0 Black: not run.
- SF18/SF19/Lc0 Tournament: not run.
- 25 complete internal production lifecycles: not run.

The rollout stops here. Stage 2 is not prepared for activation and is not
enabled. The final mode remains DISABLED.

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
cleanup. At the final observation all six were non-firing.

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

## Remaining risks and rollout rule

Stage 1 real-engine evidence and 25/25 production soak evidence are mandatory
before certification. A designated internal Clerk user ID must be added to the
allowlist, release stage changed to INTERNAL_ONLY, and database mode changed to
ENABLED only for that controlled exercise. Any unexplained SESSION_GONE,
STOP_TIMEOUT, forced kill, orphan worker/pthread, relay residue, or firing HIGH
alert stops the rollout and returns both gates to DISABLED.

No general-public enablement is permitted without Alexander's explicit approval
after the completed Stage 1 report.
