import { generateEndgamePosition } from './endgame-position-generator.js';
import { validateEndgamePosition } from './endgame-position-validator.js';
import { positionKey } from './endgame-fen-utils.js';
import { extractPositionFeatures } from './endgame-position-features.js';
import { scoreEndgamePosition, SCORING_THRESHOLDS } from './endgame-position-scorer.js';
import { classifyExercise } from './endgame-exercise-classifier.js';

export const SELECTOR_VERSION = '1.0.0';
function failure(code) { return { ok: false, error: { code }, version: SELECTOR_VERSION }; }

/** Deterministic ordering contract used by candidate selection. */
export function compareEndgameCandidates(left, right) {
    return right.scoring.score - left.scoring.score
        || left.scoring.penalties.length - right.scoring.penalties.length
        || right.diversity - left.diversity
        || left.generationIndex - right.generationIndex
        || left.positionKey.localeCompare(right.positionKey);
}

export function selectBestEndgameCandidate(options = {}) {
    const { categoryId, seed = 'caissa-selector', candidateCount = 12, generatorOptions = {} } = options;
    const minimumScore = options.minimumScore ?? SCORING_THRESHOLDS[categoryId];
    const recentPositionKeys = options.recentPositionKeys ?? [];
    if (!SCORING_THRESHOLDS[categoryId]) return failure('unknown-category');
    if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 100) return failure('invalid-candidate-count');
    if (!Number.isFinite(minimumScore) || minimumScore < 0 || minimumScore > 100) return failure('invalid-minimum-score');
    if (!Array.isArray(recentPositionKeys) || recentPositionKeys.some((key) => typeof key !== 'string')) return failure('invalid-recent-position-keys');
    if (!generatorOptions || typeof generatorOptions !== 'object' || Array.isArray(generatorOptions)) return failure('invalid-options');

    const candidates = [];
    const rejectionSummary = {};
    for (let index = 0; index < candidateCount; index += 1) {
        const generated = generateEndgamePosition({ ...generatorOptions, categoryId, seed: `${String(seed)}:${index}` });
        if (!generated.ok) {
            rejectionSummary[generated.error.code] = (rejectionSummary[generated.error.code] || 0) + 1;
            continue;
        }
        const validation = validateEndgamePosition(generated.fen, { categoryId, strongSide: generated.metadata.strongSide });
        if (!validation.valid) {
            for (const code of validation.errors) rejectionSummary[code] = (rejectionSummary[code] || 0) + 1;
            continue;
        }
        const key = positionKey(generated.fen);
        const features = extractPositionFeatures(generated.fen, { categoryId });
        const scoring = scoreEndgamePosition(generated.fen, { categoryId, strongSide: generated.metadata.strongSide, minimumScore, recentPositionKeys });
        const classification = classifyExercise(generated.fen, features, scoring);
        candidates.push({ fen: generated.fen, metadata: generated.metadata, features, scoring, classification, positionKey: key, diversity: recentPositionKeys.includes(key) ? 0 : 1, generationIndex: index });
    }
    if (!candidates.length) return { ...failure('no-candidate-available'), rejectionSummary };
    candidates.sort(compareEndgameCandidates);
    const accepted = candidates.filter((candidate) => candidate.scoring.score >= minimumScore);
    const fallbackUsed = accepted.length === 0;
    const selected = accepted[0] || candidates[0];
    const selectionPool = accepted.length ? accepted : candidates;
    const runnerUp = selectionPool[1];
    const topScoreTieCount = selectionPool.filter((candidate) => candidate.scoring.score === selected.scoring.score).length;
    let tieBreakDecidedBy = 'only-candidate';
    if (runnerUp) {
        if (selected.scoring.score !== runnerUp.scoring.score) tieBreakDecidedBy = 'score';
        else if (selected.scoring.penalties.length !== runnerUp.scoring.penalties.length) tieBreakDecidedBy = 'penalty-count';
        else if (selected.diversity !== runnerUp.diversity) tieBreakDecidedBy = 'diversity';
        else if (selected.generationIndex !== runnerUp.generationIndex) tieBreakDecidedBy = 'generation-index';
        else tieBreakDecidedBy = 'position-key';
    }
    return {
        ok: true, selected, candidatesEvaluated: candidates.length,
        candidatesAccepted: accepted.length, fallbackUsed, rejectionSummary,
        warnings: fallbackUsed ? [{ code: 'no-candidate-met-threshold' }] : [],
        diagnostics: {
            requested: candidateCount,
            selectedGenerationIndex: selected.generationIndex,
            tieBreakDecidedBy,
            topScoreTieCount,
            bestScoreTied: topScoreTieCount > 1
        },
        version: SELECTOR_VERSION
    };
}
