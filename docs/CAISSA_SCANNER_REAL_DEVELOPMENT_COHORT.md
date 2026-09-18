# CAISSA Scanner — real 2D development cohort v0.1

Status: **annotation pipeline ready; waiting for Alexander's human verification**. No classifier was trained, no final benchmark was rerun, and no public Scanner UI changed. This cohort is **development-only**, never a headline final test set. The protected 31-board cohort and its truth remain unchanged. A VISUAL-FREEZE exception requires Alexander's explicit approval.

## Source identity and governance

Immutable input: `C:\Users\ALEXANDER\Alexander Projects\caissa_scanner_real_development_cohort_v0_1`. The 41 newly supplied files are JPEGs, all 960×1280 and SHA-256-unique. No unsupported files were present at audit time. The [deterministic manifest](../scanner/recognition/datasets/real-development/real-development-v0.1.json) stores per-file extension, bytes, dimensions, SHA-256, whole-image and centered 64-bit difference/perceptual fingerprints, deterministic `dev-real-v0.1-001`…`041` IDs, development role and permission metadata. The [audit summary](../scanner/recognition/datasets/real-development/audit-v0.1.json) records counts and review candidates. Neither file contains image bytes. Sources remain external and are checked again on tool startup and every save.

The audit compares against 46 distinct source hashes from the prior v0.1/v0.3 localization catalogs, including the 31 human-verified final boards, known aliases, and hard negatives. It verifies protected file bytes against their pinned catalog hashes. There are **zero exact protected duplicates** and **zero exact duplicates within the 41**. Full-frame and center-crop dHash/pHash screens flagged `dev-real-v0.1-021`, `023`, and `024` as possible near-peers. These photos show Lichess-TV boards captured from the same monitor setup; they require human source/session review. Perceptual screening is a candidate detector, not proof that other frames are independent. No platform ID is assigned from visual appearance.

Initial governance: 38 provisionally admitted; three `review-required`; zero excluded. All 41 are user-provided for internal development research (`developmentUseAllowed: true`, `redistributionAllowed: false`). This is not a redistribution license or a platform-specific rights claim. Any protected exact match must be excluded, without deleting the source. A possible near-match is held until Alexander records a distinct-source/position review reason. The tool fails closed on protected IDs, hashes, source-role drift, altered source bytes, or cross-split near-peers.

## Human annotation workflow

From the isolated Scanner worktree, run:

`npm run annotate:scanner:real-development`

Open **http://127.0.0.1:4181/** in a local browser. The tool reads the fixed source folder automatically; it is loopback-only, has no upload endpoint, and uses no Chessvision API, credits, output or labels. The prior protected piece annotator is unchanged.

For each admitted sample:

1. Select the source; mark TL, TR, BR, BL corners of the **playable 8×8 field**, not the outer frame. Draft points autosave.
2. Verify corners as Alexander. This unlocks a 512×512 rectified board with exactly 64 image cells.
3. Choose white-at-bottom or black-at-bottom explicitly. The canonical labels are `a8…h1`; changing orientation preserves visible image-cell identities while remapping square names.
4. Select Empty or a piece label and mark all squares. Every change autosaves; Save draft forces a checkpoint. Reload resumes the last sample and its draft. Review all 64 cells against the image, then explicitly confirm human verification.
5. Optionally assign platform, subtype, capture/source category, source/session group, sample-level empty-subtype tags and notes. Leave uncertain fields `unknown`. Exclude an unsupported image with a reason. For a review-held near-peer, compare sources and provide a distinctness reason before verifying it.

The external truth path is `C:\Users\ALEXANDER\Alexander Projects\caissa_scanner_real_development_cohort_v0_1_annotations\real-development-v0.1.annotations.json`. It is created on first save, outside the source folder and Git. Same-folder atomic writes, file sync, three rotating checkpoints, optimistic revisions, navigation flush, visible save status and recovery protect work. A human-verified record cannot silently revert to draft. Statuses are `unreviewed`, `corners-draft`, `corners-verified`, `pieces-draft`, `human-verified`, and `excluded`; drafts are **not** truth.

## Future ML boundary and split

All splits remain `unassigned` until metadata and near-peer review support a source-/session-grouped plan. Aim for roughly 60–70% train/development and 30–40% validation by whole source image. An exact/near source or session group cannot cross partitions. No sample enters the protected final benchmark. Only human-verified, governed, split-assigned labels can populate the empty, occupied and king-contrast indexes (available locally at `/api/indexes`); the indexes are currently empty. Later 3-007C may use this cohort for hard-negative mining, occupancy/king diagnosis, architecture development, threshold selection and calibration. It must not use it for a final headline metric or retrain against the protected 31-board truth.

`npm run audit:scanner:real-development` re-audits read-only; it prints a deterministic report and changes no source. Rebuilding the committed manifest requires an explicit `node tools/scanner-real-development/build-manifest.mjs --write` plus normal review and tests. New, removed or changed source files cause the annotation server to refuse startup until a reviewed manifest is committed. No classifier training, runtime integration, main-branch merge or production deployment belongs to this phase.
