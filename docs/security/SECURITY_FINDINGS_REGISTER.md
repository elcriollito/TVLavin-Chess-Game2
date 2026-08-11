# Security Findings Register

Baseline: `6bcec62d5bb9306313ddf889198d98f1579ae37a`

| ID | Severity | Confidence | Finding | CWE | OWASP | Status |
| -- | -------- | ---------- | ------- | --- | ----- | ------ |
| SEC-001 | High | High | Vercel Mentor arbitrary server destination | CWE-918 | A10:2021 SSRF | REMEDIATED |
| SEC-002 | High | High | BYO credential forwarding to arbitrary endpoint | CWE-918/CWE-200 | A10/A02 | REMEDIATED |
| SEC-003 | High | High | Legacy Node Mentor arbitrary server destination | CWE-918 | A10:2021 SSRF | REMEDIATED |
| SEC-004 | High | High | Authenticated arbitrary credit minting | CWE-862 | API5:2023 BFLA | REMEDIATED |
| SEC-005 | Medium | High | Production origin uses Clerk development identity instance | CWE-16 | A05:2021 | CONFIRMED |
| SEC-006 | High | High | Mentor credit deduction is non-atomic | CWE-362 | API6:2023 | REMEDIATED LOCALLY |
| SEC-007 | Medium | High | Anonymous BYO proxy has no effective Mentor rate limit | CWE-770 | API4:2023 | CONFIRMED |
| SEC-008 | Medium | High | AI token/model/temperature and aggregate payload controls are incomplete | CWE-20/CWE-770 | API4/API8 | CONFIRMED |
| SEC-009 | Medium | High | Rate limits are process-local and non-distributed | CWE-799 | API4:2023 | CONFIRMED |
| SEC-010 | Medium | High | Stripe fulfillment idempotency is TOCTOU and fails open | CWE-367/CWE-841 | API6:2023 | CONFIRMED |
| SEC-011 | Medium | High | Sign-in/sign-up accept unvalidated post-auth redirect URLs | CWE-601 | A01:2021 | CONFIRMED |
| SEC-012 | Medium | High | CSP and security headers are inconsistent across production pages | CWE-693 | A05:2021 | HARDENING |
| SEC-013 | Medium | High | Floating/unverified runtime scripts and known dependency advisories | CWE-1104 | A06/A08:2021 | CONFIRMED |
| SEC-014 | Low | High | BYO keys lack explicit logout/provider-switch clearing | CWE-459 | A02:2021 | CONFIRMED |
| SEC-015 | Medium | Medium | External-data HTML sinks require active XSS verification | CWE-79 | A03:2021 | REQUIRES ACTIVE VERIFICATION |
| SEC-016 | Low | High | Wildcard API CORS is broader than required | CWE-942 | A05:2021 | HARDENING |

## Finding details

### SEC-005 — Clerk development instance on production

- Evidence/files/endpoints: production `/api/public-auth-config` returns a `pk_test_` class key; `api/public-auth-config.js` selects environment candidates; `js/auth-config.js` warns on development keys.
- Trust boundary/attack: production identity lifecycle depends on a development Clerk tenant. The publishable key is not secret.
- Impact: environment/user separation, domain restrictions, quotas and lifecycle controls may not meet production expectations.
- Mitigation: server JWT verification still requires the matching server-only secret.
- Remediation/task: migrate production to `pk_live_`/matching secret; validate allowed domains, redirect URLs, user migration and environment-specific webhook secrets. Active dashboard verification required.

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
- Remediation/task: authenticated or tightly rate-limited BYO, durable per-IP/user/provider budgets, body/concurrency limits, strict schemas, fixed/capped shared parameters.

### SEC-010 — Webhook idempotency race/fail-open

- Evidence: `api/stripe/webhook.js` checks `stripe_events`, performs fulfillment, then inserts the event; lookup/insert errors are non-blocking.
- Attack: concurrent legitimate Stripe deliveries can both observe no row and both grant credits; missing/broken table disables protection.
- Impact: duplicate economic grants from valid events. Attackers cannot forge events without the webhook secret.
- Mitigation: Stripe signature, primary-key event table, event allowlist.
- Remediation/task: atomically insert/claim event before fulfillment in a transaction or RPC, fail closed on claim failure, and make fulfillment recoverable/idempotent.

### SEC-011 — Post-auth open redirect

- Evidence: `js/signin-page.js` and `js/signup-page.js` return query `redirect_url` verbatim and assign it to navigation/Clerk callback options.
- Attack/impact: crafted CAISSA authentication links can redirect users to phishing origins after sign-in.
- Remediation/task: accept same-origin relative paths only; reject schemes, protocol-relative URLs and encoded bypasses.

### SEC-012 — Headers/CSP

- Evidence: `vercel.json` gives strong CSP/nosniff/referrer controls mainly to `/play`; legacy HTML permits `unsafe-eval`, broad hosts, blobs and sometimes `unsafe-inline`. Global HSTS, Permissions-Policy, COOP and CORP are absent from repository configuration.
- Impact: weaker defense-in-depth and larger impact from a future injection/dependency compromise.
- Remediation/task: deploy a consistent header baseline; remove CSP exceptions per page using nonces/hashes/bundling.

### SEC-013 — Supply chain

- Evidence: lockfile present; `npm audit --omit=dev` reports 3 High and 1 Moderate (`adm-zip` direct; `lodash`, `nanoid`, `qs` transitive). Multiple pages/`caissa-auth.js` load Clerk `@latest`; only the primary jQuery include visibly uses SRI, while other CDN scripts do not.
- Impact: compromised/floating scripts execute with origin privileges; vulnerable archive tooling can process external ZIP content.
- Remediation/task: pin/bundle Clerk, add SRI where CDN use remains, upgrade `adm-zip` after regression tests, and update supplier chains for transitive advisories.

### SEC-014 — BYO key lifecycle

- Evidence: `mentor-ai.js` retains `_sessionApiKey`; `llm-provider.js` retains `config.apiKey`; provider switching reinitializes without clearing it; no logout hook clears either.
- Impact: key remains readable by same-origin JavaScript for the page lifetime and may carry across provider UI changes.
- Mitigation: not intentionally written to localStorage/sessionStorage; server logs omit the key; fixed provider credential binding exists.
- Remediation/task: explicit clear-on-logout, clear-on-provider-switch, zero DOM field after capture, and avoid direct streaming where possible.

### SEC-015 — XSS active verification set

- Evidence: many `innerHTML` sinks exist. Mentor escapes raw HTML before markup conversion. FICS `updateGameStatus()` inserts newline-containing status without escaping; other external import/display paths need full runtime provenance tests.
- Status rationale: source controllability and production reachability of the suspect strings are not fully established statically.
- Remediation/task: taint-focused browser tests with inert canaries, replace status rendering with text nodes/`<br>` elements, and centralize sanitization. Do not use executable payloads in production.

### SEC-016 — Wildcard CORS

- Evidence: `api/_lib/auth.js` and several routes set `Access-Control-Allow-Origin: *` and allow Authorization headers.
- Impact: any origin can invoke public APIs or authenticated APIs if it separately obtains a bearer token; credentials are not enabled, so this is not a direct auth bypass.
- Remediation/task: restrict browser-facing APIs to production/development allowlists and omit CORS where cross-origin access is unnecessary.
