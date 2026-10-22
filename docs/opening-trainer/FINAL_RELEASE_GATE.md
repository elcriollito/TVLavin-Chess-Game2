# CAISSA Opening Trainer v1.0 — Final Release Gate (pre-authorization)

**Audit date:** 2026-10-22  
**Scope:** Read-only GitHub/Supabase verification, documentation reconciliation, and release planning; **NO MERGE, NO PRODUCTION PUBLICATION, NO DATABASE WRITES**.  
**Repository:** `elcriollito/TVLavin-Chess-Game2` · **PR:** #95 (Draft) · **Branch:** `feature/opening-trainer-v1`  
**Reviewed functional HEAD:** `35d4ca1001e8294b7c41c5529971670462ffe134`  
**Route:** `/opening-trainer` (protected Preview; `noindex,nofollow` remains enabled).

## Human acceptance

| Gate | Owner result | Status |
| --- | --- | --- |
| Analysis + Stockfish, WikiBook, Save & Train, Games/Notation, NEW, footer/mobile | 6/6 PASS | Accepted |
| Paired Analysis notation, nested variations, Black Practice, color restart, mobile | 5/5 PASS | Accepted |
| Session-only Save/reload, independent session, NEW, no repertoire cloud API | 4/4 PASS | Accepted |

These approvals establish functional acceptance of the current v1 experience. They do **not** authorize `main` merge, Vercel Production, migration execution, indexability changes, or changes to account credentials.

## Version 1 runtime boundaries

- User-created repertoires and Analysis drafts reside in identity-isolated **`sessionStorage`**, falling back to page memory; no user-created repertoire or training progress is stored by the v1 application on Supabase.
- Session data is retained across reload in the same tab but is not durable account storage. Browser session restoration and same-origin scripts can affect this storage; it is **not** an encrypted vault.
- In-progress Practice cursor/statistics do not resume exactly after a reload; completed practice progress can remain during the tab session. This is an accepted v1 limitation requiring user-facing clarity.
- v1 has no import or live invocation of `RepertoireCloudSync` and sends zero requests to `/api/opening-trainer/repertoires`; retained v2 API defaults to **404 `OPENING_TRAINER_CLOUD_DISABLED`** unless both explicit server flags are enabled.
- Opening ECO, WikiBook and PGN proxy provider requests continue to operate with public position/search data, not private repertoire objects.
- The saved cloud client, server API, migration and rollback are **preserved but inactive** for possible v2.

## Supabase Staging: factual reconciliation

This section corrects earlier v1 candidate prose that claimed the Staging migration was never applied. That statement was accurate for **the Codex v1 implementation commit** but **not for the separately authorized database gate**.

| Item | Verified state, 2026-10-22 |
| --- | --- |
| Project | `CAISSA-READER-STAGING` / `aqizagaskicotorfpwfn` |
| Database | PostgreSQL 17.6 / ACTIVE_HEALTHY |
| Source DDL in Git | `supabase/migrations/20261021214528_opening_trainer_repertoires.sql` |
| Applied through separate, authorized staging gate | **Yes** |
| Staging migration-ledger entry | `20261022034441_opening_trainer_repertoires` |
| Table | `public.opening_repertoires` exists |
| Rows in new table | **0** |
| RLS | **Enabled**; no browser-facing policies |
| Browser privileges | `anon` and `authenticated` lack direct SELECT |
| Existing `public.users` | **13**, unchanged |
| Production | **No new migration authorized or applied through this work** |
| Rollback | **Not executed**; destructive if used |

The version **difference is real**: source filename `20261021214528` versus the generated Staging migration version `20261022034441`. Do not misrepresent these as equal, manually rewrite the migration ledger to match, or reapply the existing DDL just to erase the discrepancy.

The SQL explicitly grants CRUD to `service_role`; live effective role privileges include broader rights (for example, `TRUNCATE`) due to existing platform ACL behavior. This is not a claim of least-privilege effective CRUD access; `service_role` bypasses RLS, and v2 must separately prove API owner scoping.

**Important:** the preserved v2 migration remains under the active `supabase/migrations/` directory. `supabase db push` operates on pending local migration files against a linked database. Do not run it for v1. Before an authorized v1 merge/release, certify that no migration automation would run, **or** move the deferred-v2 SQL to a non-active, clearly labeled archive/season location, updating references/tests without losing the artifact. This is a release guard, not approval to modify any database.

## Candidate QA and known limitations

The PR reports (for reviewed functional HEAD):

- Opening Trainer unit/integration/navigation **44/44 PASS**.
- Browser Opening Trainer **34 PASS / 2 intentional Stockfish WASM skips**.
- CAISSA Board **26/26 unit PASS**; Board browser **19 PASS / 1 visual skip**.
- PGN Reader browser **33/33 PASS**; PGN unit **146/147**, with known pre-existing Capablanca contract inconsistency.
- GitHub `verify`, associated Vercel checks, and Codex Security diff scan reported PASS/zero reportable findings on the reviewed functional commit.
- `npm audit` was not certified by the prior incomplete registry check; do not convert an inconclusive command to PASS.
- A **new documentation-only commit** must receive its own post-commit GitHub/Vercel status check before it is described as fully checked.

Known non-blocking v1 constraints: no exact in-progress Practice recovery after reload; `sessionStorage` readable by same-origin scripts; external WikiBook/PGN/Explorer dependencies; inactive-v2 process-local limiter is not a distributed platform guard.

## Final no-release gate

**Current designation: `HUMAN_ACCEPTED / RELEASE_PREPARED / MERGE_AND_PRODUCTION_NOT_AUTHORIZED`.**

Before any future release authorization:

1. Resolve or explicitly certify the v2 migration-file deployment guard. Do not assume a GitHub/Vercel push automatically applies migration; check the actual pipeline and disallow any `supabase db push` for the v1 release unless separately authorized.
2. Confirm both v2 feature flags remain **disabled** in target Production and the repertoire API remains fail-closed. Do not add Supabase service credentials for Opening Trainer v1.
3. Validate the exact immutable candidate HEAD, mandatory checks, `sessionStorage` reload/session isolation, no repertoire API traffic, Quiet Drag/mobile geometry, wiki licensing, PGN proxy and partner availability.
4. Record the known PGN Capablanca test issue and the inconclusive `npm audit` evidence accurately, with risk acceptance or a separately scoped fix where required.
5. Obtain the owner's **new, explicit approval** for any merge and Production release. Retaining or removing `noindex,nofollow` is a distinct, explicit publication/SEO decision.
6. Only after authorized deployment: smoke-test `/opening-trainer` on the intended production origin, verify no cloud repertoire data writes, and prepare code/deployment rollback without deleting the empty Staging table.

**Forbidden under this gate:** Merge, Vercel Production promotion, new migration execution, changing migration history, rollback, v2 cloud enablement, creating synthetic/real accounts, editing Production secrets, removing `noindex`, or any production data mutation.

## Evidence and links

- [PR #95](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/95)
- [Human Test guide](./HUMAN_TEST.md)
- [Session-only storage contract](./SESSION_ONLY_STORAGE.md)
- [Staging security gate](../security/OPENING_TRAINER_STAGING_SECURITY_GATE.md)
- [Supabase CLI: db push](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Supabase: Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)

Last verified: 2026-10-22. Read-only findings; no new database changes.
