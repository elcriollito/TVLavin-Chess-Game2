# CAISSA Scanner Data Governance

**Verified:** 2026-10-26
**Production contract preserved:** classifier `caissa-piece-classifier-v0.5-occupancy-recovery`, threshold 0.99, localizer v4, chess-aware orientation, mandatory Review/Edit, structural guardrails, raw-unverified public feedback.
**Decision:** no training, model change or production change was performed.

## Purpose-separated lifecycle

| Stage | Current behavior | Governance state | Release control |
|---|---|---|---|
| Capture/import | Browser receives camera/gallery image | User-controlled local input | Explain local vs transmitted processing |
| Recognition | Canonical pixels sent to hosted ONNX inference | Automated, potentially wrong result | No source-image persistence for ordinary recognition; Review/Edit required |
| Scan snapshot | FEN/prediction/metadata may be recorded | Raw operational evidence | Bound size, purpose, identity/guest retention and abuse quota |
| Feedback/correction | Authenticated contribution | Raw-unverified | Specific correction consent; no automatic truth/training |
| Optional image | Authenticated private upload | Sensitive review evidence | Consent and rights must precede and bind atomically |
| Owner review | Restricted console and signed image access | Privileged processing | Least privilege, purpose limits, audit trail |
| Certification | Human decision history | Reviewed evidence, not automatic truth | Record reviewer, basis, version and exclusions |
| Dataset export | Offline controlled artifact | New purpose/action | Fail closed on consent, rights, retention and split status |
| Training | Not authorized | FUTURE ACTIVATION GATE | New human approval, model/data cards and reproducible manifest |
| Deployment | Frozen model currently deployed | Separate release | Evaluation, rollback, version/hash and policy review |

## Production evidence

Public Scanner was live, while the public feedback and image tables/bucket were empty at inspection time. Historical private beta held 97 scans, 6,208 square predictions, 92 feedback rows, 8 corrections, 20 failures and 96 private image objects. Both image buckets were private with a 12 MB JPEG/PNG/WebP restriction.

Controls already present include authenticated feedback/image endpoints, type/magic/size/hash checks, user-scoped paths, short reviewer signed URLs, role/entitlement review authorization, raw-unverified labeling, append-oriented certification and piece-set license metadata. No automatic certification or training path was found.

## Findings

### SCAN-001 - Consent and upload are not atomic

Current `main` accepts an authenticated image before a consent record is attached to feedback. A failed or abandoned second step can leave an orphan object. Privacy Season 2 introduces an upload grant, consent version, rights attestation, quotas and lifecycle RPCs, but its migration is unapplied and code unmerged. Do not claim those controls are live.

### SCAN-002 - Training rights and lineage remain gated

Some historical real-world material is recorded as internal research or platform screenshots without uniformly durable creator, platform-term and redistribution evidence. Raw feedback is not training permission. Before any new training, reconcile every record's source, rights, consent, purpose, split, duplicate group, revocation and retention state.

### SCAN-003 - Retention/deletion is not operational

No automated retention job or end-to-end user deletion workflow was verified. The operator must approve criteria for raw metadata, consented images, rejected/expired evidence, audit history and legal holds. Model "untraining" cannot be promised; explain prospective exclusion and lineage instead.

### SEC-003..005 - Resource governance

Anonymous inference uses a process-local limiter; timeout does not cancel/hold capacity for underlying inference. Anonymous scan JSON can persist without durable row/byte quota. Image storage lacks a durable per-user/project quota and atomic binding on current `main`. See the security review.

## Consent and rights contract

1. Ordinary recognition is separate from feedback, image storage and training.
2. Correction consent permits storing board/FEN correction evidence for stated quality review.
3. Image consent permits private storage only for the stated review purpose and duration.
4. A rights attestation must confirm authority to share; it does not guarantee ownership.
5. Declining image sharing must not block ordinary recognition or correction-only feedback.
6. Withdrawal affects future eligible exports/runs; already released models require versioned remediation analysis.

## Dataset states

| State | Review | Train | Redistribute |
|---|---:|---:|---:|
| Raw, no image consent | Metadata only as disclosed | No | No |
| Raw, image consent | Restricted private review | No | No |
| Human-certified, rights/consent complete | Yes | Only after approved release | Only with separate license |
| Reference-only | Yes | No | License-dependent |
| Protected validation/test | Restricted | No | No |
| Revoked/expired/deletion queued | Minimum audit/legal need only | No future run | No |

## Training release checklist

- Human owner approval; immutable hashed export manifest.
- Record-level purpose consent, rights evidence and valid retention state.
- Identity/unnecessary metadata removed; protected benchmark excluded.
- Duplicate/near-duplicate groups confined to one split.
- Exact dataset/model versions, code/environment, metrics, limitations and rollback.
- Privacy/deletion/revocation queue checked immediately before training.
- No community image redistributed with a model absent a separate license.

## Immediate runbook

Inventory the 96 historical objects against feedback, consent and rights evidence; quarantine unmatched or unclear objects; approve deletion criteria; keep only a minimal deletion audit; answer verified requests through `privacy@caissa-chess.org`; do not call raw evidence certified or eligible.

