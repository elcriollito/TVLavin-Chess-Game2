# CAISSA Opening Trainer v1.0 — Session-only storage

Date: 2026-10-21
Branch: `feature/opening-trainer-v1`

## v1 storage contract

Opening Trainer v1 stores user-created opening studies only in the current browser tab's `sessionStorage`. No repertoire requires Clerk or Supabase. If the browser denies `sessionStorage` access or a write exceeds quota, the stores fall back to isolated in-memory maps for the remaining page lifetime.

Two independent stores preserve the product architecture:

- `SavedRepertoireStore` owns validated saved lines, selected variations, training color, and completed-session progress. Its v1 namespace is `caissa.opening-trainer.session.repertoires.v1:{guest|clerk:<subject>}`.
- `AnalysisDraftStore` owns the temporary legal Analysis tree, selected endpoints, current node, orientation, color, and saved/unsaved marker. Its namespace is `caissa.opening-trainer.session.analysis-draft.v1:{guest|clerk:<subject>}`.
- `TrainingSession` continues to receive an immutable repertoire snapshot. It does not mutate the Analysis tree. An active run is intentionally page-memory state; completed progress is recorded in the session repertoire.

`sessionStorage` survives a reload in the same tab and is discarded with that tab's browser session. A separate browser context does not recover the studies. The storage is not encryption or a secret vault: scripts executing on the CAISSA origin can access it, so repertoire data must never contain credentials or other sensitive account data.

## Identity and privacy boundary

Guest, Clerk A, and Clerk B use separate storage keys. An identity transition first captures the outgoing draft, then synchronously resets the visible workspace, cancels Stockfish, WikiBook, Explorer, Games/PGN work and active Quiet Drag, and finally restores only the incoming identity's session data. An unresolved identity owns no storage namespace.

The v1 store does not read or import either retained persistent namespace:

- `caissa.opening-trainer.repertoires.v1`
- `caissa.opening-trainer.repertoires.v2:*`

Existing local data is left untouched. There is no automatic migration into the guest or authenticated session.

WikiBook, ECO, Explorer and the allowlisted PGN Reader proxy continue to receive only the public chess-position/search inputs they require. They do not receive saved repertoire objects, Clerk identifiers, or training progress.

## Cloud implementation retained but inactive

The following v2 work remains tracked and testable but is absent from the v1 browser runtime:

- `js/opening-trainer/repertoire-cloud-sync.js`
- `api/opening-trainer/repertoires.js`
- `supabase/migrations/20261021214528_opening_trainer_repertoires.sql`
- `supabase/rollback/20261021214528_opening_trainer_repertoires.rollback.sql`

`page.js` does not import `RepertoireCloudSync`, so v1 performs no repertoire GET, PUT, or DELETE request. The retained API fails closed with `404 OPENING_TRAINER_CLOUD_DISABLED` before authentication, rate limiting, payload processing, or database construction unless both server-side flags are explicitly set:

```text
CAISSA_OPENING_TRAINER_STORAGE_MODE=cloud-v2
CAISSA_OPENING_TRAINER_CLOUD_V2_ENABLED=true
```

Those flags are not configured by this change and do not by themselves reactivate the browser client.

## v2 reactivation prerequisites

Cloud storage must not be enabled by a variable-only change. A future v2 release requires all of the following:

1. Product and privacy approval for durable account storage, retention, deletion and migration behavior.
2. Review and explicit application of the retained migration to the intended non-production project first; the rollback remains review-only unless separately authorized.
3. Branch-scoped staging Supabase URL, service credential and explicit staging project ref verification, without exposing the credential to the browser.
4. Deliberate client wiring of `RepertoireCloudSync` plus an explicit persistent-store adapter. The v1 session store and old ownerless data must not be silently promoted.
5. Authenticated A/B/Guest isolation, CRUD, retry, deletion and failure-mode QA against disposable staging identities.
6. A distributed abuse-control decision. The retained endpoint's current limiter is process-local serverless state and is not a distributed rate-limit control.
7. Separate approval for Production variables, migration, indexing, merge and publication.

## Database status

No migration or rollback is executed by this v1 change. The Supabase Staging table state and migration ledger remain untouched. No study, training record, synthetic account, or validation row is written to Supabase.
