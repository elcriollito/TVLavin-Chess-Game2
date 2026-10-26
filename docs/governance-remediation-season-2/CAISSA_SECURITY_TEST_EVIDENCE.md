# Security test evidence

Status: `TESTED LOCALLY`. All traffic was local/synthetic except safe GET/route-presence checks. No volumetric or abusive remote test was performed.

## Focused results

| Command | Result |
|---|---|
| `node --test tests/security-remediation-season-2.test.js` | 6/6 pass |
| `node --test tests/security-remediation-season-2.test.js tests/supply-chain-hardening.test.js` | 11/11 pass |
| `npm run security:supply-chain` / underlying audit script | 501 runtime files and 186 lock entries passed policy after override update |
| `npm audit --json` | 0 info, low, moderate, high or critical vulnerabilities; 186 total dependencies |
| Security + supply-chain + Polyglot + Scanner legacy selection | 37/38 pass; one baseline localization-catalog parity failure |

The focused tests cover a valid signed capability, absent/forged client elevation, actual Worker route free fallback, NaN/fraction/negative/overflow numeric values, oversize and aggregate shard eviction, timed-out inference slot retention, concurrent 503, Polyglot game amplification, module entry, registry provenance/integrity and exact overrides.

## Baseline failure

`tests/polyglot-tool.test.js` reports 610 versus 621 catalog keys for EN/ES/PT parity (9/10 pass). It reproduces unchanged on the Privacy worktree based on `origin/main`, which does not contain Security changes. It is therefore a pre-existing product localization failure, not a regression from resource limiting. Small Polyglot build/rejection behavior passed.

## Static and live-safe applicability checks

- `curl` safe GET: `downloads.caissa-chess.org` -> 200 JSON.
- `curl` safe GET: production Scanner status -> 200 JSON.
- Safe GET: production Polyglot build route -> 405 JSON, confirming route presence without submitting work.
- DNS lookup/request for `caissa-game-fetcher.elcriollito.workers.dev` failed; repository/CSP references do not prove current deployment.
- No frontend reference to the position-stat shard Worker was found; its deployed status remains unknown.

## Limits of evidence

- Cloudflare/Vercel deployed Worker source revisions, WAF rules, spend caps, provider concurrency and secrets were not inspected or changed.
- In-memory admissions were not represented as distributed quotas.
- No resource test establishes native ONNX cancellation; the local fix explicitly holds admission instead.
- No load, penetration, account, private-data, R2 inventory or production database test was performed.
- A deployment-specific canary should verify status codes, headers, small legitimate requests, metrics and rollback without using costly workloads.

