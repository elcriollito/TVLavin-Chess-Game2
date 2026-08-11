# API Security Inventory

| Endpoint | AuthN/AuthZ | Validation/limits | Rate limit | Ownership / outbound behavior | Assessment |
| --- | --- | --- | --- | --- | --- |
| `/api/checkout/session` | Clerk Bearer | Allowlisted type/plan/package; server price IDs | 5/10m/user, in-memory | Caller Clerk ID stored in Stripe metadata | Partial; proxy-derived base URL and non-distributed limiter need hardening. |
| `/api/credits/add` | None | Body ignored | N/A | No mutation | Remediated/disabled. |
| `/api/credits/consume` | Clerk Bearer | Fixed feature-cost map | 20/5m/user, in-memory | Atomic row-locking RPC | Strong accounting primitive; limiter not distributed. |
| `/api/library/pull` | Clerk Bearer | `since` not strictly parsed; 500/200 result caps | None | Queries caller `user_id` | Ownership sound; input/rate hardening needed. |
| `/api/library/push` | Clerk Bearer | 200 items/category, weak field/size schemas | None | Forces caller `user_id` | No BOLA evidence; resource/data validation gaps. |
| `/api/library/delete` | Clerk Bearer | Requires array; max 200 | None | Deletes by caller `user_id` + local ID | Ownership sound. |
| `/api/mentor/chat` | Shared mode Clerk; BYO anonymous | 50 messages, 100k chars/message; weak types/aggregate/token/model/temp validation | Imported but not invoked | Shared mode atomically consumes through `consume_credits` before Together; four fixed providers; redirects rejected | SEC-006 remediated locally; anonymous resource/cost-control gaps remain. |
| `/api/polyglot/build` | None | 25 MB PGN, filename/content validation, 90s build timeout | 8/10m/IP, in-memory | Local CPU/memory work | Public expensive operation; platform/distributed controls recommended. |
| `/api/public-auth-config` | None | GET only; response allowlist | None | Exposes publishable configuration only | Safe data class; reveals production development-instance selection. |
| `/api/stripe/webhook` | Stripe signature | Raw body; event switch | Stripe delivery | Elevated premium/credit mutations | Signature sound; idempotency TOCTOU and fail-open. |
| `/api/user/sync` | Clerk Bearer | Email weakly validated | None | Upsert keyed by caller Clerk ID | No cross-user write found; validate email and rate-limit. |
| `/api/wallet` | Clerk Bearer | GET only | None | Query keyed by caller Clerk ID | No BOLA evidence. |

## Cross-cutting conclusions

- Authentication: Bearer-token routes are resistant to conventional cookie CSRF. Webhook uses signature authentication.
- CORS: shared helper uses wildcard origin without credentials. This does not bypass Bearer authentication, but should be restricted.
- Body limits: platform limits exist, but application business limits are absent or inconsistent outside Polyglot and parts of Mentor.
- Errors: most public errors are generic. BYO provider error messages are returned to the caller and should be normalized.
- Logging: actions generally avoid raw bodies/keys, but arbitrary error objects/messages must remain redacted.
