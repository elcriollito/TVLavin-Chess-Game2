# CAISSA Arena S001 Final Environment Unblock Report

Status: **HOLD**  
Audit date: 2026-11-20 (America/New_York)  
Branch: `feature/caissa-online-arena-s001`  
Baseline / merge base: `6df4c2bf4be00fea72f88d63cae726e8515c4380`  
Corrected application candidate: `86224d33f67ac7343e84a2406caac6c01b264843`  
Protected Preview URL: **not created**

This is the final pre-Human-QA closeout for the autonomous release mission. It
does not claim hosted certification or Human QA. No Production resource,
credential, domain, deployment, database, identity, branch, or alias was changed.

## Outcome

The local release candidate is corrected and fully reverified, but a safe hosted
Arena stack does not exist. Two control-plane facts make a push or deployment
unsafe today:

1. the Reader staging Supabase migration ledger cannot replay into a modern
   data-less Preview branch; and
2. an ordinary Vercel Preview inherits shared project-wide Preview credentials,
   including the main CAISSA Development Clerk application, until exact
   branch-scoped overrides are installed.

The only verified backend path is a new, dedicated Supabase project. The current
quoted cost for the connected organization is **$10/month**. Creating it is a new
billable resource and requires renewed, narrowly scoped owner approval.

## Supabase branch failure and root cause

The previously authorized branch attempt used:

- parent project: `CAISSA-READER-STAGING` / `aqizagaskicotorfpwfn`;
- branch name: `caissa-arena-s001-beta-20261120`;
- temporary project: `dgevqehpqmsptjehvnpr`;
- branch ID: `732b5eae-e6db-49e8-9350-c4f272cbb836`.

Provisioning stopped in `MIGRATIONS_FAILED` at hosted migration
`20261005203002_staging_to_canonical_v2_bridge` after 15 of the Reader staging
ledger's 36 migrations. The exact database error was:

> CAISSA_CANONICAL_V2_BRIDGE_DENIED: migration ledger contract changed

The bridge is a staging-specific, fail-closed catalog and ledger attestation. Its
first assertion requires all six historical columns in
`supabase_migrations.schema_migrations`: `version`, `statements`, `name`,
`created_by`, `idempotency_key`, and `rollback`. A newly provisioned data-less
Preview starts with the current migration-runner ledger contract, so the bridge
rejects it before the CAISSA Online or Arena migrations execute. The bridge also
attests the exact first-15 statement fingerprints and staging catalog hashes; it
is not a portable clean-project bootstrap.

The branch was deleted after failure. A fresh read on 2026-11-20 shows only the
default `main` branch record for `aqizagaskicotorfpwfn`; the temporary project is
absent. No Arena table was created and no shared staging data was changed.

Creating another Preview branch would cost **$0.01344/hour** and would replay the
same immutable 36-row parent ledger into the same incompatibility. It is not an
approved or technically useful retry. The ledger must not be forged, repaired,
or bypassed to make the staging-only bridge accept a different database.

## Local bootstrap architecture evidence

The repository has three distinct schema layers:

1. root `supabase-schema.sql`;
2. root `supabase-schema-v2.sql`;
3. 49 ordered files in `supabase/migrations/` at the corrected candidate.

A migration-directory-only PostgreSQL 17 replay applied the first three files
and then failed at `20260811_atomic_stripe_webhook_fulfillment.sql` because
`public.stripe_events` is created by the v2 baseline. This reproduces why a
generic migration runner cannot treat `supabase/migrations/` as a standalone
zero-bootstrap chain.

A second fresh PostgreSQL 17 cluster used the documented baseline order and a
Supabase-equivalent `postgres` owner plus local Auth/Realtime/Storage scaffolds.
It applied 24 migration files before desktop PostgreSQL reported that the
`pg_cron` extension control file was not installed at
`20260922235507_eae015a_cleanup_schedule.sql`. This is a local platform-package
gap, not a CAISSA guard failure. Supabase provides Cron on hosted projects.

With a test-only Cron schema/function scaffold standing in for that hosted
extension, all 48 remaining repository migrations applied. Final catalog checks
confirmed:

- PostgreSQL 17;
- `public.caissa_online_tournaments` exists;
- `public.caissa_online_arena_pairings` exists with RLS enabled;
- `public.caissa_online_arena_join(text,uuid,text)` exists;
- `authenticated` cannot execute that RPC; and
- `service_role` can execute it.

No guard or migration ledger was disabled or rewritten. The local Cron scaffold
is evidence for the repository DDL after the known hosted extension boundary; it
is not represented as an exact hosted Supabase migration pass. A new dedicated
Supabase project must still receive the baseline and migration sequence through
the supported hosted migration API, followed by security and performance
advisors.

## Clerk isolation

`CAISSA Chess AUTH-004D Staging 2026-10-27` is suitable in principle for the
Arena beta:

- application: `app_3LHTahmv7whkNLWq10qjudrpkHb`;
- Development instance: `ins_3LHTajA1YOW9qlf7bM5Xfocx9fL`;
- key class: Development / `pk_test`;
- current users: 5;
- signup mode: restricted;
- password minimum: 15 characters with compromised-password checks enabled;
- maximum session lifetime: 7 days;
- multi-session: disabled;
- session transfer: disabled;
- mobile/desktop redirect URLs: 0.

It is a separate application and instance from main CAISSA Development
(`app_38rhCJXZbKJZGln3mL8wFm7Iaxr` /
`ins_38rhCHeP4izRR3r2IyIGRkwRkUv`, 30 users) and from Clerk Production. Users and
sessions are therefore not shared with either main instance. The final mission
authorizes AUTH-004D only after backend/deployment isolation; no user or secret
was created or changed while that backend gate remained open.

## Vercel isolation and Git safety

The authoritative project remains:

- team: `team_K1d4QZ7MJIvt49wtRXPbCHQC`;
- project: `prj_SU3FQKbxjztMccLO5TYBSpU6XvDf` /
  `tv-lavin-chess-game2`;
- Git source: `elcriollito/TVLavin-Chess-Game2`;
- Production branch: `main`.

There is no ignored-build command. A historical non-main feature push produced
a Vercel Preview automatically, confirming that pushing the Arena branch is a
deployment-triggering action. The Arena branch currently has zero branch-scoped
variables and zero deployments.

Five variables apply to Preview without Git-branch scoping:

- `BLOB_READ_WRITE_TOKEN`;
- `CLERK_SECRET_KEY`;
- `EAE011_SUPABASE_SERVICE_ROLE_KEY`;
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`;
- `TOGETHER_API_KEY`.

The inherited `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` was compared in memory without
disclosing it: it matches main CAISSA Development and does not match AUTH-004D.
An Arena push today would therefore start a deployment with the wrong identity
boundary and unrelated shared credentials.

Before any push, exact branch-scoped values must override the Clerk and Supabase
keys and deliberately neutralize unrelated shared Preview capabilities for this
branch. Arena flags, exact origin values, and the four AUTH-004D subjects must be
branch-scoped at the same time. Generated Preview URLs remain protected by
Vercel SSO (`all_except_custom_domains`); external testers should receive
time-limited authenticated share access, not a disabled protection rule.

No Git push or Draft PR was created because the Git integration would deploy
before those controls could be proven.

## Security review and corrected defect

The managed diff scanner was retried from a clean, normal, non-detached clone at
`C:\CAISSA-S001-SECURITY`. Preflight validated a resolvable HEAD, worktree, and
supported review range. Launch still returned exactly:

> Review changes requires a non-bare Git worktree with a resolvable HEAD.

No scan ID or managed report exists. This is not a managed-scan pass.

Independent review identified one pre-hosting availability/audit-integrity
defect: distinct no-op join/withdraw event IDs could grow the audit ledger and
bump tournament versions; a nonparticipant could trigger the withdrawal form of
that amplification. Commit `86224d33f67ac7343e84a2406caac6c01b264843`
fixes the migration so:

- a non-withdrawn duplicate join returns canonical sync without an audit row;
- a nonparticipant withdrawal fails `CAISSA_ONLINE_ARENA_NOT_PARTICIPANT`; and
- an already-withdrawn duplicate returns canonical sync without an audit row.

The corrected immutable range is
`6df4c2bf4be00fea72f88d63cae726e8515c4380..86224d33f67ac7343e84a2406caac6c01b264843`.
Its binary diff SHA-256 is
`b2a103b4f9465a716133726adb7da06de6f843265fcf34d267ca7020da1737fb`.
The managed launcher was not repeatedly invoked after the unchanged launcher
failure; the corrected SQL and tests received independent source and execution
review.

Dependency/supply-chain validation passed over 511 runtime files and 186 locked
package entries. `npm audit --audit-level=high` reported zero known
vulnerabilities. Diff secret-pattern review found only intentional
`service_role` grant/test text and no credential material.

## Corrected verification results

| Gate | Result |
| --- | --- |
| `npm run test:online` | 117/117 pass |
| `npm run test:online:browser` | 108/108 pass; 36 each in Chromium, Firefox, WebKit |
| Fresh PostgreSQL 17 Arena lifecycle | pass |
| Final lifecycle state | `completed`, 4 participants, 4 scored games |
| No-op/nonparticipant audit rows | 0 for all three regression event IDs |
| Supply-chain policy | pass |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Managed Codex Security diff scan | blocked; exact launcher error preserved |
| Hosted four-identity certification | not run; no safe hosted target |

## Required next authorization and exact sequence

The only requested approval is:

> Approve one dedicated, nonproduction Supabase project in organization
> `cwfdlweeluywsycspgdx` for CAISSA Arena S001 at the currently quoted
> **$10/month** project cost. Do not create another Reader staging branch and do
> not modify Production or existing staging data.

After that approval, the operator must:

1. re-read price and organization before creation;
2. create the isolated project and record its exact ref;
3. apply the two baselines and all repository migrations in order through the
   supported hosted migration API;
4. run Supabase security/performance advisors and verify Arena grants/RLS;
5. obtain the AUTH-004D Development secret safely and provision four distinct
   restricted test identities;
6. install complete Git-branch-scoped Vercel overrides, including inert
   overrides for unrelated shared Preview capabilities;
7. verify exact origin and authorized-party values before pushing;
8. push the corrected candidate, allow only the protected Preview deployment,
   and open an unmerged Draft PR if all checks remain safe;
9. execute hosted four-identity API/database/Realtime certification; and
10. only then hand the protected URL to the owner and three human testers.

Until those steps are complete, the release status is **CAISSA ARENA S001 — HOLD**.
