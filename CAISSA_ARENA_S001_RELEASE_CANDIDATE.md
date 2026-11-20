# CAISSA Arena S001 Release Candidate

Decision: **HOLD**  
Branch: `feature/caissa-online-arena-s001`  
Baseline: `6df4c2bf4be00fea72f88d63cae726e8515c4380`  
Application candidate: `c9998be49ec2f542d742a0cc8a2655698ad5daee`  
Preview URL: not available

## Engineering status

The application implementation is complete for the defined S001 private beta
scope. It includes a real server-authoritative Arena lifecycle, deterministic
transactional pairing, ordinary two-player Online games and clocks, exact-once
2/1/0 scoring, live/final standings, private Realtime invalidation, recovery,
join/withdraw, the eight approved controls, and responsive CAISSA tournament UI.

The candidate is disabled by default and unconditionally disabled in production.
No remote deployment, remote migration, environment change, production data
access, push, PR, merge, or promotion was performed.

## Candidate commits

| Commit | Purpose |
| --- | --- |
| `d1e396769ba9288c8336aae30afd8bb025d8b57d` | Arena engine, migration, API, UI, Realtime, and focused tests |
| `c9998be49ec2f542d742a0cc8a2655698ad5daee` | least-privilege grants, creation/join idempotency hardening, duplicate/withdraw/rejoin PostgreSQL tests |

The documentation commit is packaging evidence only; the runtime application
candidate is the second commit above.

## Deliverables

- `CAISSA_ARENA_S001_ARCHITECTURE.md`
- `CAISSA_ARENA_S001_SECURITY_REVIEW.md`
- `CAISSA_ARENA_S001_ENVIRONMENT_AUDIT.md`
- `CAISSA_ARENA_S001_TEST_MATRIX.md`
- `CAISSA_ARENA_S001_BETA_RUNBOOK.md`
- `CAISSA_ARENA_S001_RELEASE_CANDIDATE.md`
- `CAISSA_ARENA_S001_ROLLBACK_PLAN.md`
- `supabase/migrations/20261120033413_caissa_online_arena_s001.sql`

## Verification summary

- Online unit/integration: 116/116 pass.
- Online browser: 108/108 pass across Chromium, Firefox, WebKit.
- Arena browser: 12/12 pass within that matrix.
- Disposable PostgreSQL 17 migration/lifecycle harness: pass.
- Board: 26/26 unit; 19 pass and 1 expected skip in browser foundation.
- Navigation: 9/9 pass.
- Syntax: Online and board pass.

The public release manifest audit is not green because the baseline manifest is
already stale, including untouched Yahoo Classic files. This scoped candidate did
not regenerate unrelated public-release artifacts.

## Hold reasons

1. **No authorized isolated backend.** The authoritative Vercel project is known,
   but its custom `staging` environment is the PGN Reader release path, the Arena
   branch has no scoped variables/deployment, and both nonproduction Supabase
   projects contain pre-existing workload data. The preferred data-less Supabase
   Preview branch is billable and needs owner approval.
2. **Managed security scan unavailable.** The scanner setup validated the exact
   clean Git target/range, but its launcher then rejected the target as lacking a
   resolvable HEAD. No canonical managed scan exists. A validated independent
   immutable-patch review is complete with `hold_for_evidence`; it is explicitly
   not a managed-scan pass.
3. **Hosted four-user certification not run.** Local synthetic and PostgreSQL
   tests do not replace actual hosted Clerk/API/database interactions with four
   distinct automated identities.

## Exit criteria for HOLD

- Obtain owner cost approval for a dedicated data-less Supabase branch/project
  and owner selection of a separate Clerk Development identity.
- Verify a protected branch Preview on the authoritative Vercel project with
  branch-scoped variables and that isolated Clerk/Supabase stack.
- Preserve the managed scanner failure and independent `hold_for_evidence`
  assessment; rerun the managed scanner if its launcher becomes available.
- Apply the migration only to that isolated database and validate hosted RLS and
  private Realtime with four distinct accounts.
- Complete hosted four-identity automation, then deliver the protected URL and
  four-person Human QA checklist. Human QA remains pending until the owner and
  three real testers execute it.
- Refresh the exact preview deployment/commit evidence after any code or
  documentation change that affects the candidate identity.

## Known limitations

- S001 is private, unrated, standard chess, four-player capacity/minimum.
- No public tournament directory, chat, streak/bonus scoring, Swiss, round robin,
  Chess960, or self-service organizer UI.
- Lifecycle reconciliation is request-driven through authenticated sync/polling;
  it has no separate scheduled worker in S001.
- Games view intentionally exposes only the current participant’s tournament
  games; standings expose the authorized four-player field.
- Physical-device feel, hosted cross-instance concurrency, hosted JWT/RLS, and
  hosted Realtime remain Human QA/preview gates.

## Owner decision

Do not use the “FOUR-PLAYER HUMAN QA READY” status yet. The next safe action is to
provide or authorize a verifiably isolated preview stack, not to deploy or migrate
production.
