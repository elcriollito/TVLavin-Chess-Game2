# CAISSA Account Control Fresh-Chain Order Certification

Date: 2026-10-19 (America/New_York)

Mission: `CAISSA_ACCOUNT_CONTROL_FRESH_CHAIN_ORDER_HOTFIX`

Isolated branch: `fix/account-control-fresh-chain-order-20261019`

Stack base: PR #84 at `f2318cebd4c9bc71eb66e7ca4380742bad2db867`

Implementation commit: `a00b89a261f15da39702f8bdc4cabf7b5c996f5c`

No hosted migration, migration-history repair, Supabase write, Production
connection, password operation, merge, or destructive user operation was
performed during this certification.

## A. Root Cause

The repository encoded the dependent FK-index migration before the Account
Control base migration:

1. `20261018171912_caissa_identity_ownership_v1.sql`
2. `20261018180000_caissa_account_control_v1_fk_indexes.sql`
3. `20261018194500_caissa_account_control_v1.sql`
4. `20261018203000_caissa_account_control_v1_security_followup.sql`

A clean PostgreSQL 17.11 laboratory reproduced the failure using that exact
lexicographic order. The first failing statement was:

```sql
create index if not exists caissa_account_control_operations_binding_idx
  on public.caissa_account_control_operations(binding_id);
```

- SQLSTATE: `42P01`
- Missing relation: `public.caissa_account_control_operations`
- Responsible migration: `20261018180000_caissa_account_control_v1_fk_indexes.sql`
- Dependency: the missing table is created by the later
  `20261018194500_caissa_account_control_v1.sql` migration.

The failure was reproduced before the repair. The test did not manually reorder
the files to manufacture a pass.

## B. Repair

The smallest ledger-safe repair is to align the three Account Control source
versions with the versions already recorded by the canonical Staging ledger.
The SQL payloads were not edited: each renamed file has the same Git blob ID and
therefore the same bytes as its predecessor.

| Logical step | Canonical source file | SHA-256 |
|---|---|---|
| Identity Ownership | `20261018171912_caissa_identity_ownership_v1.sql` | `db2d75b54b5c64eb36488beae27e10e2ad2266bd5adf54f3841183757f4acda5` |
| Account Control v1 | `20261018174754_caissa_account_control_v1.sql` | `3d0dfdadc9f89fe12be40a086bc491d4971fca40901a4ee7544bb7965a940950` |
| FK indexes | `20261018174844_caissa_account_control_v1_fk_indexes.sql` | `9d7e4b69e691c57dc2a81408d74fd988055375c7d7424a4305133fc4f87d786c` |
| Security follow-up | `20261018181749_caissa_account_control_v1_security_followup.sql` | `dccd0cebfd56a434337ea960c7ff426001b5e37eee589d8172f4d1a5dc4d402b` |

The final filename order is now the dependency order: Identity Ownership,
Account Control base, FK indexes, security follow-up. Tests and operator
runbooks were updated to reference and assert the canonical order. The local
PostgreSQL contract now includes the real SEC-005 foundation, tooling, and
compatibility prerequisites before Identity Ownership.

The repair preserves the four Account Control tables, both required follow-up
indexes, five Account Control foreign keys, FORCE RLS, write barriers, advisory
locks, restricted grants, safe `search_path` settings, and all Identity
Ownership contracts.

## C. Staging Compatibility

Supabase Staging `aqizagaskicotorfpwfn` was inspected read-only. Its managed
ledger contains:

- `20261018171912` — `caissa_identity_ownership_v1`
- `20261018174754` — `caissa_account_control_v1`
- `20261018174844` — `caissa_account_control_v1_fk_indexes`
- `20261018181749` — `caissa_account_control_v1_security_followup`

Staging originally received the Account Control base payload with SHA-256
`35ba7668c9cccaeff34086ea6c720045f00bf2b6bb998294336eee787e28c54f`;
the FK and security follow-ups match the current repository hashes exactly. The
repository base is a later consolidated fresh-install payload. A second local
PostgreSQL 17 database applied the exact historical base payload followed by the
current FK and security follow-ups, then ran the same Account Control and
concurrency assertions.

Both local fresh and historical laboratories produced the same relevant
catalog signature:

- 4 Account Control tables.
- 4 tables with RLS enabled and forced.
- 2 required follow-up indexes.
- 5 Account Control foreign keys.
- 35 synthetic-fixture write-barrier triggers.
- 31 hardened SECURITY DEFINER functions in the isolated fixture graph.

The remote Staging catalog confirms the same four tables, four FORCE-RLS
tables, two required indexes, and five foreign keys. Its wider real schema has
24 applicable write-barrier triggers and 52 hardened SECURITY DEFINER
functions. The difference reflects the different surrounding table graphs, not
Account Control drift.

The simulated canonical ledger reported zero pending Identity/Account
migrations. Matching the recorded versions prevents Supabase CLI from treating
the already-applied Staging entries as new migrations. No remote migration,
`migration repair`, ledger edit, reset, or seed was run.

Residual rule: any environment whose ledger does not contain these exact
version/name pairs must stop for read-only reconciliation; it must not be
blindly repaired or replayed.

## D. QA

| Check | Result | Evidence |
|---|---|---|
| Original-order PostgreSQL 17 reproduction | PASS | Deterministic `42P01` on the FK index before its table exists |
| Fresh PostgreSQL 17 chain | PASS | `CAISSA_ACCOUNT_CONTROL_POSTGRES_PASS` |
| Fresh-chain concurrency | PASS | `CAISSA_ACCOUNT_CONTROL_CONCURRENCY_PASS`; no deadlock |
| Historical Staging payload chain | PASS | `CAISSA_ACCOUNT_CONTROL_HISTORICAL_LEDGER_PASS`; zero pending canonical migrations |
| Historical-chain concurrency | PASS | `CAISSA_ACCOUNT_CONTROL_CONCURRENCY_PASS`; no deadlock |
| Account Control unit tests | PASS | 19/19 |
| Identity Organization and API-auth regressions | PASS | 49/49 |
| SEC-005 | PASS | 90/90 |
| Public Identity | PASS | 23/23 |
| Account Control browser QA | PASS | 9/9 across Chromium, Firefox, and WebKit |
| Public Identity browser QA | PASS | 12/12 across Chromium, Firefox, and WebKit |
| Account Control lint | PASS | `npm run lint:account-control` |
| Targeted syntax checks | PASS | Updated JavaScript test files parse successfully |
| Supply-chain audit | PASS | Policy passed; `npm audit --audit-level=high` found 0 vulnerabilities |
| Codex Security diff scan | PASS | 0 findings; all six SQL inventory entries reviewed |
| Git whitespace validation | PASS | `git diff --check` |
| Generic application build | SKIP | The repository defines no generic `build` script; no runtime source changed |
| Scanner workflow | NOT APPLICABLE | The changed paths do not match the Scanner workflow path filters |

The first parallel Public Identity browser invocation encountered local port
`8000` already occupied by the Account Control browser suite. It was repeated
once sequentially after the first suite exited and passed 12/12; this was a
test-harness scheduling collision, not an application failure.

The patch does not change CAISSA Online, Lobby Hub, GIF Studio, Endgame Trainer,
Clerk, Vercel, ratings, credits, entitlements, historical games, or public
registration.

## E. GitHub

- Repository: `elcriollito/TVLavin-Chess-Game2`
- Integration stack inspected: PR #79 → #82 → #83 → #84.
- Original PR branches were not modified.
- Isolated branch: `fix/account-control-fresh-chain-order-20261019`.
- Base HEAD: `f2318cebd4c9bc71eb66e7ca4380742bad2db867`.
- Base tree: `3b1755eb86e57b3a8d9395a6e817c7a836a172f9`.
- Hotfix commit: `a00b89a261f15da39702f8bdc4cabf7b5c996f5c`.
- Certification report commit: the commit containing this file; its final HEAD
  and tree are recorded in the release handoff and PR metadata rather than
  embedded self-referentially.
- Pull request: #92, based on the still-open PR #84 branch.
- GitHub workflows contain no hosted migration job. The mutable PGN workflows
  run only on `main` and unrelated path filters; Scanner paths do not match.
- The linked Vercel project creates only a non-Production Preview for this
  non-production branch, with SSO enabled for non-custom domains. No migration
  command is part of the repository deployment configuration.
- Worktrees: all pre-existing worktrees preserved; one new isolated worktree was
  added for this mission. No prune, reset, stash, or worktree deletion occurred.
- Worktree state at report authoring: changes limited to the canonical migration
  renames, targeted tests/runbooks, and this certification report.

## F. Human Release Gate

| Gate | Estado |
|---|---|
| Fresh-chain PostgreSQL 17 | PASS |
| Existing-ledger compatibility | PASS |
| SEC-005 dependencies | PASS |
| Identity Ownership | PASS |
| Account Control schema | PASS |
| FORCE RLS | PASS |
| Concurrent write barriers | PASS |
| Security review | PASS — 0 findings |
| GitHub PR readiness | PASS — PR #92 open, no merge |
| Owner merge approval | PENDING |
| Production PostgreSQL access | BLOCKED — `SQLSTATE 28P01` / Supabase Support pending |
| Production migrations | NOT AUTHORIZED |

Production remains outside this certification. Do not retry database
authentication, reset a password, run Clean Start, reopen public registration,
apply a hosted migration, or merge without a separate owner gate.
