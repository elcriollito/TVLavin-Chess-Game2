# Scanner consent and storage remediation

Status: application code and an additive migration are `REMEDIATED LOCALLY` and `TESTED`; database/configuration are an `INFRASTRUCTURE GATE`. Nothing was applied to Supabase or Storage.

## Corrected invariant

No persistent source image is accepted for private improvement review until the server has authenticated the user and atomically reserved a purpose-bound grant containing the feedback ID, user ID, image hash, byte size, content type, consent version, rights attestation, expiry, and server-derived object key.

The flow is:

1. Ordinary recognition runs without creating a durable anonymous scan.
2. Authenticated correction feedback may persist without an image.
3. If image sharing is selected, the client must also collect the distinct source-rights attestation.
4. `POST /api/scanner/public/image-consent` asks the server to reserve a grant. Configuration is fail-closed unless every TTL/count/byte/project quota is present.
5. The migration serializes reservation with an advisory lock, counts active grants, and provides idempotent duplicate handling.
6. Upload must present the opaque upload ID. Server claim verifies owner/hash/size/type and derives the object key; arbitrary client storage paths are not accepted.
7. Completion records the private storage reference. Feedback v02 accepts the upload ID, rechecks the purpose/version/rights/hash/owner/state, derives the reference, and atomically marks the grant bound.
8. Upload failure marks the grant failed. Unbound/stranded objects are visible to the dry-run lifecycle planner.

## Source ownership and purpose limits

The UI says private review only, explicitly says this is not model training, and requires `I_HAVE_RIGHTS_TO_SHARE_FOR_PRIVATE_REVIEW`. The purpose is exactly `scanner-feedback-improvement-review`; consent version is `caissa-scanner-image-review-consent/1`. These strings are enforced server-side and in SQL.

The separate `scanner_public_training_permissions` table uses purpose `scanner-model-training`. A trigger rejects any attempt to set a certification record training-eligible without an active matching training permission. Season 2 intentionally provides no public issuance path: training remains inactive.

## Migration and privilege boundary

Migration: `supabase/migrations/20261026100419_scanner_public_consent_governance_v02.sql`.

- Adds grant and training-permission tables with RLS enabled and forced.
- Revokes all table/function access from `public`, `anon`, and `authenticated`.
- Grants only the needed table/function access to `service_role`.
- Uses security-definer RPCs with constrained search paths, ownership checks, idempotency, status transitions, quota checks, and exact object-reference construction.
- Does not make the Storage bucket public or expose the service role to clients.

Current Supabase guidance treats grants and RLS as separate layers and warns that the service role bypasses RLS. Therefore all service-route ownership predicates remain mandatory; RLS alone is not claimed as protection.

## Orphan and retention control

`api/_lib/scanner-governance-lifecycle.js` creates a deterministic, bounded plan for untracked objects, expired reservations, and uploaded-but-unbound grants. Execution is disabled unless an exact execute flag, valid idempotency key, explicit adapter, and concurrency no greater than five are supplied. Season 2 ran no execution mode and no live inventory.

No final retention cutoff is embedded. Before activation, counsel/product must approve category-specific criteria, legal-hold behavior, recovery window, backup implications, deletion receipts, and what minimal audit record remains after image deletion. Until then, only dry-run inventory is authorized.

## Required environment configuration

- `CAISSA_SCANNER_IMAGE_GRANT_TTL_SECONDS`
- `CAISSA_SCANNER_IMAGE_USER_MAX_ACTIVE_UPLOADS`
- `CAISSA_SCANNER_IMAGE_USER_MAX_BYTES`
- `CAISSA_SCANNER_IMAGE_PROJECT_MAX_BYTES`

All must be present and within code bounds. Missing/invalid values disable image sharing rather than falling back to an unlimited mode. Values require capacity/privacy approval; this report does not invent them.

## Verification and remaining risk

Node tests cover missing consent/config, valid binding, ownership/purpose/version/hash mismatch, duplicates, failed upload status, separate rights/training semantics, dry-run planning, invalid execution authority, and ephemeral recognition. A focused Chromium test verifies the consent/right UI dependency.

Static/mock tests cannot prove PostgreSQL transaction behavior or Storage consistency. A disposable local Supabase/Postgres rehearsal and SQL privilege/RLS tests are required before migration approval. A successfully uploaded object can still become stranded if later binding fails; the planner finds it, but safe deletion remains a separate approved operation. Quota accounting deliberately includes active/bound evidence until an approved lifecycle process releases it, so the system fails closed rather than growing without bound.

