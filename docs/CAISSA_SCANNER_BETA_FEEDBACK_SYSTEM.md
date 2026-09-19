# CAISSA Scanner Internal Beta Feedback System

## Status and boundary

`caissa-scanner-beta-feedback-v0.1` is an internal, mobile-first evidence-collection system. It is available only at `/scanner/beta` when `CAISSA_SCANNER_BETA_STAGE=internal`. It is absent from public navigation, carries `noindex`, and returns 404 while the gate is closed. The physically certified public `/scanner/` experience is unchanged.

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

The local inference adapter verifies both the state checksum and the certified TorchScript checksum before every process start. It cannot silently substitute weights or threshold policy.

## Immutable prediction snapshot

Each successful recognition stores:

- stable `scanId`, timestamp, image SHA-256;
- model version, state checksum, threshold, class order, preprocessing;
- predicted FEN, explicit orientation, and detected playable-field corners;
- exactly 64 square predictions with class confidence, occupancy probability, color probabilities, piece-type probabilities, and king-auxiliary probability.

The browser deep-freezes the snapshot. The server hashes it. Both local storage and Postgres reject a different payload for an existing `scanId`; Postgres also has an immutable-snapshot trigger.

## Feedback and deterministic FEN diff

Canonical feedback types are `CONFIRMED_CORRECT`, `PIECE_CORRECTION`, `LOCALIZATION_FAILURE`, and `SCAN_FAILURE`. FEN comparison uses only the piece-placement field and expands it to exactly 64 allowed classes. Side-to-move, castling, en-passant, and counters never fabricate visual labels.

For corrections, the server re-derives changed squares from the immutable prediction rather than trusting a handwritten difference. Each correction retains the predicted class, corrected class, and original diagnostic probabilities. Full-board truth requires `finalPositionConfirmed=true`. Localization failures set `localizationValid=false` and are excluded from classifier candidate export.

## Consent and privacy

Consent is explicit and separated:

- `shareCorrectionForImprovement`
- `shareImageForImprovement`

No image is uploaded unless image consent is selected. Correction consent does not imply image consent. Platform is optional and never inferred from appearance. Client metadata is limited to viewport, screen orientation, and a bounded browser description; the beta does not collect contacts, precise location, or arbitrary device identifiers.

## Persistence architecture

The canonical server contract supports two adapters:

- Supabase/Postgres plus a private `scanner-beta-images` Storage bucket for a future controlled internal environment;
- an external-file development adapter at `../caissa_scanner_beta_feedback_v0_1`, outside Git, for local field testing.

The versioned migration creates normalized scan, square-prediction, feedback, and square-correction tables. All public-schema tables have RLS enabled and forced, and `anon`/`authenticated` receive no table or RPC privileges. Only server-held `service_role` can call the two bounded submission RPCs. The migration is not applied by this task.

Supabase Storage must be provisioned separately through the Storage API or dashboard as a private `scanner-beta-images` bucket. Storage credentials remain server-side. The local adapter stores image bytes by hash and exposes only an opaque storage reference in feedback records.

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
CAISSA_SCANNER_BETA_PYTHON=<absolute path to the v0.5 Python environment>
CAISSA_SCANNER_BETA_MODEL_DIR=<absolute path to phase3-007e-v0.5-final1>
CAISSA_SCANNER_BETA_DATA_ROOT=<external feedback directory>
```

Restrict the computer and phone to a trusted local network. No credentials or source images belong in Git. A future public opt-in flow requires a separate privacy, authentication, abuse-control, retention, and deployment review.
