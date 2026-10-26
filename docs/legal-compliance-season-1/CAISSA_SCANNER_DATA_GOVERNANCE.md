# CAISSA Scanner Data Governance

**Verified:** 2026-10-25  
**Decision:** Scanner recognition can remain a public beta with truthful limitations; community image intake and any new training use require the gates below.

## Lifecycle and authority

| Stage | Current behavior | Governance classification | Required control |
|---|---|---|---|
| Capture | Browser captures/imports a board image | User-controlled local data | Explain what remains local and what is submitted |
| Recognition | Canonical 512×512 RGBA representation is sent for ONNX inference | Raw automated output | No source-image persistence for ordinary scan; label unverified and possibly wrong |
| Review | User checks predicted board/FEN | Human confirmation | Never imply owner certification from user correction alone |
| Feedback | Authenticated user submits prediction/correction metadata | Private raw evidence | Separate purpose, consent, account and rights notice |
| Image upload | Authenticated user can upload JPEG/PNG/WebP to private Storage | High-sensitivity optional evidence | Consent must precede/atomically bind upload; delete orphaned objects |
| Owner review | Authorized owner/admin/reviewer inspects feedback and short-lived signed image URL | Privileged processing | Least privilege, reviewer confidentiality, audit trail |
| Certification | Append-only decision marks reviewed evidence | Owner decision | Record reviewer, version, basis, exclusions and conflicts |
| Dataset export | Operator tool exports eligible governed records | Controlled offline processing | Fail closed on consent/rights/status; protected benchmark separation |
| Future training | No training performed in this season | FUTURE ACTIVATION GATE | Model/data card, approval, reproducible manifest, rights/privacy review |

## Production evidence

### Private beta

- 97 scans, 6,208 prediction records, 92 feedback records, 8 corrections and 20 failures were present.
- 96 private Storage objects were present.
- Historical activity spanned approximately 2026-09-19 through 2026-10-04.
- Existing documentation reports 110 image consents true, one false and 111 correction consents true in a field-corpus snapshot. That artifact does not replace live-table counts or record-level eligibility checks.

### Public beta

- Public scan recognition was live.
- Public feedback, review, certification and public feedback-image records were all zero at the review time.
- The public feedback image bucket was private, with 12 MB and JPEG/PNG/WebP restrictions.

## Controls already present

- Separate correction-consent and image-consent concepts.
- Authentication for feedback, failure reporting and image upload; private-beta experiment authorization.
- Image size, declared type, magic-byte and digest checks.
- User-scoped public object paths and hash binding before an image reference is attached to feedback.
- Private buckets and 60-second reviewer signed URLs.
- Reviewer authorization via owner/admin/entitlement state.
- Raw/unverified status and explicit certification path.
- Piece-set catalog with hashes, licenses, notices and training eligibility.
- No automatic certification or automatic training path found.

## Material gaps

1. **Upload-before-consent:** the upload route accepts authenticated bytes without a consent field. Consent is checked only when a public image reference is attached to feedback. This can leave an orphaned private object and contradict documentation saying no image is uploaded without consent.
2. **Retention is not operational:** provisional guidance says 90 days for unreviewed consented images and 180 days for raw metadata review, but no automated deletion job or complete operator workflow exists.
3. **No account/privacy deletion:** deleting an account or responding to a privacy request is not wired across feedback rows, Storage objects, audit history and downstream datasets/models.
4. **Rights proof is thin for part of the existing real-image corpus:** platform screenshots are labelled “user-provided internal research,” with redistribution false, but ownership/consent/platform-term evidence is not consistently durable.
5. **Revocation semantics are incomplete:** future training cannot promise physical “untraining” from an already released model. The policy must explain prospective exclusion, dataset/version lineage and when retraining is feasible.
6. **Benchmark protection needs governance:** protected validation/test data must not migrate into training through feedback or deduplication.
7. **Security cost control:** anonymous inference relies on an instance-local limiter; a timeout does not cancel the underlying inference.

## Consent and rights design

Correction and image purposes must remain separate:

- **Correction consent:** permits storing board/FEN corrections and related technical evidence for quality review.
- **Image consent:** permits storing the source image for the specifically stated review/training purposes.
- **Rights representation:** contributor confirms they created/own the image or have authority to license it and that it does not contain prohibited third-party or personal material.
- **Optionality:** declining image consent must not block ordinary recognition or correction-only feedback.
- **Withdrawal:** provide a request channel and record the cutoff dataset/model versions affected.

Recommended upload transaction:

1. authenticate and enforce eligible age/account state;
2. receive explicit image-purpose consent and policy version;
3. validate type, size, dimensions, hash and prohibited metadata/content policy;
4. create the feedback record and object in one recoverable workflow;
5. if binding fails, delete the object immediately;
6. queue retention and deletion deadlines;
7. never mark training-eligible before rights, consent, duplicate and human-review gates pass.

## Dataset states

| State | May review | May train | May redistribute |
|---|---:|---:|---:|
| Raw/unverified, no image consent | Metadata only as disclosed | No | No |
| Raw/unverified, image consent | Yes, restricted | No | No |
| Certified, rights/consent complete | Yes | Only after approved dataset release | Only if separate license permits |
| Reference-only asset | Yes | No | License-dependent, normally no |
| Protected validation/test | Yes, restricted | No | No |
| Revoked/expired/deletion queued | Only for minimum audit/legal need | No future runs | No |

## Model provenance finding

Scanner model v0.5 has exact ONNX hashes and a documented synthetic-data foundation plus 41 real-development boards (28 training, 13 validation). Some real boards depict third-party chess-platform screens. Before further training, commercialization or model redistribution, require record-level source/creator, capture date, consent/license, platform-terms analysis, permitted purposes, split assignment, duplicate group and revocation state.

The model is a narrow board-recognition system, not a general-purpose AI model. Under present facts it is not an EU AI Act high-risk or GPAI use. If the EU AI Act applies territorially, maintain provider/deployer role analysis, intended-use limits, technical documentation, incident handling and proportionate AI literacy. Truthful “automatically recognized / unverified” labeling remains prudent everywhere.

## Training release checklist

- Human owner approval documented; no automated promotion.
- Export manifest is immutable, hashed and reproducible.
- Every included record has affirmative purpose-specific consent, rights evidence and a valid retention state.
- Identity and unnecessary metadata are removed.
- Exact train/validation/test split is frozen; duplicates and near-duplicates remain in one split.
- Protected benchmark has no training overlap.
- Third-party asset notices and model license are complete.
- Privacy/takedown/revocation requests are checked immediately before training.
- Model card records data dates, limitations, error modes, evaluation, prohibited uses and release hash.
- No raw community image is bundled with a public model unless a separate redistribution license clearly permits it.

## Immediate owner runbook

1. Inventory all 96 historical objects against beta feedback records and consent evidence.
2. Quarantine unmatched, consent-false, expired or rights-unclear objects; do not train on them.
3. Approve deletion criteria and keep a minimal deletion audit without retaining the deleted image.
4. Respond to requests through `privacy@caissa-chess.org` after identity verification.
5. Preserve security/legal-hold evidence only when documented and time-bounded.
6. Publish no claim that all existing evidence is certified, automatically eligible or permanently anonymous.

