# Security Remediation

Status: IMPLEMENTED AND TESTED; READY FOR HUMAN APPROVAL.

## Files changed

`api/_lib/polyglot-builder.js`, `api/_lib/scanner-public-recognition-service.js`, `api/polyglot/build.js`, `api/scanner/public/recognize.js`, `cloudflare-worker/worker.js`, `downloads-worker/worker.js`, `worker/stats-worker.js`, `package.json`, `package-lock.json`, `scripts/audit-supply-chain.mjs`, two security test files and three governance evidence reports.

## Implemented

- Downloads Worker no longer trusts `tier=premium`, `X-Caissa-Tier` or capability-like caller strings.
- Premium is inactive, so every reachable download path uses the free limits: 10 games and 15 MiB. Premium elevation remains fail-closed until a server-owned entitlement source and durable replay protection are designed and approved.
- JSON and ZIP download endpoints use the same access decision.
- Polyglot construction has structural resource budgets and rejects amplification before parsing.
- Scanner inference admission retains a slot until timed-out underlying work actually settles.
- Game-worker integers reject NaN, fractions, negatives and overflow.
- Stats-worker shard objects and aggregate cache are bounded with LRU eviction.
- Exact compatible dependency overrides update `undici` and `zod`; no forced major upgrade was used.

## Tested

- Forged, expired and replayed elevation strings remain free on JSON and ZIP paths.
- Resource, timeout, cache, rate/limit and Worker entry-point tests passed.
- `npm audit --audit-level=high` reports zero known vulnerabilities on this branch.
- `npm run verify:scanner`: PASS, including 147 multi-browser Scanner tests and 21 internal beta browser tests.
- Protected Vercel preview `dpl_FZCgsXYJHzZRLbq5NeczJG32286Z` is `READY`, `public=false`, has no production alias and is bound to exact SHA `d72cf4dd3983124358cb27231b6dad6c2da36572`. The Downloads Worker is a separate Cloudflare deployment and cannot be validated by the Vercel URL; no production rewrite or download endpoint was used as a substitute. Local Worker tests are the applicable evidence until isolated Worker staging is approved.

## Security conclusion

SEC-001 is closed for the currently active product by removing elevation entirely, not by accepting a replayable bearer capability. Anonymous/free behavior is preserved. A future paid product must add authenticated, server-owned entitlement lookup, revocation, replay prevention, audit events and rate policy before Premium can exist.

The npm advisories were dependency-level findings; this package does not claim that each prior advisory was exploitable in CAISSA. The compatible upgrades remove the audited versions.

## Rollback

Revert the security branch or redeploy the prior Worker/app versions. If rolled back, the client-controlled premium bypass returns and the Downloads Worker should instead be disabled until the fix is restored.
