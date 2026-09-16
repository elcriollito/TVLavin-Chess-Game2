# CAISSA Scanner — real localization corpus v0.3

Status: **CERTIFIED FOR CORNER ANNOTATION, NOT FOR DETECTOR TUNING**
Public Scanner UI changes: **NONE**

## Local evidence and identity

- Staging source: `C:\Users\ALEXANDER\Alexander Projects\caissa_scanner_real_localization_corpus_v0_3_staging`
- Certified byte-preserving copy: `C:\Users\ALEXANDER\Alexander Projects\caissa_scanner_real_localization_corpus_v0_3`
- Corpus ID: `scanner-localization-hard-v0.3`
- Starter schema: `caissa-scanner-localization-starter/3`
- Starter: `manifest-starter-v0.3.json`
- Starter SHA-256: `46700321AFDF531D3D295CC7B31EFC0CFD59DFA68833C505208B0ADC65AD44F1`
- Counts: 33 board-positive originals, 33 paired Chessvision screenshots, 13 visually verified non-chess hard negatives; 46 localization inputs total.
- Original extension: 33 `.jpg`; references: 33 `.png`; negatives: one `.jpg` and 12 `.jpeg`.

Every image decodes, has nonzero bytes, recorded width and height, and an independent SHA-256 in the starter manifest. Filenames are unique within and across roles. No exact-byte duplicate occurs inside v0.3. The source and certified copies matched byte-for-byte after copying. The numbered `sample_001`–`sample_033` original/reference filenames pair unambiguously; there are no unpaired or ambiguous files. References are comparative evidence only, never localization input or corner ground truth.

Four originals, `sample_015_original.jpg` through `sample_018_original.jpg`, contain PNG bytes despite their `.jpg` extensions. They decode correctly and were intentionally copied without transcoding or renaming. The manifest records both filename and detected encoding.

Fourteen positives, `real-v03-positive-020` through `real-v03-positive-033`, are exact-byte copies of the v0.1 real corpus positives, as proven by SHA-256 against the committed v0.1 benchmark manifest. Their `leakageGroup` and `priorCorpusSampleId` fields preserve that relationship. Accordingly, the set contains **19 not-previously-seen-by-that-manifest originals**, not 33 entirely fresh originals. This is an overlap warning, not evidence that those 19 are globally unique. Do not distribute related images across future development/evaluation splits. Visual review identified positives 002 and 003 as consecutive views of the same live Playchess match; keep them in one future leakage group. Positives 005–007 and 013–014 share platform/style families that warrant grouped split review, but are not claimed to be exact duplicates. The visually similar grid-paper negatives 003 and 004 should be grouped for split review; notebook-cover negatives 006 and 009 and fence negatives 010 and 011 warrant human near-duplicate review. Repeated dimensions alone do not prove duplication. None were removed.

## Roles and provenance

`originals/` contains the 33 board-positive recognition/localization inputs. Each is `boardPresent: true`, `annotationStatus: pending`, with no fabricated corners. `references/` contains only corresponding Chessvision result screenshots. Each is independently hashed, has `referenceSystem: Chessvision` and `referenceOutcome: unknown`; screenshots were not used to infer outcome. `hard-negatives/` contains 13 images visually checked to have no chess position: `boardPresent: false`, `annotationStatus: verified-negative`, with no corners required. Two show **checkers** games on 8×8 grids; they are difficult non-chess distractors, not chess-position positives.

Observed negative categories: math-notebook (4), grid-paper (3), checker-pattern (2), checkers-board (2), and generic-rectangular-layout/fences (2). Their normalized category and `grid-like-distractor` tags appear in the manifest. The category is evidence-based, not a claimed source license.

Provenance is `user-provided-internal-evaluation`; `humanVerifiedBy: Alexander` records the provider/board-presence certification, **not** completed corner annotation, Chessvision outcome verification, or permission to republish. No redistribution or publication rights are asserted. Image bytes stay outside Git. Neither staging nor certified image files were modified by the certification tool.

## Prepared classification metadata, not labels

The starter includes optional `pieceSetFamily`, `pieceSetStyle`, `boardThemeFamily`, and `classifierFailureTypes` fields. Piece-set style is `unknown` and failure lists are empty until Alexander provides sample-specific labels. Future supported failure taxonomy includes stylized-piece misread, bishop confusion, queen confusion, knight confusion, black-piece confusion, white/black king-color confusion, and structurally impossible output (for example, two black kings and no white king). These are **piece-classification/output** issues when the playable board was correctly located, not localization failures. No such failure was inferred for a particular v0.3 image from a screenshot.

## Annotation and validation

From the isolated Scanner worktree:

```powershell
npm run annotate:scanner:localization
```

Open the printed loopback address in Chrome or Edge, choose **Open corpus folder**, and select the certified v0.3 folder—not staging. The dev-only tool verifies SHA-256 before displaying each image. **Show incomplete only** displays the 33 pending positives; the 13 verified negatives count as complete without corner clicks. For each positive, click the playable 8×8 field's TL → TR → BR → BL corners, review the overlay, then Confirm. The output is separate: `localization-hard-v0.3.annotated.json`. Preserve that annotated manifest and the immutable starter and image files. If a checksum mismatch or incorrect board-presence label appears, stop and investigate rather than overriding the evidence.

Recheck the certified corpus with:

```powershell
node tools/scanner-localization-corpus-v03.mjs
npm run test:scanner:corpus-v03
npm run test:scanner:annotator
```

The certification script fully decodes, dimensions-checks and hashes every file; validates exact pairing, role separation, status, ID uniqueness, references, counts, duplicates, and deterministic starter serialization; and compares staging/certified bytes. `--create` is only for a nonexistent target and refuses to overwrite an existing certified folder.

## Deferred work

All `split` values remain `null`. Fix grouped development/evaluation splits only after all 33 positives are corner-annotated, near-duplicate/leakage groups are reviewed, and the manifest is certified. No localizer thresholds, scoring, support-boundary rules, model, training tiles, or public UI were changed here. The next localization task is **PHASE 3-004D — SUPPORT BOUNDARY + SAFE ABSTENTION HARDENING**; piece-set errors belong to a later **3-006 classifier** task. Chessvision references must never substitute for original images in a localization benchmark.

**VISUAL-FREEZE exception requires Alexander's explicit approval.**
