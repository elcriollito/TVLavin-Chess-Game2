# CAISSA Arena S001 Environment Isolation Audit

Status: **HOLD — dedicated backend approval required; Preview branch path is incompatible**
Audit date: 2026-11-20 (America/New_York)
Branch: `feature/caissa-online-arena-s001`
Application candidate: `86224d33f67ac7343e84a2406caac6c01b264843`
Documentation baseline: `37af0bf72843440593521577e428731b0af6c42a`

No Production write, migration, variable change, deployment, user creation,
merge, promotion, or release action was performed during this audit. One
owner-authorized billable Preview branch was created, failed closed during
migration replay, and was deleted; its absence was verified.

## Git identity

- `origin/main` and the merge base are
  `6df4c2bf4be00fea72f88d63cae726e8515c4380`.
- The application candidate is a descendant of that baseline.
- The documentation commit is a descendant of the application candidate.
- The corrected application commit is a descendant of the prior application and
  documentation commits.

## Supabase inventory

| Project | Ref | Observed state | Arena suitability |
| --- | --- | --- | --- |
| `CAISSA-PRODUCTION-DO-NOT-DELETE` | `jczauvkfkweuvdpurpem` | active production project | **prohibited** |
| `CAISSA-READER-STAGING` | `aqizagaskicotorfpwfn` | active shared Reader/Online staging; existing users, profiles, games, events, and test data | **rejected** |
| `caissa-identity-migration-rehearsal-DISPOSABLE` | `vspfqglzqvwxlgjlvyms` | active registration/scanner rehearsal database with four users and persisted scanner, feedback, consent, upload-grant, and beta-program records | **rejected** |

`CAISSA-READER-STAGING` has zero current tournament, participant, and linked-game
rows, but it is not disposable. It has no Supabase development branches. Its
migration history stops before `20261120033413_caissa_online_arena_s001`; the
S001 pairing/event tables and S001 tournament columns are absent. The existing
tournament tables are RLS-enabled, have no browser policies, and grant table
operations only to `service_role`, matching the older server-only Online model.

The Reader staging security advisor also reports existing warnings, including an
anonymous Realtime policy on the older game-broadcast path and disabled leaked
password protection. These findings belong to the shared staging baseline, not
to an applied S001 migration, and are another reason not to repurpose it without
broader review.

The single authorized data-less branch attempt failed at hosted migration
`20261005203002_staging_to_canonical_v2_bridge` after 15/36 parent migrations
with `CAISSA_CANONICAL_V2_BRIDGE_DENIED: migration ledger contract changed`.
That bridge attests the historical six-column ledger and exact staging catalog;
a current fresh branch has a different ledger contract. The failed branch
`732b5eae-e6db-49e8-9350-c4f272cbb836` / temporary project
`dgevqehpqmsptjehvnpr` was deleted, and only the default main branch now exists.

Preview branches currently cost $0.01344/hour, but another would replay the same
failure. A dedicated project is the only verified clean-backend path and is
currently quoted at **$10/month** for organization
`cwfdlweeluywsycspgdx`. It requires renewed owner approval.

## Vercel inventory

- Authoritative team: `team_K1d4QZ7MJIvt49wtRXPbCHQC`
  (`elcriollitos-projects`).
- Authoritative project: `prj_SU3FQKbxjztMccLO5TYBSpU6XvDf`
  (`tv-lavin-chess-game2`).
- The only custom environment is `staging`
  (`env_oKLKZMBHQeSoN727sqADp34bCyhl`), explicitly described as the PGN Reader
  Release Path 2 isolated staging environment. It contains 40 shared variables
  and must not be altered for Arena.
- The Arena feature branch has zero branch-scoped variables and zero deployments.
- Five unscoped variables would be inherited by an ordinary Preview:
  `BLOB_READ_WRITE_TOKEN`, `CLERK_SECRET_KEY`,
  `EAE011_SUPABASE_SERVICE_ROLE_KEY`,
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `TOGETHER_API_KEY`. The inherited
  browser Clerk key matches main CAISSA Development, not AUTH-004D.
- Git is connected to `elcriollito/TVLavin-Chess-Game2`, `main` is Production,
  and no ignored-build command is configured. Historical feature pushes prove
  that pushing this branch would automatically create a Preview.
- The Arena branch has no Vercel deployment record, including the corrected
  application candidate `86224d33f67ac7343e84a2406caac6c01b264843`.
- Password protection is off. Vercel SSO protection is on for
  `all_except_custom_domains`, so a normal generated/branch Preview would be
  protected. No custom domain should be attached to the Arena Preview.
- The attached project domains are production domains or the project production
  alias; none is an Arena beta origin.

A second Vercel custom environment is unnecessary. Once a backend and identity
are authorized, use regular Preview variables restricted to the exact feature
branch. This avoids changing the existing `staging` environment.

## Clerk inventory

| Application | Instance | Users | Observed purpose / decision |
| --- | --- | ---: | --- |
| `CAISSA Chess` (`app_38rhCJXZbKJZGln3mL8wFm7Iaxr`) | Development (`ins_38rhCHeP4izRR3r2IyIGRkwRkUv`) | 30 | currently bound to Vercel PGN Reader staging; shared and not isolated for Arena |
| `CAISSA Chess` | Production (`ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH`) | not inspected | **prohibited** |
| `CAISSA Chess AUTH-004D Staging 2026-10-27` (`app_3LHTahmv7whkNLWq10qjudrpkHb`) | Development (`ins_3LHTajA1YOW9qlf7bM5Xfocx9fL`) | 5 | separate nonproduction identity; authorized by the final mission only after backend/deployment isolation |

The existing Vercel custom `staging` environment was matched to the main
`CAISSA Chess` Development instance without disclosing keys. Neither Development
instance has mobile/desktop redirect URLs configured. Clerk recommends a
separate application when staging must have independent users; Development keys
are appropriate for generated `*.vercel.app` Preview origins. Production keys
must not be used.

An exact web-origin allowlist cannot be certified until a protected Preview URL
exists. For the final configuration, `CAISSA_BROWSER_ORIGINS` and
`CAISSA_CLERK_AUTHORIZED_PARTIES` must contain the exact protected Preview origin,
and the Clerk publishable/secret key pair must be proven to belong to the selected
Development instance.

## Isolation decision

The safe target is:

1. an owner-approved dedicated Supabase beta project with its own API
   credentials; another Reader staging Preview branch is rejected;
2. branch-scoped Vercel Preview variables on
   `feature/caissa-online-arena-s001`, leaving custom `staging` untouched;
3. an owner-selected Clerk Development application with four dedicated test
   identities and no Production keys;
4. the default Vercel Preview domain behind SSO/deployment protection, with exact
   origin and authorized-party values; and
5. the S001 migration applied only after all identifiers have been recorded and
   cross-checked.

Rejected alternatives:

- applying S001 to `CAISSA-READER-STAGING`;
- repurposing the identity/scanner rehearsal database;
- inheriting shared Preview variables without branch scoping;
- using Clerk Production or the main application Development identity merely
  because it is already connected; or
- disabling Vercel protection to accommodate testers.

## Owner authorization required

To resume Phase 3, the owner must approve exactly one dedicated Supabase project.
AUTH-004D is already the authorized Development identity once isolation is
complete. A sufficient decision is:

> Approve one dedicated nonproduction Supabase project for CAISSA Arena S001 in
> organization `cwfdlweeluywsycspgdx` at the currently quoted $10/month project
> cost. Use AUTH-004D only after branch-scoped Vercel isolation is installed. Do
> not use Reader staging, scanner rehearsal, or Production.

After approval, the operator must re-read cost and target identifiers before
creation because pricing and project state can change.
