# CAISSA Opening Trainer — Staging Security Gate

Date: 2026-10-21
Branch: `feature/opening-trainer-v1`
Scope: session-only v1 Preview and preservation of review-only v2 artifacts. Production is out of scope.

## Gate decision

Opening Trainer v1 no longer depends on Supabase. User-created analysis, saved repertoires, selected variations, training color and completed-session progress stay in identity-scoped browser `sessionStorage`, with in-memory fallback. The browser runtime makes no request to `/api/opening-trainer/repertoires`.

The retained cloud endpoint is feature-disabled by default and returns `404 OPENING_TRAINER_CLOUD_DISABLED` before authentication or database construction. The migration and rollback remain available for a possible v2, but neither is applied or executed by this release.

## Verified environment boundary

- Supabase Staging expected project: `CAISSA-READER-STAGING`, ref `aqizagaskicotorfpwfn`.
- Production denylisted ref: `jczauvkfkweuvdpurpem`.
- The last read-only inspection found no Preview variables applicable to `feature/opening-trainer-v1`, including no opening-trainer staging-ref variable. No environment value was decrypted, pulled, printed, copied, regenerated or edited.
- Consequently, there is no service credential configured for this branch whose binding can be positively certified. This remains a safe negative result because v1 neither initializes cloud sync nor reaches Supabase.
- No migration, rollback, cleanup, row mutation or account creation is part of this gate.

## Session identity boundary

- Guest and each validated Clerk subject have independent repertoire and Analysis-draft session keys. Email-shaped or otherwise invalid user identifiers are rejected.
- The v1 runtime does not read or import retained localStorage v1/v2 repertoire namespaces and does not delete them.
- An identity switch captures the outgoing session draft, advances the workspace generation, terminates Stockfish, aborts WikiBook and Games/PGN work, cancels Explorer and active Quiet Drag, clears Practice, and restores only the incoming identity's legal session draft and saved repertoires.
- A new browser session receives no previous studies. Reloading the same tab restores that tab's current identity data.
- External WikiBook, ECO, Explorer and PGN integrations do not receive saved repertoire contents or training progress.

## Retained v2 controls

- `repertoire-cloud-sync.js`, the server API, sanitizer, Clerk-to-internal-user mapping, ownership scoping, database boundary check, migration and rollback remain tracked.
- API activation requires both `CAISSA_OPENING_TRAINER_STORAGE_MODE=cloud-v2` and `CAISSA_OPENING_TRAINER_CLOUD_V2_ENABLED=true`; neither flag is modified here.
- Preview database access would still require the exact staging ref, matching Supabase URL host and a server-only service credential. Non-production rejects the production ref.
- The retained endpoint uses a process-local serverless limiter. It is documented only as a bounded single-process safeguard and is not certified or represented as a distributed control.
- Full v2 prerequisites are documented in `docs/opening-trainer/SESSION_ONLY_STORAGE.md`.

## Migration status

The proposed migration is additive and review-only. It creates `public.opening_repertoires`, enables RLS, revokes browser roles, and grants bounded operations only to `service_role`. Staging keeps its original state; the migration ledger and table set are untouched. The rollback is destructive by definition and was not run.

## Current status

`V1 SESSION-ONLY ISOLATION READY — HUMAN TEST REQUIRED`
