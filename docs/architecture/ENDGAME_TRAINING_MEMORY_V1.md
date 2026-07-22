# Endgame Training Memory v1

## Architecture

Training Memory is a pure educational domain. It sanitizes completed guided-session records, maintains a newest-first deduplicated history, and derives statistics, mastery, weaknesses, and recommendations. It has no DOM, engine, board, network, or storage dependency.

The existing progress store remains the persistence adapter. Its established key, `caissa:endgame-trainer:progress:v1`, now contains a versioned `trainingMemory` member. Loading an older valid progress document automatically supplies an empty Training Memory v1. This preserves all previous totals, curriculum records, recent sessions, reset behavior, and cross-tab updates.

The page records one Training Memory entry when a guided session completes, fails, is resigned, or is abandoned. It summarizes the classifications already emitted by the coaching layer without changing that API. Free-practice sessions continue to use the legacy progress counters because they do not own a lesson or theme.

## Session schema

Each record contains `id`, `lessonId`, `theme`, `outcome`, `solved`, `failed`, `hintsUsed`, `attempts`, `durationMs`, `finalResult`, a count for every coaching classification, and `timestamp`. Engine lines, evaluations, FENs, account data, and remote identifiers are not stored in Training Memory.

History is capped at 1,000 unique sessions. Duplicate IDs are ignored, including after reload or concurrent store reconciliation.

## Statistics and mastery

Per-theme statistics include attempts, solved, failed, hints, average duration, accuracy, current/best solved streak, last practiced time, and classification totals.

Mastery is an integer from 0 to 100:

`55% success rate + 25% move accuracy + 10% hint efficiency + 5% completion speed + 5% recent improvement`

Move accuracy counts `BEST`, `GOOD`, `ONLY_MOVE`, and `SUCCESS` as positive. Hint efficiency reaches zero at an average of three hints per session. Completion speed decreases linearly to zero at ten minutes. Recent improvement compares the latest five outcomes with the preceding five.

Levels are `Needs Practice` below 30, `Learning` from 30, `Improving` from 55, `Strong` from 75, and `Mastered` from 90 when at least five attempts exist.

## Weaknesses and recommendations

Weakness selection uses deterministic numeric ordering with theme ID as the tie-breaker. It computes the most difficult theme, lowest accuracy, most hints, slowest completion, highest improvement, and most frequent mistake class.

Recommendations prioritize a recent blunder pattern, then excessive hint use in the weakest theme, then continued practice of that theme. Empty memory recommends starting a guided lesson. No recommendation is random or manually assigned.

## Import and export

Export is formatted JSON containing only Training Memory v1. Import parses and validates every record before replacing memory. Invalid JSON, unsupported versions, malformed sessions, or persistence failures leave the existing memory unchanged. Reset clears both legacy progress and Training Memory.

Future cloud synchronization can replace the progress-store persistence adapter while reusing the domain functions and schema unchanged.
