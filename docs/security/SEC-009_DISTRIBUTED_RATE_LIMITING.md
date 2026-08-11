# SEC-009 — Distributed Mentor Rate Limiting

Status: remediated locally; rehearsed only on the authorized disposable PostgreSQL 17.6 database.

`mentor_rate_windows` stores UTC fixed windows and `mentor_concurrency_leases` stores expiring claims. `claim_mentor_capacity` uses fixed-order advisory transaction locks, validates every dimension, increments counters and creates a lease atomically. Exact release plus TTL prevents permanent locks after server failure.

Policy:

- user: 6/minute, 30/hour, 100/UTC day;
- global: 1,000/hour;
- user concurrency: 2;
- lease TTL: 30 seconds.

Scopes are HMAC-SHA-256 pseudonyms under server-only `MENTOR_RATE_LIMIT_SECRET`; raw IP, API key and Clerk subject are not stored. RLS is enabled, direct table access is denied, and only service-role execution of fixed-search-path functions is granted. Cleanup removes expired leases and windows older than two days.

Order: HTTP size guard → authentication → schema → kill switch → durable rate/concurrency claim → atomic SEC-006 credit for shared mode → provider → release. Invalid/rate-limited requests consume no credit. Premium and BYO remain rate-limited. Limiter outage returns 503; denial returns 429 and safe `Retry-After`.

Real rehearsal with ten separate connections and concurrency limit 3 accepted exactly 3 and rejected 7. Release, stale expiry, user isolation, minute boundary, UTC daily reset, global breaker and least privilege also passed.

Fixed windows permit a bounded boundary burst; hour/day/global controls and concurrency prevent unlimited use. Multiple accounts, NAT and VPN behavior remain known limitations.
