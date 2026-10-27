# Scanner Privacy Remediation

Status: IMPLEMENTED AND TESTED; MIGRATION NOT APPLIED; READY FOR PROTECTED STAGING APPROVAL.

## Files changed

Five Scanner governance/service modules under `api/`, five governance reports, `scanner/index.html`, `scanner/public/scanner-public-client.js`, `scanner/scanner-app.js`, migration `20261026100419_scanner_public_consent_governance_v02.sql`, four browser/unit contract tests and the PostgreSQL rehearsal fixture. Exact paths are available in the branch diff against `origin/main`.

## Implemented controls

- Recognition and Review/Edit remain ephemeral and do not create a durable scan record.
- A durable scan is created only when the user submits optional feedback.
- Correction sharing and image sharing remain separate choices.
- Image sharing requires a distinct rights attestation before any byte upload.
- The server reserves an upload before bytes are accepted and binds user, feedback, hash, MIME, size, purpose and consent version.
- Quotas, ownership checks, idempotency, claim/complete/fail transitions, forced RLS, explicit grants and retention metadata are included.
- Training permission is a separate privileged action; raw feedback never becomes certified truth automatically.

## Tested

- 23 focused privacy and public-beta tests passed.
- 12 Chromium/WebKit localization and consent UI tests passed.
- 21 recognition-runtime tests passed across Chromium, Firefox and WebKit.
- `npm run verify:scanner`: PASS, including 147 multi-browser Scanner tests and 21 internal beta browser tests.
- The migration and SQL rehearsal were previously applied to a disposable local Supabase/Postgres project, linted, exercised and rolled back. The current run did not reuse an unidentified password-protected local database.
- Protected preview `dpl_B745mdNCYrLefhn5oq2XaW4QhBDa` is `READY`, `public=false`, has no production alias and is bound to exact SHA `846899ea433cacd005ab946dce8396381d5a7a41`. An authenticated GET-only smoke check returned 200 for `/scanner`, `X-Robots-Tag: noindex`, and the separate image-consent and rights-attestation controls. No mutation endpoint was called.

## Historical objects

The 96 historical private image objects remain BLOCKED/QUARANTINED. No object was read into public Git, deleted, reclassified, certified or used for training. Before any action, generate a pseudonymous inventory with consent evidence, provenance, rights, owner, retention basis and disposition. Missing evidence means retain in quarantine or delete only after an approved workflow; it never means training eligible.

## Migration status

`supabase/migrations/20261026100419_scanner_public_consent_governance_v02.sql` is PREPARED, NOT DEPLOYED. Production and remote staging were not changed.

## Remaining risks

- Object upload and database binding are multi-system operations; interrupted flows may leave a reserved or stranded private object. The reconciliation planner identifies these, but deletion requires a separately approved operation.
- Retention durations remain owner/counsel decisions.
- A protected staging rehearsal against the real base schema is mandatory before production approval.

## Rollback

Do not apply the migration until a forward/rollback runbook is approved. Application rollback is a prior SHA redeploy. Database rollback must be an explicit forward corrective migration; never delete evidence ad hoc.
