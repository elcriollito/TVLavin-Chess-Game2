# Security Baseline — Season 12

Baseline commit: `6bcec62d5bb9306313ddf889198d98f1579ae37a`
Audit date: 2026-08-11
Method: static source/configuration review plus harmless production configuration/header reads. No intrusive testing was performed.

## Executive assessment

The emergency SSRF and credit-minting defects (SEC-001 through SEC-004) remain remediated. No new Critical issue or emergency stop condition was found. SEC-006 originally confirmed that the shared Mentor path used a non-atomic read-then-write operation. Task 12.1.0 remediates it locally by making the existing row-locking `consume_credits` RPC the authorization boundary before provider invocation; release verification remains pending. Systematic Medium-risk work remains around production Clerk configuration, Stripe webhook idempotency, anonymous AI proxying, input/cost limits, CSP/headers, redirects, and supply-chain hygiene.

## Priority verdicts

- Clerk: production returns a `pk_test_` publishable key from `/api/public-auth-config`. It is not a secret, but it indicates a development Clerk instance on the production origin. No repository `pk_live_` was found. Runtime environment variables choose the instance; `CLERK_SECRET_KEY` remains server-only. Production/development user separation and dashboard redirect/webhook restrictions cannot be proven from the repository.
- Authorization: browser wallet fields can spoof UI state, but server Mentor and billing decisions read verified Clerk identity and database entitlement. No server admin surface was found. Client-side premium spoofing: YES. Server-side premium bypass: NO STATIC EVIDENCE. Client-side admin spoofing: YES (display/local state only). Server-side admin escalation: NO STATIC EVIDENCE.
- Credits: arbitrary minting is remediated. Historically, `/api/mentor/chat` bypassed the atomic primitive: with balance 1, concurrent A and B could both read 1, both pass, both update to 0, and both AI operations could succeed. Locally, shared Mentor now calls `consume_credits` before the provider, so only a successful atomic decision authorizes work. Credits are intentionally not refunded on provider failure because no safe request-scoped idempotent refund primitive exists.
- Mentor: BYO requests are anonymous and proxy through CAISSA to four fixed providers. The user pays provider token cost, while CAISSA pays serverless bandwidth/CPU. The imported rate-limit functions are not invoked in the Mentor handler. Message count is capped at 50 and each message at 100,000 characters, but roles/types, aggregate size, `maxTokens`, model, and temperature are not bounded appropriately. Shared Together uses a fixed server model but accepts unbounded `maxTokens`.
- BYO keys: held in DOM input, `MentorAI._sessionApiKey`, and `LLMProvider.config`; sent in the CAISSA request body and then provider headers. They are not intentionally persisted to local/session storage. Same-origin JavaScript can read them. No explicit logout or provider-switch clearing exists. Direct streaming sends keys from the browser to fixed provider endpoints; custom streaming is disabled.
- XSS: Mentor content escapes `&`, `<`, and `>` before limited markdown-to-HTML conversion; no executable LLM-output path was confirmed. Numerous global `innerHTML` sinks exist. Most reviewed paths escape data, but FICS multiline status and other externally derived display paths require active taint verification.
- IDOR/BOLA: no static evidence in the server data APIs. Library operations resolve the database UUID from the verified Clerk subject and filter all objects by `user_id`.
- CSRF/CORS: authenticated state changes require a custom Bearer token, reducing classical CSRF exposure. APIs broadly emit `Access-Control-Allow-Origin: *`; credentials are not enabled, but the rule is wider than necessary.
- Secrets: no exposed production secret value was found in the tracked tree. Publishable Clerk keys are not secrets.

## Controls and gaps

| Area | Assessment | Evidence summary |
| --- | --- | --- |
| Authentication | Partial | Clerk JWT verified server-side; production uses development instance. |
| Authorization | Generally server-enforced | User data keyed by verified subject; no server admin route found. |
| Credit accounting | Remediated locally; release pending | Shared Mentor now uses the atomic row-locking RPC before provider invocation. |
| Webhooks | Partial | Stripe signature/raw body/event allowlist present; idempotency is check-then-process-then-insert and fails open. |
| Rate limiting | Weak | In-memory, non-distributed; absent from Mentor despite imports. |
| Body/resource limits | Partial | Polyglot has 25 MB/90 s; Mentor has per-message limits; library lacks field/aggregate limits. |
| CSP | Partial/weak | `/play` is strong; legacy pages permit `unsafe-eval`, broad third parties, and sometimes `unsafe-inline`. |
| Headers | Weak globally | Stronger headers apply primarily to `/play`; HSTS, Permissions-Policy, COOP and CORP are not consistently configured. |
| Supply chain | Weak | Lockfile exists; four production audit advisories (3 High, 1 Moderate); floating Clerk `@latest`; most CDN scripts lack SRI. |
| Logging | Partial | Structured logger redacts common secret field names, but arbitrary error messages and metadata still need minimization. |

## Recommended order

1. Release and production-verify the local SEC-006 atomic Mentor remediation.
2. SEC-005: migrate production to a Clerk production instance and validate domains, redirects, users, and webhook secrets.
3. SEC-008/SEC-009: enforce durable distributed limits, aggregate body limits, token/model/temperature schemas, and concurrency limits.
4. SEC-010: make Stripe event claiming atomic and fail closed before fulfillment.
5. SEC-011: validate same-origin post-auth redirects.
6. SEC-012/SEC-013: deploy consistent CSP/security headers and replace floating/unverified runtime scripts; remediate reachable dependency advisories.
7. SEC-014/SEC-015: clear BYO keys on lifecycle changes and complete active taint testing of global HTML sinks.
