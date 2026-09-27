# Lichess puzzle quality review: rating 1700-2100

Measured locally on the verified 2026-09-10 catalog. The analysis is reproducible with
`tools/puzzles/analyze_quality.py`; legality is checked by the production puzzle model,
not inferred from CSV shape alone.

## Population

- Catalog: 6,100,952 puzzles.
- Range 1700-2100 inclusive: 1,130,602 puzzles (18.5316% of the catalog).
- Rating buckets: 307,672 at 1700-1799; 274,889 at 1800-1899; 292,912 at
  1900-1999; 252,817 at 2000-2099; 2,312 exactly at 2100.
- Mean values: rating 1,892.16; deviation 81.70; popularity 86.21; plays 2,165.65.
- Rating deviation at most 100: 1,060,499. Popularity at least 80: 970,268.
- Opening-tagged: 208,603.

Solution lengths contain 12,678 two-ply sequences, 532,482 four-ply sequences,
and 585,442 sequences of six or more plies. Lichess sequences are even-length in
this range because the first ply sets up the position and the remaining line
alternates solver and opponent moves.

## Quality gates

The default selection gate is:

- rating deviation at most 100;
- popularity at least 80;
- at least 500 plays;
- selected rating range and at least one requested official theme.

This retains 572,098 puzzles in the 1700-2100 range. It is strict enough for a
large training pool while relying only on source signals that have defined
semantics and remain traceable.

`equality` is genuinely sparse: only 15 puzzles in the range pass deviation <=
100, popularity >= 80, and the relaxed threshold of 100 plays. The API may use
that relaxation only when `equality` is the sole requested theme. Those 15 need
human chess review before a general-release quality claim.

## Duplication and legality

- 201 exact-FEN duplicate groups, containing 214 rows beyond their first member.
- Six exact FEN-plus-move-sequence duplicate groups, each with one extra row.
- No repeated theme tokens in this rating range.
- A deterministic 2,048-puzzle sample completed every UCI sequence legally and
  every first move prepared the rival position.

All rows remain in the lossless source catalog. A future release-quality
materialization should select the lexicographically smallest `PuzzleId` as the
canonical member of an exact FEN-plus-moves group while retaining the other IDs
for audit and provenance. This should not be imposed destructively on raw data.

The 2,048 sample is evidence, not proof that every one of the 1,130,602 sequences
is legal. General release still requires expert review of a stratified sample,
especially all qualifying Equality puzzles and duplicate groups.

## Local query measurements

The first sparse-theme plan scanned the wider relaxed population and was stopped
after several minutes. A dedicated Equality partial index removed that failure
mode. After optimization:

| Query | Rows | Local time | Plan note |
| --- | ---: | ---: | --- |
| Fork, rating 1700-1900, standard gate | 12 | 0.173 ms median over 7 | `puzzles_training_standard_idx` |
| Equality, rating 1700-2100, relaxed gate | 12 | 0.056 ms median over 7 | `puzzles_training_equality_idx` |
| Sicilian Defense, rating 1700-1900 | 12 | 550.086 ms, one run | opening lookup plus temporary order B-tree |

The full quality/duplication analysis took 175.363 seconds, of which exact
duplicate grouping took 95.047 seconds. Building the standard and relaxed partial
indexes took 52.394 seconds; the Equality index and re-analysis took 13.545
seconds. The catalog grew from 2,046,775,296 to 2,166,308,864 bytes and passed
`quick_check` after each change.

These are workstation/SQLite measurements. PostgreSQL `EXPLAIN (ANALYZE,
BUFFERS)` results on the isolated Supabase branch remain mandatory, particularly
for opening filters.
