# CAISSA Scanner Internal Beta Feedback System

## Status and boundary

`caissa-scanner-beta-feedback-v0.1` is an internal, mobile-first evidence-collection system. Access to `/scanner/beta` is governed by the server-side [CAISSA Beta Program](./CAISSA_BETA_PROGRAM.md): a verified account, an authorized role/entitlement, and an active Scanner registry record are all required. `CAISSA_SCANNER_BETA_STAGE=internal` remains an additive infrastructure kill switch. It is not the primary authorization mechanism. The route carries `noindex`, and the physically certified public `/scanner/` experience is unchanged.

The persistence, storage, account, and route infrastructure was provisioned on the normal CAISSA production domain on 2026-09-19 for a private authenticated beta. BETA-002A adds a Vercel-compatible `/api/scanner/beta/recognize` handler using the exact frozen-v0.5 weights converted to ONNX and certified against the Windows-local TorchScript reference. Activation remains a deliberate two-gate release: the Scanner experiment registry and `CAISSA_SCANNER_BETA_STAGE=internal` must both be active. This is not a public Scanner launch: no public navigation or sitemap entry was added, and direct-route knowledge cannot bypass server authorization. Alexander's synchronized production account retains `beta_tester`; private authentication identifiers are never committed or documented. Runtime architecture, parity evidence, operations, and rollback are documented in [CAISSA Scanner Production Inference](./CAISSA_SCANNER_PRODUCTION_INFERENCE.md).

The feedback contract also records server-controlled `experimentId=scanner` and `betaStage=internal-beta` client metadata while preserving the corpus version and frozen model identity.

The system does not train, tune, or update a model. Every submitted record begins in `pending-review` quarantine.

## Mobile beta flow

1. Alexander opens `/scanner/beta` from an iPhone on the internal beta server.
2. He explicitly selects **Take Photo** or **Choose Photo**, orientation, optional platform, and consent choices.
3. Existing browser-side decode/localization creates a canonical 512×512 board. The internal inference adapter verifies and runs frozen v0.5.
4. The client immediately creates and freezes an original prediction snapshot, then persists it before edits.
5. Alexander reviews the position. A selected piece or Clear Square can change only the tapped squares.
6. An unchanged board uses **Confirm Correct** (`CONFIRMED_CORRECT`). A changed board uses **Position Correct Now** (`PIECE_CORRECTION`). **Board Detection Wrong** records `LOCALIZATION_FAILURE` and never creates classifier truth.
7. A successful or safely queued submission moves to the read-only internal Workspace with the confirmed board and a new-scan action.

## Frozen recognition contract

- Model: `caissa-piece-classifier-v0.5-occupancy-recovery`
- State SHA-256: `90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E`
- Occupancy threshold: `0.99`
- Class order: `empty P N B R Q K p n b r q k`
- Preprocessing: `RGB64 uint8 / 255`

The production runtime verifies its ONNX artifact checksum and conversion manifest before creating a session. The certification adapter independently verifies both the state checksum and the certified TorchScript checksum. Neither path can silently substitute weights or threshold policy.

## Immutable prediction snapshot

Each successful recognition stores:

- stable `scanId`, timestamp, image SHA-256;
- model version, state checksum, threshold, class order, preprocessing;
- predicted FEN, explicit orientation, and detected playable-field corners;
- exactly 64 square predictions with class confidence, occupancy probability, color probabilities, piece-type probabilities, and king-auxiliary probability.

The browser deep-freezes the snapshot. The server hashes it. Both local storage and Postgres reject a different payload for an existing `scanId`; Postgres also has an immutable-snapshot trigger.

## Feedback and deterministic FEN diff

Canonical feedback types are `CONFIRMED_CORRECT`, `PIECE_CORRECTION`, `LOCALIZATION_FAILURE`, and `SCAN_FAILURE`. FEN comparison uses only the piece-placement field and expands it to exactly 64 allowed classes. Side-to-move, castling, en-passant, and counters never fabricate visual labels.

If decode, localization, or classifier execution cannot produce a prediction snapshot, the beta writes a separate `SCAN_FAILURE` disposition containing the frozen model identity, image hash, failure stage, and consent metadata. It never fabricates a FEN or 64-square classifier truth for a failed scan. These records remain permanently ineligible for training.

For corrections, the server re-derives changed squares from the immutable prediction rather than trusting a handwritten difference. Each correction retains the predicted class, corrected class, and original diagnostic probabilities. Full-board truth requires `finalPositionConfirmed=true`. Localization failures set `localizationValid=false` and are excluded from classifier candidate export.

## Consent and privacy

Consent is explicit and separated:

- `shareCorrectionForImprovement`
- `shareImageForImprovement`

No image is uploaded unless image consent is selected. Correction consent does not imply image consent. Platform is optional and never inferred from appearance. Client metadata is limited to viewport, screen orientation, and a bounded browser description; the beta does not collect contacts, precise location, or arbitrary device identifiers.

## Persistence architecture

The canonical server contract supports two adapters:

- production Supabase/Postgres plus the private `scanner-beta-images` Storage bucket;
- an external-file development adapter at `../caissa_scanner_beta_feedback_v0_1`, outside Git, for local field testing.

The versioned migrations create normalized scan, square-prediction, feedback, square-correction, and quarantined scan-failure tables. All public-schema tables have RLS enabled and forced, and `anon`/`authenticated` receive no table or RPC privileges. Only server-held `service_role` can call the bounded submission RPCs. The production migrations were applied during the authorized private-beta release.

Supabase Storage is provisioned as a private `scanner-beta-images` bucket with a 12,000,000-byte object limit and JPEG, PNG, and WebP allowlist. Storage credentials remain server-side, no public object URL is returned, and feedback receives only an opaque hash-derived storage reference. Image upload occurs only with separate image consent; image-upload failure does not block correction-only feedback.

## Idempotency and offline behavior

`scanId`, `feedbackId`, canonical payload SHA-256, unique constraints, and atomic Postgres RPCs prevent duplicate evidence. Replaying an identical submission returns a duplicate success; reusing an ID for different content is rejected.

If a scan or feedback request fails, its JSON submission enters a local `pending-sync` queue. The queue is not the canonical corpus; it is temporary recovery state. FIFO retry runs when connectivity returns, and stable IDs make retries safe. Image-upload failure does not silently upload later and is disclosed to the tester.

## Governance and offline learning loop

Supported states are `pending-review`, `human-confirmed`, `duplicate`, `held`, `excluded`, `eligible-for-training`, and `consumed-in-dataset`. Submission never auto-promotes a record. The intended loop is:

`feedback → quarantine → human review → explicit dataset admission → offline training → benchmark → versioned release`

There are **NO ONLINE WEIGHT UPDATES**.

## Reporting and export

`npm run report:scanner:beta-feedback` reads the external canonical store and reports scans, exact/corrected/failure counts, correction bands, mean/median corrections, piece-error families, class confusions, platform rates with a small-sample marker, and model breakdown.

`npm run export:scanner:beta-feedback` is dry-run by default. A file is written only with `-- --write=<new-path>`. Export includes only records explicitly governed as `eligible-for-training`, fully confirmed, localization-valid, and consented for both correction and image use. Source images are referenced, never embedded or committed.

## Internal field-test setup

Set these environment variables before starting the local server:

```text
CAISSA_SCANNER_BETA_STAGE=internal
CAISSA_SERVER_HOST=0.0.0.0
CAISSA_SCANNER_BETA_DATA_ROOT=<external feedback directory>
```

Restrict the computer and phone to a trusted local network. No credentials or source images belong in Git. A future public opt-in flow requires a separate privacy, authentication, abuse-control, retention, and deployment review.

### LAN/mobile requirement

The internal server must bind to `0.0.0.0`; the phone must use the host's current LAN IPv4 address rather than `localhost`. The beta crypto adapter uses WebCrypto when available and a deterministic SHA-256 plus RFC 4122 UUID fallback on plain-HTTP LAN origins, where `crypto.subtle` and `crypto.randomUUID` are unavailable. Random bytes still come from `crypto.getRandomValues`; the flow fails closed if browser randomness is unavailable.

### Field-corpus certification

`npm run certify:scanner:beta-field` is read-only by default. It audits identity duplicates, retries, frozen-model metadata, final dispositions, FEN consistency, classifier/localization separation, correction burden, occupancy, piece/king/color errors, confidence, platform/capture groups, structural warnings, and an offline-only auto-accept candidate policy.

Fewer than 30 valid completed scans produce exploratory progress with `CONTINUE MOBILE BETA COLLECTION`; no certification artifacts are written. Once the minimum is met, an explicit new directory may be supplied with `-- --write-dir=<new-path>`. The command then writes exactly:

- `beta-field-v0.1-manifest.json`
- `beta-field-v0.1-report.json`
- `beta-field-v0.1-corrections.json`
- `beta-field-v0.1-platform-report.json`

The snapshot checksum is calculated over canonical records sorted by scan and feedback identity. Output never embeds source images. A written certification directory is immutable; a later collection requires a new corpus version.

## Production counter and field-collection state

The Beta Center reports completed final dispositions, not raw attempts, as `X / 100 completed scans`. It also shows attempted, completed, confirmed-correct, corrected, localization-failure, scan-failure, pending, today, this-week, and all-time values for the signed-in account only. Immutable server receipt times, transaction locks, stable IDs, payload hashes, unique constraints, and distinct-scan aggregation keep retries from incrementing the counter.

Before Alexander's physical iPhone smoke, the canonical production state is zero in every category. The physical smoke must use one real scan under Alexander's normal account and must change the primary display from `0 / 100` to `1 / 100` exactly once. Automated and QA submissions must use a separate account or isolated removable records so they never contaminate that baseline.

Physical certification begins only after the certified production inference endpoint is deployed and both gates are deliberately re-enabled. After Alexander confirms the complete iPhone flow, collection enters **MOBILE BETA DATA COLLECTION PAUSE** with no classifier work or online weight updates. Resume points are 30 completed scans for the minimum useful checkpoint, 50 for a strong interim sample, and 100 for the recommended `PHASE 3-008C` field-corpus certification.
