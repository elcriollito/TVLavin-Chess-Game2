# CAISSA Arena S001 Release Candidate

Decision: **FOUR-PLAYER HUMAN QA READY**
Branch: `feature/caissa-online-arena-s001`  
Baseline: `6df4c2bf4be00fea72f88d63cae726e8515c4380`  
Final candidate: `d029d42c237f42d2f22fe5507a4d652094d2a2b5`
Protected Preview: https://caissa-arena-s001-beta-isolated.vercel.app

Human QA has not run. The decision means the protected beta passed mandatory
automated hosted gates and is ready for the owner plus three real testers.

## Runtime scope

The candidate provides private, unrated, standard-chess Arena for exactly four
authorized beta accounts. Pairing, legal moves, clocks, results, 2/1/0 scoring,
standings, Realtime invalidation, and recovery are server authoritative. Arena
remains disabled in Production regardless of beta flags.

The public artifact manifest now includes the Arena API runtime module; a
regression test verifies that every imported Online/Arena runtime file is
shipped.

## Isolated stack

- Vercel project `prj_QFSK87RYJEIC7bj4MPqJOKgQlqKA`, Preview target, no Git link.
- Supabase project `imtwlzicxaaqjyvrkdsv`, PostgreSQL 17.12, eight reviewed migrations.
- Clerk AUTH-004D Development instance `ins_3LHTajA1YOW9qlf7bM5Xfocx9fL`.
- Vercel Authentication enabled; no production domain or public release.
- No Production/shared staging credential or data used.

## Verification

- Online unit/integration: 123/123.
- Browser: 108/108 across Chromium, Firefox, WebKit.
- Public release tests: 28/28.
- Public release audit: pass.
- PostgreSQL 17 separate-transaction concurrency: pass.
- Hosted four-identity tournament: pass.
- Final hosted tournament: `09c7ba7d-41ac-4dfe-bc70-ff24714dae53`.
- Hosted final state: completed; 4 participants; 12/12 scored games; 6 unique opponent pairs.
- Supply-chain policy: pass; 511 runtime files, 186 locked entries.
- `npm audit --audit-level=high`: 0 vulnerabilities.

The managed security scanner remains unavailable with its exact Git worktree
error preserved. No managed pass is claimed; the independent review found no
validated high or critical issue.

## Deliverables

- `CAISSA_ARENA_S001_HOSTED_BETA_HANDOFF.md`
- `CAISSA_ARENA_S001_BETA_RUNBOOK.md`
- `CAISSA_ARENA_S001_FINAL_UNBLOCK_REPORT.md`
- `CAISSA_ARENA_S001_SECURITY_REVIEW.md`
- `supabase/arena-s001-clean-room/README.md`
- `scripts/arena-hosted-certification.mjs`
- `tests/online/arena-clean-room.test.js`
- `tests/online/arena-release-manifest.test.js`
- `tests/online/arena-rematch-postgres.sql`

## Owner decision

Execute the four-person Human QA checklist using the private time-limited Vercel
share link. Do not merge, promote, make public, or claim Human QA passed until
all four real testers complete it and the owner records PASS.
