# Security Season 12 Production Closeout

Date: 2026-08-12

## Certified production state

- Runtime source: `af77bc0ddaeaee780712af1eb87352470c98daf5`.
- Vercel deployment: `dpl_CfspDMwDjLSCzQyQda49LMSRkSed`, READY and serving `www.caissa-chess.org` during certification.
- Database family/version: `caissa-application` / `2026-08-11.1` / `security-season-12`.
- Installed layers: authoritative bootstrap, SEC-009 and SEC-010.
- Rollback boundary: crossed. Old pre-SEC-010 webhook code must not be blindly restored; use an RPC-compatible forward fix.
- Mentor: intentionally disabled pending operational enablement; limiter secret is configured and database controls are ready.
- SEC-005: remediation in progress, schema absent, migration mode not enforced, no identity cutover.

## Production evidence

Catalog-only checks found all nine expected application/control tables and all six expected privileged RPCs. RLS was enabled on nine of nine tables. `anon`, `authenticated` and PUBLIC held no prohibited application table or privileged RPC authority; `service_role` held the six intended RPC EXECUTE grants. Aggregate counts for users, credit events, Stripe events, library records and Mentor limiter rows were zero. No identifiers, credentials or row contents were collected.

Production-safe HTTP checks returned controlled 401 for user sync, wallet and library pull/push/delete; 403 `CREDIT_GRANTS_DISABLED` for client credit grants; dormant 404 for both SEC-005 routes; and 403 for an untrusted Origin. `/`, `/play`, `/signin` and `/premium` returned 200 with CSP, HSTS, nosniff, Referrer-Policy and frame protection. Play and its same-origin Worker were healthy. An external post-auth redirect candidate did not produce an external redirect.

Local current-owner security gates passed 113/113. Supply-chain policy passed, `npm audit` reported zero known vulnerabilities, and the public-release audit passed. These checks cover fixed Mentor destinations, SSRF containment, atomic credits, distributed capacity, Stripe idempotency, redirect containment, headers/CORS, pinned dependencies, BYO key lifecycle, tainted sinks, auth normalization, SEC-005 dormancy and private artifact exclusion.

No live Stripe event, manual retry, paid provider request, real BYO key, fake production user, database mutation or identity migration was performed during closeout.

## Findings disposition

| Finding | Severity | Final status | Production verified | Residual action |
| --- | --- | --- | --- | --- |
| SEC-001 | High | Remediated | Yes | Preserve fixed Mentor destinations |
| SEC-002 | High | Remediated | Yes | Preserve fixed BYO provider mapping |
| SEC-003 | High | Remediated | Yes | Keep legacy custom/local routing retired |
| SEC-004 | High | Remediated | Yes | Keep public credit grants disabled |
| SEC-005 | Medium | Remediation in progress | Dormancy verified | Separate Clerk authority and identity cutover |
| SEC-006 | High | Remediated | Yes | Preserve atomic `consume_credits` authority |
| SEC-007 | Medium | Remediated | Yes | Preserve authentication and limiter gate |
| SEC-008 | Medium | Remediated | Yes | Preserve request/model bounds |
| SEC-009 | Medium | Remediated | Yes | Operate distributed limiter; bounded cleanup only |
| SEC-010 | Medium | Remediated | Yes | Forward-fix only; retain idempotency history |
| SEC-011 | Medium | Remediated | Yes | Preserve internal-only redirects |
| SEC-012 | Medium | Remediated | Yes | Maintain header regression coverage |
| SEC-013 | Medium | Remediated | Yes | Continue dependency/provenance audits |
| SEC-014 | Low | Remediated | Yes | Keep BYO credentials ephemeral |
| SEC-015 | Medium | Remediated | Yes | Extend taint tests for new external content |
| SEC-016 | Low | Remediated | Yes | Preserve exact-origin CORS |

## Certification decision

Security Season 12 general release is production verified with Mentor intentionally disabled. SEC-005 is explicitly excluded from general closure and remains a separately authorized identity cutover.
