# CAISSA Arena S001 Final Hosted Unblock Report

Status: **CAISSA ARENA S001 — FOUR-PLAYER HUMAN QA READY**
Date: 2026-11-20/21 (America/New_York)
Branch: `feature/caissa-online-arena-s001`  
Application commit: `d029d42c237f42d2f22fe5507a4d652094d2a2b5`
Human QA: **not run; owner plus three real testers pending**

## Decision

The private beta has passed every mandatory automated hosted gate on isolated
nonproduction infrastructure. It is ready for the owner-led four-person Human QA
runbook. This status does not mean Human QA passed.

No Production resource, shared Reader staging data, production credential,
merge, promotion, public release, or Git push was used. No additional Supabase
project or billable resource was created.

## Protected target

- URL: https://caissa-arena-s001-beta-isolated.vercel.app
- Vercel project: `prj_QFSK87RYJEIC7bj4MPqJOKgQlqKA`
- Final deployment: `dpl_G2HbukpY1NC1vNdPPMc96KVdYjyw`
- Supabase project: `imtwlzicxaaqjyvrkdsv` (PostgreSQL 17.12)
- Clerk: AUTH-004D Development instance
  `ins_3LHTajA1YOW9qlf7bM5Xfocx9fL`

The Vercel project has no Git repository link and uses 19 Preview-only
variables. Vercel Authentication remains enabled. The public configuration
resolves only the isolated Supabase hostname and the AUTH-004D origin.

## Database and concurrency

Eight reviewed migrations were applied through the supported hosted migration
API. All 15 public application tables have RLS enabled. Browser roles have no
Arena RPC execution; `service_role` alone executes the server-authoritative
RPCs.

Hosted certification exposed an immediate-rematch race when one board finished
before the other. The additive concurrent-rematch migration makes waiting
players hold for an unseen active opponent. A PostgreSQL 17 regression using
separate transactions passed three rounds with all six unique opponent pairs.
The final hosted tournament also represented all six pairs.

No certification data was deleted. The two pre-fix/diagnostic tournaments remain
as evidence.

## Hosted certification

Final tournament: `09c7ba7d-41ac-4dfe-bc70-ff24714dae53`

- four distinct AUTH-004D sessions;
- exact issuer, subject, `role=authenticated`, authorized party, and origin;
- two simultaneous games with four unique players;
- legal moves, canonical versioning, clocks, and private broadcasts;
- participant Realtime subscriptions accepted and cross-game subscription denied;
- 2/1/0 scoring and non-rematch re-pairing;
- new browser context recovered active membership/game;
- 12/12 games completed and scored;
- six unique unordered opponent pairs;
- four deterministic final ranks and identical completed state.

## Regression and security gates

| Gate | Result |
| --- | --- |
| Online unit/integration | 123/123 pass |
| Online browser | 108/108 pass across Chromium, Firefox, WebKit |
| Public release tests | 28/28 pass |
| Public release audit | pass |
| PostgreSQL 17 concurrent pairing | pass |
| Supply-chain policy | pass |
| npm audit high | 0 vulnerabilities |
| Supabase health advisor | no findings |
| Supabase security advisor | INFO only; intentional default-deny RLS without policies |
| Managed Codex Security | unavailable; not passed |

The managed scanner still returns exactly:

> Review changes requires a non-bare Git worktree with a resolvable HEAD.

No managed scan ID/report exists and no pass is claimed. The independent review
found no validated high- or critical-severity issue and preserved the scanner
failure as a process limitation.

## Handoff

Use `CAISSA_ARENA_S001_HOSTED_BETA_HANDOFF.md` for infrastructure and evidence,
and `CAISSA_ARENA_S001_BETA_RUNBOOK.md` for the four-person procedure. The
time-limited Vercel share URL is delivered privately outside Git.

The owner must record PASS or FAIL after all four real testers finish. Until
then, Human QA remains pending.
