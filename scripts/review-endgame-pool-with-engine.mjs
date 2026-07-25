import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { runEngineReview } from './endgame-engine-review.mjs';
import { stableStringify } from '../js/endgame-trainer/v2/curated-pool-validator.js';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';

const argument = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? null : process.argv[index + 1];
};
const sha256 = (value) =>
    `sha256-${createHash('sha256').update(stableStringify(value)).digest('hex')}`;

export function classifyEngineReview(position, result) {
    const move = ChessRulesFacade.fromFen(position.fen).move(position.expectedMove);
    const authored = `${move.from}${move.to}${move.promotion || ''}`;
    const candidate = result.candidates.find((entry) => entry.principalVariation[0] === authored);
    if (result.bestMove === authored) {
        const best = result.candidates[0]?.score;
        const second = result.candidates[1]?.score;
        const close = best?.type === 'cp' && second?.type === 'cp' &&
            Math.abs(best.value - second.value) <= 30;
        return close ? 'confirmed-with-close-alternative' : 'confirmed';
    }
    if (candidate) return 'requires-human-review';
    return 'authored-answer-questioned';
}

export async function reviewPool({ executable, source, identity, policy }) {
    const records = [];
    for (const position of source.positions) {
        const started = performance.now();
        const result = await runEngineReview({ executable, identity, policy, fen: position.fen });
        const positionContentDigest = sha256({
            positionId: position.positionId,
            fen: position.fen,
            objective: position.objective,
            expectedMove: position.expectedMove,
            acceptedAlternatives: position.acceptedAlternatives
        });
        const normalized = {
            evidenceSchemaVersion: '1.0.0',
            evidenceVersion: '1.0.0',
            evidenceType: 'engine-review',
            positionId: position.positionId,
            positionContentDigest,
            positionContentFingerprint: positionContentDigest,
            engineIdentity: result.engineIdentity,
            analysisPolicy: result.analysisPolicy,
            toolOrReviewer: result.engineIdentity.engineId,
            authoredExpectedMove: position.expectedMove,
            bestMove: result.bestMove,
            multiPv: result.candidates,
            resultClassification: classifyEngineReview(position, result),
            result: { classification: classifyEngineReview(position, result) },
            inputFingerprint: positionContentDigest,
            outputFingerprint: sha256({
                engineIdentity: result.engineIdentity,
                analysisPolicy: result.analysisPolicy,
                bestMove: result.bestMove,
                multiPv: result.candidates
            })
        };
        records.push({
            ...normalized,
            analysisDurationMs: Math.round(performance.now() - started),
            evidenceDigest: sha256(normalized)
        });
    }
    return {
        evidenceCollectionSchemaVersion: '1.0.0',
        poolId: source.poolId,
        poolVersion: source.poolVersion,
        records
    };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${resolve(process.argv[1]).replaceAll('\\', '/')}`).href) {
    const executable = argument('--engine');
    const output = argument('--output');
    if (!executable || !output) throw new Error('usage: --engine <path> --output <path>');
    const source = JSON.parse(await readFile(argument('--source') ||
        'endgame-pools/authoring/pools/caissa-king-pawn-decisions-1.0.0.json', 'utf8'));
    const identity = JSON.parse(await readFile(argument('--identity') ||
        'endgame-pools/private/toolchain/stockfish-18-windows-x64-avx2.json', 'utf8'));
    const policy = JSON.parse(await readFile(argument('--policy') ||
        'endgame-pools/private/toolchain/engine-review-policy-1.0.0.json', 'utf8'));
    const evidence = await reviewPool({ executable, source, identity, policy });
    await writeFile(output, `${stableStringify(evidence)}\n`, 'utf8');
    console.log(`Reviewed ${evidence.records.length} positions.`);
}
