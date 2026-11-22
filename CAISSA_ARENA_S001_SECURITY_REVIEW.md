# CAISSA Arena S001 Security Review

Status: **independent review complete; managed scanner unavailable; hosted security gates passed**
Reviewed baseline: `6df4c2bf4be00fea72f88d63cae726e8515c4380`
Final candidate: `d029d42c237f42d2f22fe5507a4d652094d2a2b5`
Binary diff SHA-256: `9aa5467aef380cf5e86ebe3eb0792f44e2828b11f067a08cbdb9c63b33b643d9`
Review date: 2026-11-20/21 (America/New_York)

## Decision

No validated critical or high-severity issue was found in independent source,
dependency, migration, API, browser, or hosted review. The automated hosted
security gates are sufficient to hand the protected beta to four real testers.

The Codex Security managed diff scanner did not run successfully. This review
does not claim or imply a managed-scan pass.

## Managed scanner evidence

The baseline SHA, merge base, candidate HEAD, ordinary worktree, and resolvable
HEAD were verified. The prompt-only managed launcher returned exactly:

> Review changes requires a non-bare Git worktree with a resolvable HEAD.

No scan ID or managed report exists. Retrying the unchanged launcher was not
represented as useful security evidence. The independent review below is the
documented fallback.

## Trust boundaries and controls

| Surface | Hosted evidence |
| --- | --- |
| Deployment isolation | separate Vercel project, no Git link, Preview-only variables, Vercel Authentication |
| Backend isolation | dedicated Supabase `imtwlzicxaaqjyvrkdsv`; no Production/shared staging writes |
| Auth isolation | AUTH-004D Development issuer only; four separate users/sessions |
| Origin validation | hosted JWT `azp` equals the protected origin; configured authorized parties exact |
| Browser authority | moves, clocks, results, scoring, pairing, and standings remain server canonical |
| Database access | 15/15 public tables RLS-enabled; no browser RPC execution; service role only |
| Realtime privacy | participant topics subscribed; cross-game topic rejected |
| Beta access | exact four-subject allowlists; guest/rated play disabled |
| Concurrency | advisory/row locks retained; separate-transaction rematch regression passed |
| Idempotency | event IDs, exact-once scoring, duplicate membership regression |
| Recovery | a fresh browser context recovered the active pairing and tournament |
| Dependency risk | supply-chain policy passed; `npm audit --audit-level=high` found 0 |
| Secret handling | no credential committed; test scan found only intentional role/grant text |
| Production safety | production rollout fails closed; no merge, promotion, domain, or Production credential |

## Supabase review

The clean-room chain contains only the minimal account anchor and the exact
Online, identity, Arena, index, and rematch migrations required by the beta.
Reader-staging guards and unrelated product history were not replayed.

The security advisor reports only `rls_enabled_no_policy` at INFO for the 15
public application tables. This is intentional default deny: the browser does
not read/write those tables directly and the server uses service-role RPCs.
Health has no findings. Performance reports unused new indexes and the default
Auth connection allocation at INFO; neither is a security or beta blocker.

The private pairing function retains the tournament advisory lock and is
executable only by `service_role`. The concurrent-rematch fix waits for unseen
active opponents before allowing a rematch, preventing the hosted
separate-transaction race without granting new authority.

## Hosted attack checks

Four real AUTH-004D Development tokens were checked for distinct subject, exact
issuer, `role=authenticated`, and exact authorized party. Public config exposed
only the intended capabilities and publishable Realtime configuration.

A participant subscribed to each assigned private game topic. A participant
then attempted the other board's private topic and did not reach
`SUBSCRIBED`. All state mutations continued through authenticated API commands
and canonical database transactions.

The final tournament `09c7ba7d-41ac-4dfe-bc70-ff24714dae53` completed with
12 scored games, four participants, six unique opponent pairs, and deterministic
final ranks.

## Findings

| ID | Severity | State |
| --- | --- | --- |
| SEC-S001-01 | process limitation | managed launcher error preserved; no pass claimed |
| SEC-S001-02 | release-blocking isolation gap | closed by dedicated Supabase, Clerk, and Vercel Preview |
| SEC-S001-03 | low availability/audit integrity | remediated by no-op membership hardening |
| SEC-S001-04 | medium correctness/availability | hosted immediate-rematch race remediated and reverified |
| SEC-S001-05 | acceptance gap | owner-led four-human QA still pending |

## Restrictions

Do not publish the time-limited Vercel share secret in Git or public channels.
Do not enable production rollout, reuse production credentials, make the
deployment public, delete beta evidence, merge, or promote. If Human QA finds an
authorization, pairing, scoring, clock, or recovery defect, disable only the
isolated Preview Arena flags and preserve all evidence.
