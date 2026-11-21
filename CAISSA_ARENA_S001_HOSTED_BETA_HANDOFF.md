# CAISSA Arena S001 Hosted Beta Handoff

Status: automated hosted certification passed; Human QA has not run
Prepared: 2026-11-20/21 (America/New_York)
Branch: `feature/caissa-online-arena-s001`
Application commit: `d029d42c237f42d2f22fe5507a4d652094d2a2b5`

## Protected beta

- Stable protected URL: https://caissa-arena-s001-beta-isolated.vercel.app
- Vercel project: `caissa-arena-s001-beta-isolated`
- Project ID: `prj_QFSK87RYJEIC7bj4MPqJOKgQlqKA`
- Environment: Preview only
- Git integration: none
- Automatic Git deployments: disabled by absence of a repository link
- Deployment protection: Vercel Authentication enabled
- Final deployment ID: `dpl_G2HbukpY1NC1vNdPPMc96KVdYjyw`
- Immutable deployment URL: https://caissa-arena-s001-beta-isolated-otncn6imp-elcriollitos-projects.vercel.app
- Backend: Supabase `CAISSA-ARENA-S001-BETA-ISOLATED` / `imtwlzicxaaqjyvrkdsv`
- Auth: Clerk AUTH-004D Development / `ins_3LHTajA1YOW9qlf7bM5Xfocx9fL`
- Production and shared Reader staging resources: not used

The repository contains no shareable-link secret or automation bypass secret.
The owner should distribute the time-limited Vercel share URL from the final
handoff message privately to only the four testers. The generated link expires
at `2026-11-28T00:21:37Z`.

## Four test identities

Use a different browser profile, private window, or physical device for each
identity. These are AUTH-004D Development users and do not exist in the main
CAISSA or Production Clerk instances.

| Tester | Email identifier | Clerk subject |
| --- | --- | --- |
| A / organizer | `caissa-arena-a+clerk_test@example.com` | `user_3MOMsluQwfjRCC4Y1adevrtqMf2` |
| B | `caissa-arena-b+clerk_test@example.com` | `user_3MOMsuoaxWdHmFpf1eUUvWC5uz2` |
| C | `caissa-arena-c+clerk_test@example.com` | `user_3MOMt6eYmIbL4XQKIB2zxFnDfQu` |
| D | `caissa-arena-d+clerk_test@example.com` | `user_3MOMt5bMNUCL08s83ANtee5cqNr` |

For this Clerk Development instance, enter the documented test email code
`424242`. Do not reuse a browser profile between testers. After opening the
private Vercel share URL, navigate to `/signin`, choose the assigned email,
complete the email-code step, and continue to `/online`.

## Isolation evidence

- Supabase project reports PostgreSQL 17.12.
- The clean project received only the eight reviewed Arena dependency
  migrations listed below.
- All 15 public application tables have RLS enabled and no browser policies.
  This is an intentional default-deny server-authoritative design.
- Arena RPCs and the private pairing function are not executable by `public`,
  `anon`, or `authenticated`; `service_role` alone can execute them.
- The Supabase third-party auth integration resolves only the AUTH-004D
  Development issuer `https://cheerful-mantis-9523.clerk.accounts.dev`.
- Clerk session claims include `role=authenticated`; hosted tokens were
  verified for exact issuer, subject, authorized party, and origin.
- Vercel has 19 Preview-only variables. Five secret values are encrypted. No
  `CLERK_SECRET_KEY`, production credential, shared staging credential, Git
  link, production domain, or public deployment was added.
- Public config reports `rollout=internal`, Arena and creation enabled, rated
  and guest play disabled, and the Realtime hostname
  `imtwlzicxaaqjyvrkdsv.supabase.co`.
- An unauthenticated request receives the Vercel Authentication redirect.

## Migration ledger and reviewed hashes

| Hosted version | Artifact | SHA-256 |
| --- | --- | --- |
| `20261120232644` | beta foundation | `508134e05e7dffb6dd53879441380fd060ea2d1d52f00f321eeab755431a2c8e` |
| `20261120232645` | Online native v1 | `fe1a76a6ef47ce3d537505f3018dead47faf5438ced7c9f6357f056eef702b40` |
| `20261120232646` | Online hardening v3 | `72b811e77f3445075b0c1641791b98889c509367d515d01674d231323afdb914` |
| `20261120232647` | public identity v1 | `df60012ce2f3649e87524326ce5af1b08bb6e877412a0397c047afd38844fd75` |
| `20261120232648` | Arena S001 | `a9db209cb01301d370f632ed593974645fbc2bc69116d0386d8bae65d0075137` |
| `20261120232750` | pairing FK indexes | `695f0fee6ee29a6b428895a792d18f7246fec9dad4c1ecd54374b295e712d1ca` |
| `20261120235626` | opponent-history hardening | `9a0a1cd287b33d5fb1bb0788e5586581e69383f3ea13db968dd42f4879b30eef` |
| `20261121000132` | concurrent rematch hardening | `4e25caf230c0946b7b5f7a560146e14f3fd46092b000f6351700d8aa972cba52` |

No Reader-staging migration guards or fabricated migration history were
replayed. The hosted database preserves all certification rows.

## Automated evidence

| Gate | Result |
| --- | --- |
| Online unit/integration | 123/123 pass |
| Online browser | 108/108 pass across Chromium, Firefox, and WebKit |
| Public release regression | 28/28 pass |
| PostgreSQL 17 concurrent pairing | pass; three rounds, six unique opponent pairs |
| Supply-chain policy | pass; 511 runtime files and 186 locked entries |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Supabase security advisor | INFO only: 15 intentional default-deny RLS tables without policies |
| Supabase health advisor | no findings |
| Hosted four-identity certification | pass; tournament `09c7ba7d-41ac-4dfe-bc70-ff24714dae53` |
| Managed Codex Security diff scan | unavailable; exact launcher error preserved |

The hosted test uses four distinct Clerk sessions, the protected Vercel API,
the dedicated Supabase database, and private Supabase Realtime. It does not use
synthetic database fixtures.

The final hosted tournament reached `completed` at
`2026-11-21T00:16:13.0646Z` with four participants, 12/12 completed and scored
games, and all six unordered opponent pairs represented. The first two rounds
used games `59cc5f93-6404-416a-b6bd-5895eafba696`,
`47f654de-74a2-476b-a6e2-14969ad08b6b`,
`c9d3d777-9e8e-4504-837e-9bac0809594d`, and
`3f128728-495e-4e01-a3f9-158eb22143d7`. Final games played were six per
participant; final points were A 8, B 8, D 4, C 4 with deterministic ranks
1 through 4.

## Security review

The managed scanner did not pass. Its exact error is:

> Review changes requires a non-bare Git worktree with a resolvable HEAD.

No scan ID or managed report exists. The independent review covered auth and
origin validation, beta allowlists, service-role boundaries, RLS/grants,
private Realtime authorization, input validation, rate limiting, idempotency,
concurrency, scoring, recovery, deployment isolation, dependency audit, and
secret-pattern review. No validated high- or critical-severity vulnerability
was found. The scanner failure remains explicitly recorded as a process
limitation, not converted into a pass.

Hosted certification exposed and preserved two useful failure records. The
application pairing race was fixed by the eighth migration and reproduced with
separate PostgreSQL transactions. A later completion timeout was a test-script
bookkeeping issue caused by additional bullet rounds; the script now closes the
active game from the final canonical snapshot.

## Human QA checklist

Human QA is pending. Tester A creates one private, unrated Arena with the four
approved accounts. Record the tournament UUID and PASS/FAIL for each item.

- [ ] Four distinct sessions sign in and see only the protected beta.
- [ ] All four join once; a repeated Join is harmless.
- [ ] The first round contains exactly two games and four unique players.
- [ ] Both boards accept legal moves simultaneously and show server clocks.
- [ ] An illegal move is rejected without board corruption.
- [ ] Private Realtime updates reach participants; no player can observe the
      other board's private topic.
- [ ] Completed games score 2/1/0 exactly once.
- [ ] Re-pairing avoids an immediate rematch while unseen opponents remain.
- [ ] One player refreshes/reopens and recovers membership, position, clock,
      active pairing, and tournament countdown.
- [ ] Navigation among New Game, Games, Lobby, Tournament, and Standings does
      not lose the active board.
- [ ] At the configured end, no new pairing starts.
- [ ] Existing games may finish; status remains `finishing` until scored.
- [ ] All four see `completed` and identical final standings.
- [ ] Mobile layout keeps the board usable and tournament context reachable.
- [ ] Tester A records the owner decision as PASS or FAIL.

Do not report Human QA passed until the owner and the other three real testers
complete this list.

## Stop and rollback

On any authorization leak, double pairing, scoring duplication, identity
mismatch, cross-game Realtime access, or clock divergence:

1. stop creating new tournaments;
2. disable `CAISSA_ONLINE_ARENA_CREATE`, `CAISSA_ONLINE_ARENA`, and
   `CAISSA_ONLINE_TOURNAMENTS` in this isolated Preview only;
3. redeploy the same protected Preview configuration;
4. preserve database, deployment, and log evidence;
5. do not delete rows, reset Supabase, merge, promote, or modify Production.

The beta project and deployment can remain protected for investigation. Data
rollback is intentionally not automatic.
