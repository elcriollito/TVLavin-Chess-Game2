# CAISSA Scanner real-development certification v0.2

Status: certified development-only input for offline 2D recognition experiments. It is not a final benchmark and is not authorized for runtime use.

## Human-truth audit

The source cohort contains 41 boards and the annotation file contains 41 records. All 41 records are human-verified; none is pending or malformed. Every record has four in-bounds, nondegenerate playable-board corners in TL/TR/BR/BL order, explicit orientation, and exactly 64 labels from `empty,P,N,B,R,Q,K,p,n,b,r,q,k`. There are no duplicate sample IDs, missing source hashes, or invalid labels.

The canonical human-truth SHA-256 is `D73983A07A5B92F0747D637CFC2E9AC4027BF1095A095D4C88D158F7B13D14E9`. The source v0.1 manifest SHA-256 is `E3F62C6363E880B38C410295F792C01E0CC1E44FDC26D90423E20EC92A24E8FA`; the raw annotation file SHA-256 is `246147E34C74098A6948FF7F438AA873FEF07426B7A05ABFD35372E302EF9C0D`. The original images and annotation file remain unchanged and outside Git.

## Near-duplicate and leakage governance

`dev-real-v0.1-021`, `-023`, and `-024` are all **ADMIT DEVELOPMENT**. Each has a unique source hash and distinct chess position. Visual/source-context review identified them as separate Lichess-TV monitor photographs from one capture session, so all three are locked to `capture-session-2026-09-17/lichess` and cannot cross a split.

Exact IDs, exact hashes, known aliases, screened source relationships, and visual context were checked against the protected 31-board benchmark and existing localization material. No admitted development record matches or aliases a protected source. Protected benchmark leakage admitted: **zero**.

## Certified role and split

The role/version certification is `caissa-scanner-real-development-v0.2-certified`. All 41 boards are development-only; final benchmark use is explicitly false. The deterministic session-aware split has 28 train-development boards and 13 validation boards. Whole capture/platform sessions remain intact:

| Source/session group | Boards | Split |
| --- | ---: | --- |
| Chess.com | 14 | train-development |
| Lichess | 9 | train-development |
| World Chess | 5 | train-development |
| ChessBase / Playchess | 5 | validation |
| PlayOK | 6 | validation |
| Unknown platform | 2 | validation |

Human platform strings are preserved verbatim. Session grouping only normalizes obvious spelling/URL variants for split isolation; it does not infer platform from appearance. Capture type and source category remain unknown on all 41 records. Available human tags cover 38 photo-of-screen boards, 15 livestream boards, and three screen-glare boards. Other requested subtype axes remain sparse or absent and are not fabricated.

## Derived truth indexes

The certification derives indexes strictly from human truth: 1,818 empty squares and 806 occupied squares. Occupied class support is `P 210, N 44, B 37, R 51, Q 22, K 41, p 211, n 42, b 38, r 46, q 23, k 41`. The king-contrast index contains the 1,818 empty squares plus all K/k, Q/q, R/r, B/b, and N/n examples. B/N/Q and color-pair subsets are likewise derived without model predictions.

The authoritative committed files are:

- `scanner/recognition/datasets/real-development/real-development-v0.2-certified.json`
- `scanner/recognition/datasets/real-development/real-development-v0.2-indexes.json`
- `scanner/recognition/datasets/real-development/certification-v0.2.json`

Source photos are not committed. Public Scanner UI and runtime recognition are unchanged.
