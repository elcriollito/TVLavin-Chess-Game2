# CAISSA Security and Compliance Review

**Target:** immutable production source `6e912be5c314080be8944efde261b8dc133452a6`
**Method:** repository-wide risk inventory plus targeted static validation and read-only Clerk/Supabase/Vercel observations. No exploit load testing, secret inspection or mutation.
**Codex Security scan:** `ae2c997f-e0d2-4255-8170-b0c3373fa205`; sealed with five findings (one high, four medium), partial coverage limitations preserved (report path recorded in E-SEC-SCAN-001).

Security findings are distinct from legal obligations. No finding authorizes bypassing authentication, weakening JWT verification or copying credentials.

## Architecture controls observed

- Clerk JWTs are verified server-side using the official library and authorized-party restrictions; invalid tokens fail closed. A stale/invalid credential presented to the public Scanner is rejected, while a genuinely credential-free request may use guest policy.
- Supabase service-role credentials are confined to server code in the reviewed paths. Public tables have RLS enabled and no browser policies; server APIs and RPCs are therefore the critical authorization boundary.
- Scanner feedback/review separates public raw-unverified records from owner certification, uses private buckets and short signed URLs.
- Request payload/type/size checks exist on key image and JSON routes.
- Same-origin and CORS checks exist on reviewed mutation routes.

## Validated current findings

### SEC-001 - Caller-controlled premium download tier (HIGH)

`downloads-worker/worker.js:624-628,951-955` accepts `tier=premium` or `x-caissa-tier: premium` without authenticated entitlement and raises download limits from 10/15 MB to 200/80 MB. The worker was reachable. Impact includes unauthorized premium behavior, R2 egress/CPU abuse and bypass of future entitlement controls. Replace client claims with a short-lived signed server capability or authenticated entitlement lookup; default fail closed. Security Season 2 contains a signed-capability design but is not deployed.

### SEC-002 - Anonymous Polyglot resource amplification (MEDIUM)

`api/polyglot/build.js:10-51` accepts up to 25 MB and performs synchronous parsing under an instance-local limiter; `api/_lib/polyglot-builder.js:65-149` has a wall-clock check but no game, per-game, total-move, entry or output budgets. Multiple instances/cold starts bypass the local counter. Add hard structural budgets, concurrency admission and platform-level/durable rate limits. Season 2 contains targeted budgets and admission but is not deployed.

### SEC-003 - Scanner timeout does not control underlying inference (MEDIUM)

`api/_lib/scanner-public-recognition-service.js:28-34,64-75` races inference with a timer but neither cancels the work nor reserves capacity until settlement. Combined with guest access and process-local limiting (`api/_lib/rate-limit.js:3-7`), timed-out work can overlap and exhaust memory/CPU across instances. Add bounded admission that releases only when underlying work settles, plus platform-level quotas and kill switch. Season 2 contains an in-process admission controller, not a distributed/global guarantee.

### SEC-004 - Anonymous Scanner persistence lacks durable quota (MEDIUM)

`api/_lib/scanner-public-service.js:144-152` accepts anonymous scan snapshots into Supabase using service-role access. Payload caps and a process-local RPM limit exist, but no demonstrated durable per-origin/project row/byte/day budget or retention enforcement exists. Abuse can create cost and retention debt. Require authentication or a privacy-preserving durable quota, short retention and operational cleanup.

### SEC-005 - Scanner image storage lacks pre-bound consent and durable storage quota (MEDIUM)

`api/_lib/scanner-public-service.js:233-244` stores authenticated bytes after type/hash checks, before consent is attached in feedback (`174-183`). Current source shows no durable per-user/project storage budget or atomic cleanup. Add consent grants, purpose/version/rights binding, transactional state, quotas and orphan cleanup. Privacy Season 2 addresses this design but needs migration/release governance.

## Activation findings

| ID | Source | Status | Gate |
|---|---|---|---|
| SEC-006 | `cloudflare-worker/worker.js:910-914` permits `max=NaN` through `parseInt/Math.min` | Public deployment not established | Strict bounded integer parsing before activation |
| SEC-007 | `worker/stats-worker.js:14-58` caches whole R2 shards without entry/byte bound | Deployment/shard size not established | Object and aggregate caps with LRU before activation |

## Authentication / JWKS conclusion

Current source correctly distinguishes no credential from a presented invalid credential and fails closed on verifier failure. The October 25 `jwk-kid-mismatch` incident was consistent with a stale/mismatched Clerk production configuration or stale cookie, not grounds to treat invalid credentials as guests. No current production mutation was authorized. AUTH-004 must verify issuer, publishable/secret key pairing, JWKS key IDs, authorized parties and safe key refresh without printing secrets.

## Supabase / data plane

RLS-with-no-policy means browser roles are denied; it is not itself a vulnerability. Service-role functions bypass RLS, so every API/RPC needs ownership and role checks. The 48 `SECURITY DEFINER` functions should be periodically reviewed for explicit `search_path`, grants, identity checks and injection-safe SQL. Storage buckets were private. Versioning/lifecycle enforcement and backup restoration evidence remain operational questions.

## Incident response and legal boundary

IR-001: maintain a one-page plan covering severity, containment, evidence minimization, provider contacts, user/counsel notification analysis, credential rotation approval, restoration, postmortem and legal hold. Florida section 501.171 applicability is fact-sensitive for a free personal project; if applicable, it includes defined notice deadlines and Florida Attorney General thresholds. Do not promise a universal notification period absent applicability analysis.

## Dependency posture

DEP-001: historical repository audit reported six npm advisories (one moderate, five high) in transitive chains. This audit did not update packages or prove reachability. Triage affected imports/runtime bundles, upgrade with regression tests, and document accepted residual risk.

## Season 2 accounting

Branch `integration/engineering-governance-s2-20261026` contains fixes for SEC-001, SEC-002, SEC-003, SEC-006 and SEC-007 plus Scanner privacy controls. It is development evidence only. Review its diff, migration, tests, environment requirements and deployment plan in its own release; do not cherry-pick or call it production from this audit.

## Limitations

The scan covered security-sensitive architecture and known high-cost/data paths, not an independent six-worker file-by-file review of all 3,536 files because delegation was unavailable under session policy. External WAF rules, secret values, log contents, backup restores and provider-internal controls were not inspected or credited.
