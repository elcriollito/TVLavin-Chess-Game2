# CAISSA Scanner — Phase 3-006 piece-set dataset foundation

Status: **foundation built; NEEDS MORE PIECE-SET DIVERSITY. No classifier training authorized.** Dataset version: `scanner-piece-dataset-v0.1`. The deterministic [quality report](../artifacts/scanner-piece-dataset/quality-v0.1.json) and local-only generator provide an auditable starting point, not a claim of training readiness or product accuracy.

## Purpose and scope

The Phase 3-005B historical model achieved 65.93% 13-class real square accuracy but only 17.09% occupied piece-type accuracy, 5.41% exact black-piece accuracy, and 0/31 exact boards. Its 96.55% synthetic validation was dominated by one shape family and tile-level leakage. This dataset therefore tracks occupancy, color, and type separately while retaining the canonical `empty,P,N,B,R,Q,K,p,n,b,r,q,k` 13-class contract. Platforms are metadata, **not classes**.

The MVP target is **2D**: digital/web/mobile/broadcast boards, screenshots and photographed screens, printed diagrams/books/puzzles, stylized and practical low-contrast 2D. Degraded print, page curvature, unusual sets and stronger perspective need review. Physical/volumetric 3D, heavy occlusion and severe physical-board perspective remain outside MVP. No 3D classifier optimization or training is in this task.

## Rights, provenance, and roles

The versioned [piece-set catalog](../scanner/recognition/datasets/piece-sets/catalog-v1.json) records source, license status, role, platform family, style, color/type availability, and source reference. Its SHA-256 is in the report. `TRAINING-ELIGIBLE` requires positive training rights and available complete assets; `EVALUATION-ONLY` cannot enter train; `REFERENCE-ONLY` cannot enter train or test. Role validation fails closed.

| Inventory entry | Role | Status |
| --- | --- | --- |
| CAISSA procedural geometry v1 | Training-eligible pilot | Project-authored SVG primitives, six types/two colors, one family; internal use, not a generalization claim. |
| Lichess Chessnut | Reference-only acquisition lead | [Lichess COPYING](https://github.com/lichess-org/lila/blob/master/COPYING.md) lists Apache 2.0; exact sprites, hashes, notice obligations and intended use have not been locally certified. |
| Lichess RhosGFX | Reference-only acquisition lead | The same primary notice lists CC0 1.0; exact sprites are not acquired or hashed. |
| Existing CAISSA Wikipedia PNGs | Reference-only | [Repository rights notice](legal/CAISSA_BOARD_RENDERER_THIRD_PARTY_NOTICES.md) says exact author/source/per-file license and attribution still require verification. Existing UI use is not training permission. |
| Recovered Replit geometric silhouette | Reference-only | Historical one-family baseline; archive is unchanged and is not imported into the new dataset. |
| 31 Alexander-verified real boards | Evaluation-only cohort, not 31 known piece families | User-provided internal evaluation permission; source images and truth remain external and unchanged. No training, redistribution, or platform-specific claim. |

Lichess's [official licensing inventory](https://github.com/lichess-org/lila/blob/master/COPYING.md) also includes restricted/non-free piece families; repository visibility or a site screenshot is **not** blanket redistribution/training permission. Before admitting a new family, acquire exact files lawfully, hash them, record author, license text/version, URL, attribution/derivative requirements, local asset path, all 12 sprites, and a reviewed role. Do not scrape platform sprites or copy book figurines without rights review. This is dataset provenance tracking, not legal advice.

## Current dataset and balance

Seed **306** yields **432** project-authored synthetic 128×128 color SVG tiles across **nine** board themes and both light/dark squares: 216 empty and 216 occupied; 108 white and 108 black; 18 examples of each occupied 13-class label. This is a smoke-test pilot, not sufficient training diversity. Unlike the old 32×32 grayscale corpus, SVG keeps higher-resolution color/vector detail for later rasterization choices. RGB/grayscale/dual-branch model experiments remain future decisions.

The same generated manifest contains **1,984 test-only logical square records** from **31** human-verified real boards. It contains source IDs, checksums, source category, orientation, square name, true class, decomposed targets, provenance role, and split—**no real image pixels**. The exact-byte 14 v0.3 aliases are excluded, as is the retained nonstandard no-kings draft. Source files, corner manifests, and truth are checked by SHA-256 and never rewritten. The combined manifest has 2,416 records but **train and test counts must never be pooled into a training balance or accuracy claim**. The report separates them.

Real hard subsets currently identifiable without invented labels: 215 bishop/knight/queen square records, 62 king-color records, 128 low-contrast-tagged records, 576 print-category records, 1,344 digital/photo-category records, and 64 livestream-category records. The manifest tags the ten e1 white-king squares as **candidate exemplars only**; the exact previously reported Chessvision source ID is still unconfirmed. These square counts can overlap and do **not** certify distinct piece-set families. No king-color hard subset may be trained from this test cohort. The procedural pilot includes both kings on light/dark themes and all B/N/Q classes, but these are not a substitute for real varied art.

## Platform and style coverage

Tier 1 priorities are Chess.com, Lichess, ChessBase/Playchess, ICC, PlayOK, FIDE/event, Chessworld, mobile/web games, and broadcast boards. The [machine-readable coverage matrix](../scanner/recognition/datasets/pieces/catalog/platform-coverage-v1.json) marks all nine **missing for certified platform-specific coverage**. The real corpus has digital and livestream categories but no trustworthy platform IDs. Chessnut/RhosGFX are Lichess acquisition leads, not available direct training assets or real Lichess evaluation samples. No platform score or piece-family/style ranking is invented.

Tier 2 is modern/classic books, puzzles, magazines, newspapers, monochrome, hatched and faded diagrams. Tier 3 is independent outline, solid, geometric, minimalist, mobile and book-figurine families. The current nine generated themes are green/white, blue/white, brown/beige, wood, grayscale, hatched print, cream/gray, dark digital and light digital. Theme diversity is **not piece-shape diversity**. Current real pieceSetFamily/style fields are unknown.

## Generation, augmentation, and splits

Run `npm run generate:scanner:piece-dataset -- --seed=306 '--output-dir=C:\Temp\new-unique-dataset-folder'`. A fresh **external** path is required; the generator refuses overwrites and does not place generated tiles in Git. It writes 128×128 SVG RGB tiles, a deterministic tile manifest, and quality report. With the same seed, exact catalog/theme bytes and external truth, the manifest/checksums are reproducible. No timestamp or absolute local path is embedded. Run `npm run test:scanner:dataset` for the dataset validators.

Implemented bounded synthetic variants: clean, low contrast, mild blur, print fade, last-move-style border highlight, coordinates, plus theme hatching/grain. This is an **independent-square** sampler, not an 8×8 starting-position-only renderer. It does not claim JPEG compression, moiré, real glare, mild homography residual, phone-camera blur, browser panels, arrows, book curvature or scanned-page realism yet. Later assets and transforms must preserve piece identity; validate each transform on manually reviewed examples before adding it.

Train uses only the single procedural family. The 31-board real cohort is `test` only. No validation family exists. Source image, whole piece family, board-theme family, augmentation family and platform/session IDs are exclusive across splits; exact-byte duplicates across or within splits fail. All square records from one real source remain together. Near-duplicate generated variants share a family/split; a perceptual near-duplicate detector is still needed before new family admissions. Do not put sprites or derivatives of a held-out family in train, and do not tune rendering/thresholds on the real test cohort. Once enough licensed families exist, allocate independent whole families to train/validation/test and optionally hold out an entire platform style. Only then establish a separately governed final test set.

## Quality and readiness gate

Validation checks catalog rights/role consistency, complete classes and colors, theme definitions, explicit tile targets/provenance, generated SVG dimensions/opaque backgrounds, file hashes, exact duplicates, group leakage, and 31-board truth/source/corner bindings. The [quality report](../artifacts/scanner-piece-dataset/quality-v0.1.json) records manifest/catalog/theme/coverage hashes, class/color/type/role/split/theme/source counts, hard-subset counts, holdout families, platform gaps and warnings.

Decision: **NEEDS MORE PIECE-SET DIVERSITY**. Exactly **one** training-eligible family is locally available, versus the suggested initial diversity goal of **15–25**. There is no credible whole-family validation/test comparison and real piece-art family attribution remains unknown. The two rights leads still need byte-level acquisition review. Do not train a CNN, fine-tune TFJS, integrate recognition, change routing/UI, merge, or deploy. The next task is **PHASE 3-006B — DATASET EXPANSION**, not classifier training. Public Scanner UI changes: **NONE**. **VISUAL-FREEZE exception requires Alexander's explicit approval.**
