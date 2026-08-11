# Security Findings Register

Baseline: `0c3c1599ad47aae9477db863146bd3909020355d`

| ID | Severity | Confidence | Finding | CWE | OWASP | Status |
| -- | -------- | ---------- | ------- | --- | ----- | ------ |
| SEC-001 | High | High | Vercel Mentor arbitrary server destination | CWE-918 | A10:2021 SSRF | REMEDIATED |
| SEC-002 | High | High | BYO credential forwarding to arbitrary endpoint | CWE-918/CWE-200 | A10/A02 | REMEDIATED |
| SEC-003 | High | High | Legacy Node Mentor arbitrary server destination | CWE-918 | A10:2021 SSRF | REMEDIATED |
| SEC-004 | High | High | Authenticated arbitrary credit minting | CWE-862 | API5:2023 BFLA | REMEDIATED |
| SEC-005 | Medium | High | Production origin uses Clerk development identity instance | CWE-16 | A05:2021 | REMEDIATION IN PROGRESS |
| SEC-006 | High | High | Mentor credit deduction is non-atomic | CWE-362 | API6:2023 | REMEDIATED LOCALLY |
| SEC-007 | Medium | High | Anonymous BYO proxy has no effective Mentor rate limit | CWE-770 | API4:2023 | CONFIRMED |
| SEC-008 | Medium | High | AI token/model/temperature and aggregate payload controls are incomplete | CWE-20/CWE-770 | API4/API8 | CONFIRMED |
| SEC-009 | Medium | High | Rate limits are process-local and non-distributed | CWE-799 | API4:2023 | CONFIRMED |
| SEC-010 | Medium | High | Stripe fulfillment idempotency is TOCTOU and fails open | CWE-367/CWE-841 | API6:2023 | REMEDIATED LOCALLY |
| SEC-011 | Medium | High | Sign-in/sign-up accept unvalidated post-auth redirect URLs | CWE-601 | A01:2021 | CONFIRMED |
| SEC-012 | Medium | High | CSP and security headers are inconsistent across production pages | CWE-693 | A05:2021 | REMEDIATED LOCALLY |
| SEC-013 | Medium | High | Floating/unverified runtime scripts and known dependency advisories | CWE-1104 | A06/A08:2021 | REMEDIATED LOCALLY |
| SEC-014 | Low | High | BYO keys lack explicit logout/provider-switch clearing | CWE-459 | A02:2021 | REMEDIATED LOCALLY |
| SEC-015 | Medium | Medium | External-data HTML sinks require active XSS verification | CWE-79 | A03:2021 | REMEDIATED LOCALLY |
| SEC-016 | Low | High | Wildcard API CORS is broader than required | CWE-942 | A05:2021 | REMEDIATED LOCALLY |

## Finding details

### SEC-005 — Clerk development instance on production

- Evidence/files/endpoints: production `/api/public-auth-config` returns a `pk_test_` class key; `api/public-auth-config.js` selects environment candidates; `js/auth-config.js` warns on development keys.
- Trust boundary/attack: production identity lifecycle depends on a development Clerk tenant. The publishable key is not secret.
- Impact: environment/user separation, domain restrictions, quotas and lifecycle controls may not meet production expectations.
- Mitigation: server JWT verification still requires the matching server-only secret.
- Migration readiness: Clerk documents that development-instance user data cannot be transferred to the production instance. CAISSA child data is anchored to internal `users.id`, but current API lookups, browser profiles and Stripe checkout metadata use `clerk_id`. A live-key swap without an authoritative old-subject to internal-account to new-subject mapping would create duplicate user rows and orphan access to credits, premium state and library data.
- Recommended strategy: Strategy B identity remapping, rehearsed in an isolated environment, with conflict-safe account proof, immutable audit mapping and explicit handling for in-flight Stripe checkout metadata. See `SEC-005_CLERK_PRODUCTION_MIGRATION_PLAN.md`.
- Foundation status: additive service-role-only binding/challenge/enrollment/audit schema, atomic activation/confirmed rollback RPCs, dormant migration-aware sync, fixed dual-verifier routes, persistent database throttling, non-public recovery CLI, high-entropy handoff service and count-only readiness utility are implemented locally. Isolated Supabase PostgreSQL 17.6 passed real challenge, collision, concurrency, RLS, rollback, failure-atomicity, recovery, immutable-audit, ownership, Stripe-continuity and sync checks. Verifiers use synthetic cryptographic boundaries only until two isolated Clerk authorities are authorized. No migration has been applied to production and migration mode is not enabled there.
- Status: remediation in progress until production data quality is reviewed, the migration is rehearsed, operational configuration is complete, and cutover is production-verified.

### SEC-006 — Non-atomic Mentor credit deduction

- Evidence: `api/mentor/chat.js` selects credits, checks them, then updates `credits: user.credits - 1`; `api/credits/consume.js` and `supabase-schema.sql` provide an unused locking RPC.
- Source-to-sink: authenticated concurrent requests → same balance read → both authorized → both updates → multiple provider calls.
- Impact: free shared-AI use and accounting inconsistency. Balance commonly ends at zero rather than negative, masking the duplicate operation.
- Mitigation: per-message cost and authentication exist; no effective Mentor concurrency limit.
- Local remediation: shared Mentor now calls the row-locking `consume_credits` RPC with the verified Clerk subject before provider invocation. The provider is not called when atomic consumption fails or the database is unavailable. Trusted premium behavior remains inside the RPC. Deterministic tests cover 1/2/10-way concurrency, forged client fields, identity isolation and fail-closed database behavior.
- Failure semantics: a provider failure consumes the already-authorized credit once and is not refunded. The current schema has no request-scoped idempotent refund primitive; adding credits as compensation would risk double refund/minting. Retry idempotency remains future hardening.
- Remediation status: remediated locally; release and production verification remain required. No production concurrency test required.

### SEC-007/008/009 — AI/resource controls

- Evidence: Mentor imports rate limiting but never calls it; anonymous BYO is permitted; `maxTokens`, supported model choice and temperature pass through without numeric caps; aggregate content can approach 5 MB; limiter storage is a module `Map`.
- Attack: anonymous or distributed clients submit repeated large proxy requests; authenticated shared clients request excessive output.
- Impact: CAISSA serverless bandwidth/CPU exhaustion and potentially increased CAISSA provider spend in shared mode. BYO provider spend belongs to the user.
- Local remediation: all proxied shared and BYO Mentor modes require verified identity and pass a strict bounded schema. PostgreSQL UTC counters and expiring leases enforce user/global frequency and concurrency across serverless instances. Shared use remains behind SEC-006 credits; Premium and BYO remain abuse-limited. The legacy Node proxy is retired; direct browser-to-provider streaming is separately documented.
- Remediation status: SEC-007, SEC-008 and SEC-009 remediated locally; migration deployment and production verification remain required. See `SEC-007_MENTOR_ANONYMOUS_ABUSE_CONTROLS.md`, `SEC-008_AI_INPUT_COST_CONTROLS.md`, and `SEC-009_DISTRIBUTED_RATE_LIMITING.md`.

### SEC-010 — Webhook idempotency race/fail-open

- Original evidence: `api/stripe/webhook.js` checked `stripe_events`, fulfilled, then inserted the event; lookup/insert errors were non-blocking. Concurrent legitimate deliveries could both grant value before the second ledger insert conflicted.
- Local remediation: the signature-verified route now derives a fixed entitlement command and calls one service-role-only PostgreSQL RPC. Event claim, UUID/customer resolution, credit/premium mutation, credit audit and completion are atomic. Event ID and event-specific business keys are unique. Transaction failure rolls back the claim and value; completed duplicates return safely without replay.
- Economic authorization: credit packages map server-side to 25/75/200, renewal is fixed to 50, paid Checkout mode is required, email is never used, and UUID/legacy-subject correlation must also match the unique Stripe customer.
- Rehearsal: isolated PostgreSQL 17.6 passed sequential, 2-way and 10-way duplicate delivery, cross-event business-key, independent-event, failure injection, renewal, deletion, forged-value, cross-user, RLS and privilege checks. See `SEC-010_STRIPE_WEBHOOK_IDEMPOTENCY.md`.
- Remediation status: remediated locally; production data uniqueness review, database release, deployment and Stripe test/live verification remain separately controlled.

### SEC-011 — Post-auth open redirect

- Evidence: `js/signin-page.js` and `js/signup-page.js` return query `redirect_url` verbatim and assign it to navigation/Clerk callback options.
- Attack/impact: crafted CAISSA authentication links can redirect users to phishing origins after sign-in.
- Local remediation: `sanitizeInternalRedirect` enforces a normalized root-relative application path before browser or Clerk navigation. Schemes, protocol-relative/multiple-slash paths, backslashes, controls, encoded/double-encoded separators, userinfo/lookalike hosts and sensitive route prefixes fall back to `/`. Auth helpers preserve only validated current paths. Checkout success/cancel URLs now use a canonical or server-controlled origin instead of request headers.
- Credential escalation review: no session JWT, OAuth code, migration challenge, password-reset/verification token or Stripe secret enters redirect state.
- Remediation status: remediated locally; production deployment and isolated Clerk/Stripe integration verification remain required. See `SEC-011_OPEN_REDIRECT_HARDENING.md`.

### SEC-012 — Headers/CSP

- Evidence: `vercel.json` gives strong CSP/nosniff/referrer controls mainly to `/play`; legacy HTML permits `unsafe-eval`, broad hosts, blobs and sometimes `unsafe-inline`. Global HSTS, Permissions-Policy, COOP and CORP are absent from repository configuration.
- Impact: weaker defense-in-depth and larger impact from a future injection/dependency compromise.
- Local remediation: `vercel.json` now supplies a coherent global CSP and security-header baseline while Play retains its stricter route policy. Global `unsafe-eval`, remote/blob Workers and universal source wildcards are absent. Legacy inline execution and external scripts remain documented debt. See `SEC-012_CSP_SECURITY_HEADERS.md`.
- Remediation status: remediated locally with Chromium/WebKit and full local regression evidence; deployment verification remains required.

### SEC-013 — Supply chain

- Evidence: lockfile present; `npm audit --omit=dev` reports 3 High and 1 Moderate (`adm-zip` direct; `lodash`, `nanoid`, `qs` transitive). Multiple pages/`caissa-auth.js` load Clerk `@latest`; only the primary jQuery include visibly uses SRI, while other CDN scripts do not.
- Impact: compromised/floating scripts execute with origin privileges; vulnerable archive tooling can process external ZIP content.
- Remediation/task: pin/bundle Clerk, add SRI where CDN use remains, upgrade `adm-zip` after regression tests, and update supplier chains for transitive advisories.
- Local remediation: Clerk is pinned to 6.28.1 with SHA-384 SRI where its static CDN asset is used; tenant Clerk UI and other dynamic vendor exceptions are exact-versioned and documented. Browser chess dependencies and Stockfish Worker loads were moved to reviewed local assets where available. `adm-zip`, `sharp`, and four transitive chains were patched with exact versions; the final npm audit reports zero vulnerabilities. A lock/provenance/runtime guard and reproducible security command prevent silent drift. See `SEC-013_SUPPLY_CHAIN_HARDENING.md`.
- Remediation status: contained locally with mock/local regression evidence; production deployment and validation against separately authorized isolated Clerk authorities remain required.

### SEC-014 — BYO key lifecycle

- Evidence: `mentor-ai.js` retains `_sessionApiKey`; `llm-provider.js` retains `config.apiKey`; provider switching reinitializes without clearing it; no logout hook clears either.
- Impact: key remains readable by same-origin JavaScript for the page lifetime and may carry across provider UI changes.
- Mitigation: not intentionally written to localStorage/sessionStorage; server logs omit the key; fixed provider credential binding exists.
- Remediation/task: explicit clear-on-logout, clear-on-provider-switch, zero DOM field after capture, and avoid direct streaming where possible.
- Local remediation: the credential is now held only in lexical module scope; public configuration exposes a boolean only. Provider, explicit clear, failed test, sign-out/auth transition, disabled BYO and pagehide events remove reachable references, and the input is cleared after capture. Storage, reload, fixed-destination and sentinel-log tests pass. See `SEC-014_BYO_KEY_LIFECYCLE.md`.
- Remediation status: remediated locally; JavaScript cannot guarantee physical memory zeroization and same-page code can theoretically observe an actively used browser secret.

### SEC-015 — XSS active verification set

- Evidence: many `innerHTML` sinks exist. Mentor escapes raw HTML before markup conversion. FICS `updateGameStatus()` inserts newline-containing status without escaping; other external import/display paths need full runtime provenance tests.
- Status rationale: source controllability and production reachability of the suspect strings are not fully established statically.
- Remediation/task: taint-focused browser tests with inert canaries, replace status rendering with text nodes/`<br>` elements, and centralize sanitization. Do not use executable payloads in production.
- Local remediation: Mentor errors and FICS multiline status now use text nodes; import fallback URLs use fixed HTTPS bases, encoded usernames and DOM properties. Existing limited Mentor Markdown escapes HTML before formatting. Fifteen active product-path cases passed in each of Chromium and WebKit with no marker execution, including PGN, FICS, URL, stored-like and combined BYO-sentinel paths. See `SEC-015_XSS_TAINT_VERIFICATION.md`.
- Remediation status: remediated locally; future rich-content or new external-data features must extend the taint suite.

### SEC-016 — Wildcard CORS

- Evidence: `api/_lib/auth.js` and several routes set `Access-Control-Allow-Origin: *` and allow Authorization headers.
- Impact: any origin can invoke public APIs or authenticated APIs if it separately obtains a bearer token; credentials are not enabled, so this is not a direct auth bypass.
- Local remediation: wildcard CORS was replaced by exact canonical/server-controlled origin matching, route-specific methods, restricted preflight headers, `Vary: Origin`, no credentials, and generic rejection of null/unlisted origins. Stripe webhook and public auth config omit browser CORS. See `SEC-016_CORS_HARDENING.md`.
- Remediation status: remediated locally with exact-origin/preflight regression evidence; deployment verification remains required.
