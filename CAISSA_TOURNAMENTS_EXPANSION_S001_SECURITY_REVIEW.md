# CAISSA Tournaments Expansion S001 — Independent Security Review

Date: 2026-11-21 (America/New_York)

Scope: the working-tree diff from verified baseline `865105bcd678c06dff2f600abf776a998ba3d185` covering API, browser UI, service adapters, the forward migration and tests.

## Managed scanner status

The scanner was invoked with explicit worktree revisions after verifying that `HEAD`, the baseline and merge-base all resolve to `865105bcd678c06dff2f600abf776a998ba3d185` in a non-bare repository. It returned exactly:

> Review changes requires a non-bare Git worktree with a resolvable HEAD.

The managed scanner did not pass. Daybreak access for the connected account was also reported as not granted, so protected output might not be displayable. This review is the documented independent fallback, not a replacement claim for the failed managed gate.

## Trust-boundary results

- Clerk remains the member identity authority. Guests cannot use Arena, Daily or weekly administration.
- Vercel API handlers authenticate first, apply local/shared rate limits, validate bounded payloads and authorize the configured tournament organizer before any privileged call.
- Browser roles receive no direct write or execute grants for the new tables/RPCs.
- New tables have RLS enabled and all `public`, `anon` and `authenticated` privileges revoked; only `service_role` receives the required table/function grants.
- All SQL functions use `security invoker` with an empty `search_path`; the cron call is a fixed statement, not user-composed SQL.
- Game moves are validated with the existing server chess engine before the service-role commit RPC. The database locks the game, checks participant, turn, deadline and expected version, and records idempotency events.
- Rating changes lock the game and the two rating rows in deterministic order. `rating_processed_at` makes result retries exactly once and the Daily pool is separate from Bullet/Blitz/Rapid.
- Final-slot enrollment locks the tournament and subject; a two-session race admitted one contender only.
- Scheduler generation uses a transaction advisory lock plus a unique occurrence key. The official series defaults to disabled and its launch date is bounded.
- Realtime messages are private and contain invalidation metadata, not canonical game state or credentials.
- No credential-shaped value or private key was added. Test tokens and `sb_secret_*` values are synthetic fixtures.

## Finding resolved during review

**Daily advancement could fail to reduce two-player edge groups.** With a configured group size of three and four entrants, two groups of two inherited `qualifier_count=2`; every player advanced and the same-size round could repeat indefinitely.

Resolution: after deterministic group assignment, each group's qualifier count is capped at `member_count - 1` with a minimum of one. A PostgreSQL behavioral test now completes the edge groups and verifies advancement to one smaller final group.

## Independent evidence

- PostgreSQL 17.11 behavioral harness: pass.
- RLS/grant/static migration assertions: pass.
- API authorization and feature-gate tests: pass.
- Duplicate request, deadline, rating retry and concurrency tests: pass.
- Chromium/Firefox/WebKit organizer/member separation: pass.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilities.
- Source syntax and release allowlist audits: pass.
- Gitleaks, Semgrep, Trivy and Snyk CLIs were not installed, so no result is claimed for them.

## Residual risks and gates

- `pg_cron` was unavailable in the isolated local PostgreSQL distribution; hosted extension installation, job ownership and one-job uniqueness must be verified before applying the migration.
- Service-role compromise remains high impact by design. The secret must stay only in the isolated Vercel server environment and must never enter browser configuration or logs.
- Long-lived Daily data affects storage/backups. Retention and quota approval is required before enabling real correspondence events.
- Load evidence is deterministic local evidence, not a hosted Supabase/Vercel saturation test. Hosted 100-player certification remains required before public enablement.
- The managed security scanner remains an unresolved release gate.

Security disposition: no known unresolved vulnerability in the reviewed local candidate, but hosted release remains on hold for the managed scanner, cron/database preflight and hosted Human QA.
