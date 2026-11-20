# CAISSA Arena S001 Security Review

Status: **HOLD — managed diff scan failed; independent review and local checks complete; isolated hosted verification outstanding**
Reviewed application range: `6df4c2bf4be00fea72f88d63cae726e8515c4380..86224d33f67ac7343e84a2406caac6c01b264843`
Review date: 2026-11-19/20 (America/New_York)

## Executive decision

No confirmed critical or high-severity issue was found by the implementation
review, static assertions, API tests, browser tests, or disposable PostgreSQL
harness. The feature nevertheless remains on hold because:

1. the Codex Security managed diff-scan launcher rejected valid Git targets after
   its own setup inspection reported `hasHead: true`, `isWorktree: true`, and
   `reviewChangesSupported: true`; and
2. there is no verified non-production Vercel/Supabase environment in this
   worktree for live Clerk, RLS, Realtime, and four-account testing.

This document is an engineering control review, not a substitute for the blocked
managed scan or the owner’s four-human acceptance test.

## Threat model

Protected assets are game/result integrity, clock integrity, tournament scoring
and rank, private tournament membership and activity, canonical public identity,
service-role credentials, and production isolation.

Relevant attackers are an unauthenticated visitor, an Online guest, a normal
registered user outside the four-member beta, an authorized beta participant
sending malformed/replayed commands, and a participant attempting to observe or
alter another game. Browser code and Realtime messages are treated as untrusted.

Trust boundaries:

- Clerk/Supabase token verification -> Online API;
- Online API -> service-role RPC adapter;
- PostgreSQL RPC/transaction -> durable tournament and game rows;
- private Realtime invalidation -> canonical authenticated resync;
- canonical API response -> escaped/text-only DOM presentation.

## Control review

| Surface | Control | Evidence/result |
| --- | --- | --- |
| Production isolation | Arena returns disabled for production rollout regardless of flags | API and pure-engine tests pass |
| Beta authorization | exact server-side Clerk-subject allowlist; guests rejected | authorized/unauthorized/guest API tests pass |
| Organizer authorization | separate admin allowlist plus creation flag | organizer tests pass; no implicit user promotion |
| Input validation | bounded UUID, name, duration, start time, and fixed control catalog | API/engine/migration tests pass |
| Rate limiting | tournament commands remain behind the existing common authenticated request limiter | inherited Online API tests pass |
| Browser authority | no client result, clock, score, color, opponent, or display-name authority | canonical RPC/game-engine flow exercised |
| Direct database access | RLS enabled; browser grants and RPC execute revoked; only service role executes Arena RPCs | migration assertions and real migration apply pass |
| Least privilege | Arena tables grant service role only select/insert/update/delete; sequence usage is explicit | migration assertion passes |
| Cross-instance concurrency | transaction advisory locks, row locks, `SKIP LOCKED`, state transitions, partial unique indexes | source assertions and PostgreSQL harness pass |
| Idempotency | event IDs, creation-event unique index/lock, post-lock registration recheck, exact-once `scored_at` guard | duplicate join and repeated score harness checks pass |
| Audit/broadcast amplification | no-op joins/withdrawals return canonical sync; nonparticipant withdrawal fails before event/version mutation | corrected in `86224d33`; PostgreSQL regression passes |
| Result integrity | scores only completed canonical Online games; explicit 2/1/0 contract | PostgreSQL harness and unit tests pass |
| Private Realtime | private topic `online-tournament:<uuid>`; authenticated participant-membership policy | migration/API/browser tests pass; hosted JWT policy test outstanding |
| Realtime authority | messages contain only ID/version/event/correlation and trigger canonical resync | browser recovery and duplicate-message regressions pass |
| Identity privacy | state passes through the existing canonical public-identity resolver; no raw email returned | projection and Online regression tests pass |
| XSS | tournament names reject control/angle characters; UI renders dynamic names/status with `textContent` | code review and browser tests pass |
| Secret handling | no env file or credentials added; public config exposes booleans only | repository/config inspection pass |
| Disconnect abuse | expired presence moves waiters to `disconnected`; only authenticated recovery requeues | migration assertion and lifecycle review pass |

## Database policy notes

The migration does not enable or otherwise reconfigure RLS on
`realtime.messages`; it adds only the private broadcast read policy expected by
Supabase Realtime. The policy’s definer function uses an empty `search_path`, an
exact topic string, the authenticated JWT subject, and durable tournament
membership. Arena RPCs use invoker rights and are executable only by
`service_role`.

The disposable PostgreSQL test stubs `auth.jwt`, `realtime.topic`, and Realtime
send functions so the migration can be parsed and executed without Docker. That
proves SQL validity, grants/revokes, constraints, and lifecycle behavior; it does
not prove hosted Supabase JWT or Realtime behavior. A protected preview must test
those controls with four distinct real accounts before release.

## Managed scan blocker and independent fallback

The scanner was retried against a clean ordinary, non-detached clone at
`C:\CAISSA-S001-SECURITY`, with resolvable HEAD `2386c78c` and the explicit
full-SHA range ending at that then-current documentation HEAD.
`inspect_codex_security_setup` returned `isGit: true`, `isWorktree: true`,
`hasHead: true`, and `reviewChangesSupported: true`. The subsequent
`start_codex_security_prompt_only_scan` call returned exactly:

> Review changes requires a non-bare Git worktree with a resolvable HEAD.

No scan ID or canonical report was created. Per scanner policy, no substitute
managed report was fabricated. Daybreak access also reported `not_granted`, which
may prevent protected scan output display even after the launcher problem is
resolved.

The prior independent fallback bound the original application patch and returned
`hold_for_evidence`. After independent review found the no-op membership
amplification described above, the corrected immutable range was fixed and
reverified. Its binary diff SHA-256 is
`b2a103b4f9465a716133726adb7da06de6f843265fcf34d267ca7020da1737fb`.
The combined original fallback and corrected local review covered authentication/authorization, service-role boundaries, migration
grants/search paths, input validation, concurrency, idempotency, scoring,
Realtime policy, identity projection, origin configuration, and recovery. Its
validated recommendation is `hold_for_evidence`: no validated high- or
critical-severity code vulnerability was established, but hosted identity,
origin, Realtime, migration, and four-user evidence are decision-critical. This
independent evidence does not convert the failed managed scan into a pass.

## Open findings and release gates

| ID | Severity | State | Required closure |
| --- | --- | --- | --- |
| SEC-S001-01 | process limitation | recorded | managed launch failure preserved; independent immutable-patch review completed with `hold_for_evidence`; rerun managed scan if the launcher becomes available |
| SEC-S001-02 | release-blocking environment gap | open | approve a dedicated $10/month backend, then exercise AUTH-004D, service-role RPCs, RLS, and private Realtime with four accounts |
| SEC-S001-03 | acceptance gap | open | complete the four-person human scenario and record owner PASS/FAIL |
| SEC-S001-04 | low availability/audit integrity | remediated locally | no-op membership and nonparticipant-withdraw regression passes; hosted verification pending |

## Prohibited release actions

Do not apply the migration to production, add production credentials to a preview,
enable public discovery, merge to `main`, or promote any deployment until all
three open gates are closed and the owner explicitly authorizes the next step.
