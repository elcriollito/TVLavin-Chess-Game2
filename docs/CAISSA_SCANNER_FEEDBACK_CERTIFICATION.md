# CAISSA Scanner public feedback certification

## Non-negotiable trust rule

Public feedback is evidence, not truth. Every public submission is created with:

```text
corpusVersion = caissa-scanner-public-feedback-v0.1
sourceTrust = public_user
certificationStatus = raw-unverified
```

Nothing in this system performs automatic learning, automatic training admission, online weight updates, silent FEN repair, or public self-certification.

The lifecycle is deliberately separated:

`raw-unverified -> owner-certified -> eligible-for-training -> consumed-in-dataset`

`community-confirmed` is reserved as a possible future trust state. It is not implemented and would not replace owner certification.

## Immutable entities

`scanner_public_scans` holds the frozen v0.5 prediction snapshot and localizer metadata. `scanner_public_feedback_raw` holds the original user payload and consent state. Both tables are forced-RLS, service-role only, and protected by update/delete rejection triggers.

`scanner_feedback_certifications` is a separate append-only decision history. A later decision adds a row; it never edits a raw submission or erases an earlier decision. Each record includes the reviewer, timestamp, certification version, notes, target corpus, training-eligibility flag, reason codes, and duplicate reference where applicable.

The private storage bucket is `scanner-public-feedback-images`. There are no anon or authenticated grants on the evidence tables and no public storage policy. Browser access is mediated by the server.

## Reviewer authorization

The console route is `/scanner/feedback-review`. It is absent from public navigation and its HTML is stored outside the static tree. The page handler and every data/action endpoint independently authorize the request.

Allowed reviewers are:

- role `owner`;
- role `admin`; or
- entitlement `scanner_feedback_reviewer`.

An ordinary member and a user with only `beta_tester` are denied. The entitlement is read from the trusted database record, not Clerk `user_metadata` or a client assertion.

## Review evidence and actions

The console presents, when consent permits, the source image, predicted and corrected FEN, square differences, original confidence, occupancy probability, piece-type and color probabilities, structural warnings, localization diagnostics, model/localizer versions, platform, capture type, submission date, duplicate signal, and both consent values.

Available actions are explicit and one-case-at-a-time:

- `CERTIFY`
- `CERTIFY_CLASSIFIER_CORRECTION`
- `CERTIFY_LOCALIZATION_FAILURE`
- `NEEDS_FIX`
- `DUPLICATE`
- `HOLD`
- `EXCLUDE`

There is no broad bulk-certification action. `DUPLICATE` requires the canonical feedback UUID. Priority is derived only to order review: high for localization/scan failures, structural hard warnings, high-confidence model corrections, or large corrections; medium for other corrections; low for confirmations and near-duplicate evidence. Priority never certifies correctness.

## Corpus routing

Classifier routing requires all of:

- action `CERTIFY_CLASSIFIER_CORRECTION`;
- feedback type `PIECE_CORRECTION`;
- valid localization;
- target `caissa-scanner-certified-classifier-corrections`.

Localization routing requires all of:

- action `CERTIFY_LOCALIZATION_FAILURE`;
- feedback type `LOCALIZATION_FAILURE` or `SCAN_FAILURE`;
- invalid localization;
- target `caissa-scanner-certified-localization-failures`.

This prevents a bad crop from entering piece-classifier data.

## Training eligibility and governed export

Owner certification and training eligibility are distinct. The reviewer must explicitly enable training eligibility, and both application and database layers require consented correction, consented image, a private image reference, nonduplicate evidence, the correct target corpus, and a certifying action.

The exporter is dry-run by default:

```text
npm run export:scanner:public-feedback -- --input owner-review-export.json
```

Writing requires both `--write` and a new `--output` path. The output uses exclusive creation and will not overwrite an existing artifact:

```text
npm run export:scanner:public-feedback -- --input owner-review-export.json --write --output governed-export.json
```

The exporter re-evaluates every governance condition. A row failing any condition is rejected. Export does not train a model, copy an image, change a database status, or mark evidence consumed. Dataset consumption requires a future, separately reviewed append-only manifest step.

## Security review

- Authentication: Clerk tokens or the protected browser session cookie are verified server-side.
- Authorization: trusted database role/entitlement checks run at the page and endpoint layers.
- CSRF: mutation endpoints reject cross-origin requests.
- XSS: review UI inserts evidence using `textContent`; it does not render evidence as HTML.
- Payload limits: public JSON, canonical image, raw source, action notes, arrays, enums, hashes, and identifiers are bounded and validated. Every public evidence mutation is rate-limited; image uploads are signature-checked and their content hash must match the originating scan before feedback can reference them.
- RLS/grants: all feedback tables use forced RLS, explicit revoke, and service-role-only grants.
- Service role: server-only through the existing Supabase adapter.
- Images: private bucket, consent-gated upload, ownership-bound key, and 60-second signed review URL.
- Immutability: database triggers reject raw/history update and delete operations.
- Duplicates: deterministic evidence fingerprints flag candidates; an owner records the final duplicate relationship.
- Audit history: certifications append; they never replace raw evidence or prior decisions.

The migration remains unapplied until the separate public release gate authorizes infrastructure changes.
