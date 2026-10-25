# CAISSA Scanner mobile beta field corpus certification

Status: **CERTIFIED — LOCALIZATION / PRODUCT HARDENING REQUIRED**

Corpus: `caissa-scanner-beta-field-v0.1`

Cutoff: `2026-09-26T22:35:59.429Z`
SHA-256: `B5104B8445F3DC932A0B9BDE8A69CDCBD31A2259A8154F46C51AEAD43656B267`

## Scope and governance

This immutable snapshot is the first real-world CAISSA Scanner mobile beta field-validation corpus. It is not a training dataset, development set, or protected historical benchmark. It contains canonical persisted server records only and no source images or source-image references.

The account scope is the single production account whose canonical activity totals match Alexander's beta milestone. QA identities, fixtures, automated-browser records, temporary audit accounts, anonymous rows, unowned historical rows, and records submitted after the cutoff are excluded. No private account identifier is recorded in the certified artifacts.

No record was automatically marked eligible for training. No model, threshold, runtime, public UI, or visual-freeze contract changed during certification.

## Count reconciliation

The dashboard accounting is canonical and deduplicated:

- 96 canonical persisted scan records + 19 standalone scan failures = 115 logical attempts.
- 111 completed submissions + 4 pending scans = 115 logical attempts.
- 76 confirmed correct + 3 piece corrections + 13 localization failures + 19 scan failures = 111 completed submissions.
- Scan/failure overlap, orphan records, repeated final dispositions, identity duplicates, and payload retries are all zero.

`Scans attempted` currently means persisted board-scan records and therefore excludes failures that occurred before a scan row could be persisted. Recommended dashboard wording: rename it to **Persisted board scans** and add **Total logical attempts**. The existing `111 / 100` completed-submission milestone is correct.

At the cutoff, the dashboard's UTC accounting also reconciles: 27 completions since `2026-09-26T00:00:00.000Z` and 89 since the week boundary `2026-09-21T00:00:00.000Z`.

## Frozen model identity

- Model: `caissa-piece-classifier-v0.5-occupancy-recovery`
- Model-state SHA-256: `90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E`
- Production ONNX SHA-256: `FFF4C633613997C7C29ACD31FB233CF9A2150D173AAB4E38E0BF650644485211`
- Occupancy threshold: `0.99`
- Mixed model versions: none in the certified headline corpus.

## Product metrics

| Metric | All-time beta | Current-runtime era |
| --- | ---: | ---: |
| Logical attempts | 115 | 97 |
| Completed submissions | 111 | 94 |
| Pending | 4 | 3 |
| Confirmed correct | 76 | 68 |
| Corrected | 3 | 3 |
| Localization-failure dispositions | 13 | 11 |
| Standalone scan failures | 19 | 12 |
| Completion rate | 96.52% | 96.91% |
| Scan-failure rate | 17.12% | 12.77% |
| Localization-failure rate, including standalone localization-stage failures | 24.32% | 24.47% |
| Successfully localized, confirmed board rate | 71.17% | 75.53% |
| Exact-board rate among eligible boards | 96.20% | 95.77% |
| Usable with at most two edits | 98.73% | 98.59% |

The current-runtime boundary is the structural-guardrail production deployment `dpl_BTb1RQ4tYtMt3tmB9YwfSTxyM5HN`, source `b5226e0848f874db849d1271baab9d6b484b9508`, created `2026-09-20T03:08:45.822Z`.

Earlier boundaries retained in the artifacts are:

- Capture lifecycle: `dpl_EmdgfXowPQjp1W6RVaXTzTcsXWkT`, source `4cc4b5b830ecaeacc36c8b51e296c3ed4426c146`, `2026-09-19T21:09:39.631Z`.
- Gallery stability: `dpl_3fetoLnDWWoRqmFu1UBELphk8gRF`, source `b0937d2e7e35064fffc51e059acf8fd4cd15138b`, `2026-09-20T02:28:26.827Z`.

The pre-guardrail cohort is small (17 completed) and recorded a 41.18% scan-failure rate and 52.94% combined scan/localization product-failure rate. The current era records 12.77% and 24.47%, respectively. The reduction is meaningful, but the current localization burden remains too high for a runtime-pilot readiness claim.

## Human-confirmed classifier quality

Classifier metrics use only 79 records with `finalPositionConfirmed=true` and `localizationValid=true`. Localization failures, scan failures, and pending scans are excluded.

- Exact boards: 76 / 79 (96.20%).
- At most two corrected squares: 78 / 79 (98.73%).
- Correction histogram: 76 with 0; 2 with 1; 0 with 2; 0 with 3–5; 1 with 6–10; 0 with more than 10.
- Mean / median / P90 / maximum corrections: 0.1013 / 0 / 0 / 6.
- 13-class accuracy: 99.8418% across 5,056 squares.
- Occupancy precision / recall / F1: 100% / 100% / 100%.
- Empty→occupied / occupied→empty: 0 / 0; false occupancy per board: 0.
- Piece-type accuracy: 100%.
- Color accuracy: 99.6172%.
- White exact / Black exact: 99.2352% / 100%.
- Occupied-class macro-F1: 99.3919%.
- Eight wrong squares are color swaps: `B↔b` 2, `R↔r` 4, `Q↔q` 1, `K↔k` 1.
- Wrong-confidence mean / median: 0.8034 / 0.8116; 3 wrong predictions were at least 0.90 and 2 were at least 0.95.
- True/predicted white kings: 79 / 78. True/predicted black kings: 79 / 80. One non-king was predicted as a black king; no empty square was predicted as either king.

Piece-type and color accuracy use all truth-occupied squares, so occupancy misses would count incorrect. White/black exact rates are exact 13-class correctness restricted to truth-white/truth-black occupied squares. The occupied macro-F1 is the unweighted one-vs-rest mean across the twelve occupied classes.

## Structural guardrails

Deterministic replay of the frozen guardrail over the 92 persisted predicted boards produced 80 `NORMAL`, 2 `REVIEW_RECOMMENDED`, and 10 `REVIEW_REQUIRED` results.

- `REVIEW_REQUIRED` precision for a corrected or localization-failure record: 100%.
- Severe-correction/localization cases flagged `REVIEW_REQUIRED`: 71.43%.
- False hard warnings on confirmed-correct boards: 0.
- Post-deployment records with persisted guardrail state: 82; missing: 0; replay mismatches: 0.

The ten hard-warning cases consist of nine localization failures and one corrected board. Standalone scan failures have no predicted FEN and are correctly marked not applicable.

## Platform coverage

| Platform | Attempts | Eligible | Exact | ≤2 edits | Localization failures | Scan failures | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Chess.com | 27 | 24 | 100% | 100% | 3 | 0 | ENOUGH INITIAL DATA |
| Lichess | 55 | 35 | 91.43% | 97.14% | 6 | 11 | ENOUGH INITIAL DATA |
| CAISSA gateway | 4 | 2 | 100% | 100% | 0 | 2 | NEEDS MORE FIELD DATA |
| Unknown/not specified | 29 | 18 | 100% | 100% | 4 | 6 | ENOUGH INITIAL DATA |
| ChessBase / Playchess, ICC, PlayOK, FIDE/event, Chessworld, other | 0 | 0 | n/a | n/a | 0 | 0 | NOT TESTED |

The table is descriptive, not a platform ranking. Unknown metadata is a material coverage limitation, and the CAISSA gateway cohort is exploratory.

## Capture and orientation

| Capture | Attempts | Eligible | Exact | ≤2 edits | Localization failures | Scan failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Camera | 105 | 75 | 96.00% | 98.67% | 11 | 15 |
| Gallery | 10 | 4 | 100% | 100% | 2 | 4 |
| Screenshot | 0 | 0 | n/a | n/a | 0 | 0 |
| Photo-of-screen | 0 | 0 | n/a | n/a | 0 | 0 |

White-at-bottom accounts for 50 attempts and 31 eligible boards; black-at-bottom accounts for 65 and 48. Exact rates are 100% and 93.75%, respectively. Both cohorts are large enough for initial descriptive use, but they are not controlled experiments.

## Consent, uniqueness, and dry-run candidates

- Image consent: 110 true, 1 false across 111 completed submissions.
- Correction consent: 111 true, 0 false.
- Unique images: 113 across 115 logical attempts.
- Duplicate-image groups: 1, containing two records beyond the first; it includes a failed/aborted attempt followed by a retry.
- Classifier duplicate images beyond the first: 1.
- Governed dry-run technical candidates: 78.
- Records still requiring governance review: 78.
- Automatically admitted/exported to training: 0 / 0.

Repeated images remain in product metrics because their record identities and payloads are distinct and no technical retry duplicate was proven. The dry-run candidate preview de-duplicates images and requires human confirmation, valid localization, both consents, and governance review.

## Failure analysis

The 19 standalone failures comprise 14 localization-stage and 5 classifier-stage failures. Explicit error codes are 13 `LOCALIZATION_FAILURE`, 5 `CLASSIFIER_UNAVAILABLE`, and 1 `MULTIPLE-BOARD-CANDIDATES`. Adding the 13 final localization-failure dispositions produces 27 localization/board-detection failures and 5 classifier-unavailable failures.

No evidence supports attributing these records to glare, perspective, unusual piece sets, network/session behavior, or rate limits. Ten compact pseudonymous catastrophic diagnostics are retained because they contain severe structural warnings; none of the human-confirmed localized boards required more than ten corrections.

## Limitations

- This is one account's field corpus, not a representative population sample.
- Chess.com and Lichess dominate named platform coverage; six requested platform families are untested.
- Camera dominates capture mode; screenshot and photo-of-screen are untested.
- Platform and capture selections are user-supplied metadata.
- Product failure stages do not carry classifier truth and are excluded from square accuracy.
- The pre-hotfix cohorts are small and should not be used for causal claims.
- Source images were not inspected or committed, so visual causes are not inferred.

## Decision and next task

**LOCALIZATION / PRODUCT HARDENING REQUIRED.** Classifier evidence is strong and does not justify retraining. Current-runtime scan/localization failure rates remain too high, and product failures occur overwhelmingly before reliable classifier evaluation.

Next recommended task: **PHASE 3-008E — MOBILE LOCALIZATION / CAPTURE HARDENING**. Preserve this corpus unchanged as the v0.1 validation baseline; later records belong to v0.2 or a future snapshot.
