# CAISSA Scanner field-localization baseline

## Scope and immutable inputs

This report freezes the production `caissa-scanner-board-localizer/4` baseline against 12 human-verified playable-field quads. Seven samples are independently admitted; five remain in two held session/duplicate groups and are diagnostic only. The private images and external annotation truth are not committed.

The exact Chromium production path was used: browser decode and orientation normalization, production working resize, luminance/Sobel analysis, candidate generation and scoring, selection, projective homography, and canonical 512-by-512 output. No localizer constant, classifier, model, or threshold changed.

- Truth SHA-256: `E2D43BC1E343E25074D5BDEFD2B30557F713A933001C0D2FDC0F908C7FFDB0D5`
- Browser diagnostic SHA-256: `19D79FD2AEAE2AF5291E41CF832346D3711158656099EA4A3A6F38AD98BF188C`
- Preserved beta-field-v0.1 SHA-256: `B5104B8445F3DC932A0B9BDE8A69CDCBD31A2259A8154F46C51AEAD43656B267`

## Fixed scoring definitions

The gates were declared before interpreting outcomes:

- **Correct board:** selected quad IoU at least `0.80` and mean corner error divided by the human board diagonal at most `0.05`.
- **Wrong board:** selected quad IoU below `0.50`.
- **Ambiguous / unusable:** a returned quad between those gates, including a correct-board overlap with excessive corner displacement.
- **Abstained:** production v4 returned no board.
- **Human-matching candidate:** a candidate satisfying the same correct-board gate.
- **Overlapping candidate:** candidate IoU at least `0.50`; this separates absent board proposals from inaccurate corner refinement.

Primary normalized corner error is Euclidean source-pixel corner error divided by the mean length of the two human-truth board diagonals. Aggregate mean, median, and maximum pixel errors use all four selected corners for each sample. Polygon IoU is convex predicted/truth intersection divided by union.

## Frozen baseline

| Cohort | Correct | Wrong | Ambiguous / unusable | Abstained | Generation recall | Ranking accuracy |
|---|---:|---:|---:|---:|---:|---:|
| Independent admitted (n=7) | 6 (85.71%) | 0 | 1 (14.29%) | 0 | 85.71% | 100% |
| All diagnostics (n=12) | 8 (66.67%) | 0 | 4 (33.33%) | 0 | 66.67% | 100% |

Independent corner metrics are mean `64.343 px`, median `36.055 px`, maximum `249.366 px`, mean normalized error `0.023760`, median normalized error `0.016159`, mean IoU `0.931756`, and minimum IoU `0.806449`.

All-12 diagnostic metrics are mean `114.535 px`, median `62.554 px`, maximum `351.420 px`, mean normalized error `0.039717`, median normalized error `0.021379`, mean IoU `0.890190`, and minimum IoU `0.753917`.

Production generated 62 reported candidates across the 12 samples: mean `5.17`, range `2-12`. Every strict human-matching candidate ranked first. Selected scores span `0.886752-0.976627`; strict matching-candidate scores have the same range.

## Failure evidence

There are no wrong-board selections and no production abstentions. Four returned quads are unusable under the fixed corner gate:

- `field-hard-v0.1-003` is the sole independent miss: IoU `0.806449`, normalized corner error `0.071105`.
- Held records `007`, `008`, and `011` have IoU `0.769616`, `0.775169`, and `0.753917`, with normalized errors `0.087377`, `0.084838`, and `0.091512`.

All four overlap the human board but no reported candidate satisfies the strict human-match gate. They are therefore `CORNER_ESTIMATION_FAILURE`, not ranking failures. There are no evidenced generation, ranking, ambiguity-policy, or homography failures. Because three misses are held related samples, they do not count as three independent confirmations.

## Candidate and score-component behavior

No human-matching candidate lost production ranking. Geometry-only, grid-only, checker-only, and grid-phase-only ordering each place the same eight strict matches first in their respective samples; there is no score-component signal supporting a weight change.

`field-hard-v0.1-006` is the only cohort sample with multiple accepted candidates. Candidate 1 is the human match (score `0.952949`, IoU `0.957042`); candidate 2 is not (score `0.859883`, IoU `0.474974`). Their margin is `0.093066`, above the production ambiguity margin `0.08`, so current policy correctly selects candidate 1.

## Ambiguity counterfactual

Margins `0.04` and `0.08` reproduce the baseline. Raising the margin to `0.10` or `0.12` abstains only on `field-hard-v0.1-006`, converting a correct selection into an abstention and reducing all-12 correct selection from 66.67% to 58.33%. It prevents no observed wrong selection. No ambiguity-margin change is justified.

## Homography accuracy

For the eight correct selections, human corners transformed by the selected predicted-quad homography have mean canonical corner error `13.475 px`; maximum per-sample canonical corner error reaches `56.714 px`. Mean edge drift is `11.317 px`, with a maximum of `40.245 px`. The boundary-derived implied square size averages `64.786 px`; maximum deviation from the expected 64-pixel square is `5.438 px`. No homography execution failure occurred.

## Exploratory breakdowns

- Chess.com: 2/3 correct; Lichess: 3/6 correct; unknown platform: 3/3 correct.
- Camera: 6/10 correct; gallery: 2/2 correct.
- White-at-bottom: 4/6 correct; black-at-bottom: 4/6 correct.
- No explicit photo-of-monitor metadata exists, so camera samples are not silently relabeled.

These cohorts are small and exploratory, especially after duplicate/session governance.

## Decision

**MORE HUMAN LOCALIZATION DATA REQUIRED**

The evidence does not justify ranking or ambiguity changes: strict matches always rank first, and the only multiple-accepted-candidate case is handled correctly. The repeated diagnostic pattern is corner displacement, but it has only one independent admitted example. The next step is a targeted independent 2D field-corner cohort emphasizing shifted playable-field boundaries, followed by a frozen corner-refinement experiment against this baseline. Production remains unchanged.
