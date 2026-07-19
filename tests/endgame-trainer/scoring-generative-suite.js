import { performance } from 'node:perf_hooks';
import { generateEndgamePosition } from '../../js/endgame-trainer/endgame-position-generator.js';
import { positionKey } from '../../js/endgame-trainer/endgame-fen-utils.js';
import { scoreEndgamePosition } from '../../js/endgame-trainer/endgame-position-scorer.js';
import { classifyExercise } from '../../js/endgame-trainer/endgame-exercise-classifier.js';
import { selectBestEndgameCandidate } from '../../js/endgame-trainer/endgame-candidate-selector.js';

const categories = ['KQK', 'KRK', 'KPK', 'KPKP'];
const increment = (map, key) => { map[key] = (map[key] || 0) + 1; };
const percentile = (sorted, fraction) => sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0;
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const report = { categories: {}, total: { candidates: 0, accepted: 0, fallbacks: 0 } };
const suiteStarted = performance.now();

for (const categoryId of categories) {
    const scores = [];
    const durations = [];
    const keys = new Set();
    const penalties = {}, bonuses = {}, classifications = {};
    const scoreFrequency = {};
    let accepted = 0, duplicates = 0;
    for (let index = 0; index < 1000; index += 1) {
        const generated = generateEndgamePosition({ categoryId, seed: `ET.2-${categoryId}-${index}` });
        if (!generated.ok) throw new Error(`generation-failed:${categoryId}:${index}`);
        const started = performance.now();
        const scoring = scoreEndgamePosition(generated.fen, { categoryId, strongSide: generated.metadata.strongSide });
        const classification = classifyExercise(generated.fen, scoring.features, scoring);
        durations.push(performance.now() - started);
        if (!(scoring.score >= 0 && scoring.score <= 100)) throw new Error(`score-out-of-range:${scoring.score}`);
        scores.push(scoring.score);
        increment(scoreFrequency, scoring.score);
        if (scoring.accepted) accepted += 1;
        scoring.penalties.forEach((item) => increment(penalties, item.code));
        scoring.bonuses.forEach((item) => increment(bonuses, item.code));
        increment(classifications, classification.type);
        const key = positionKey(generated.fen);
        if (keys.has(key)) duplicates += 1;
        keys.add(key);
    }
    const selectionDurations = [];
    const tieBreakDecisions = {};
    let fallbacks = 0, evaluatedTotal = 0, bestScoreTied = 0, tiedAtBestTotal = 0;
    const coldStarted = performance.now();
    const cold = selectBestEndgameCandidate({ categoryId, seed: `ET.2-cold-${categoryId}`, candidateCount: 12 });
    const coldFirstRunMs = performance.now() - coldStarted;
    if (!cold.ok) throw new Error(`cold-selection-failed:${categoryId}`);
    for (let index = 0; index < 100; index += 1) {
        const started = performance.now();
        const selection = selectBestEndgameCandidate({ categoryId, seed: `ET.2-select-${categoryId}-${index}`, candidateCount: 12 });
        selectionDurations.push(performance.now() - started);
        if (!selection.ok) throw new Error(`selection-failed:${categoryId}:${index}`);
        if (selection.fallbackUsed) fallbacks += 1;
        evaluatedTotal += selection.candidatesEvaluated;
        increment(tieBreakDecisions, selection.diagnostics.tieBreakDecidedBy);
        if (selection.diagnostics.bestScoreTied) bestScoreTied += 1;
        tiedAtBestTotal += selection.diagnostics.topScoreTieCount;
    }
    // Separate warmup from batch-size timing.
    for (let index = 0; index < 5; index += 1) selectBestEndgameCandidate({ categoryId, seed: `ET.2-warm-${categoryId}-${index}`, candidateCount: 4 });
    const batchPerformanceMs = {};
    for (const candidateCount of [4, 8, 12, 24]) {
        const batchDurations = [];
        for (let index = 0; index < 20; index += 1) {
            const started = performance.now();
            const result = selectBestEndgameCandidate({ categoryId, seed: `ET.2-batch-${categoryId}-${candidateCount}-${index}`, candidateCount });
            if (!result.ok) throw new Error(`batch-selection-failed:${categoryId}:${candidateCount}:${index}`);
            batchDurations.push(performance.now() - started);
        }
        batchDurations.sort((a, b) => a - b);
        batchPerformanceMs[candidateCount] = { average: average(batchDurations), p95: percentile(batchDurations, 0.95), maximum: batchDurations.at(-1) };
    }
    scores.sort((a, b) => a - b); durations.sort((a, b) => a - b); selectionDurations.sort((a, b) => a - b);
    const scoreMean = average(scores);
    const scoreStandardDeviation = Math.sqrt(average(scores.map((score) => (score - scoreMean) ** 2)));
    const deciles = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`${index * 10}-${index === 9 ? 100 : index * 10 + 9}`, 0]));
    for (const score of scores) {
        const bucket = Math.min(9, Math.floor(score / 10));
        const key = `${bucket * 10}-${bucket === 9 ? 100 : bucket * 10 + 9}`;
        deciles[key] += 1;
    }
    const topScores = Object.entries(scoreFrequency).sort((left, right) => right[1] - left[1] || Number(right[0]) - Number(left[0])).slice(0, 10).map(([score, count]) => ({ score: Number(score), count }));
    report.categories[categoryId] = {
        candidatesGenerated: 1000, scoreMinimum: scores[0], scoreMaximum: scores.at(-1),
        scoreAverage: scoreMean,
        scoreMedian: percentile(scores, 0.5), scoreP10: percentile(scores, 0.1), scoreP90: percentile(scores, 0.9),
        distinctScoreCount: Object.keys(scoreFrequency).length, top10MostFrequentScores: topScores,
        score100Percentage: (scoreFrequency[100] || 0) / 10, score94Percentage: (scoreFrequency[94] || 0) / 10,
        score84Percentage: (scoreFrequency[84] || 0) / 10, scoreDeciles: deciles,
        scoreStandardDeviation, scoreZeroPercentage: (scoreFrequency[0] || 0) / 10,
        acceptedPercentage: accepted / 10, penalties, bonuses, classifications,
        averageCandidatesEvaluatedPerSelection: evaluatedTotal / 100,
        fallbackRatePercentage: fallbacks, duplicatePositionKeys: duplicates,
        bestScoreTiedPercentage: bestScoreTied,
        averageCandidatesTiedAtBestScore: tiedAtBestTotal / 100,
        tieBreakDecisions,
        performanceMs: { average: durations.reduce((a, b) => a + b, 0) / durations.length, p95: percentile(durations, 0.95), maximum: durations.at(-1) },
        selectionPerformanceMs: { coldFirstRun: coldFirstRunMs, warmAverage: average(selectionDurations), p95: percentile(selectionDurations, 0.95), maximum: selectionDurations.at(-1) },
        batchPerformanceMs
    };
    report.total.candidates += 1000; report.total.accepted += accepted; report.total.fallbacks += fallbacks;
}
report.total.timeMs = performance.now() - suiteStarted;
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
