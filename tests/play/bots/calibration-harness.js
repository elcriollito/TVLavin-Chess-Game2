import { Chess } from 'chess.js';
import {
    BOT_CALIBRATION_FIXTURE_SCHEMA, BOT_CALIBRATION_FIXTURES, BOT_CALIBRATION_SUITE_VERSION
} from './calibration-fixtures.js';

export const BOT_CALIBRATION_SCORE_SCHEMA = '1.0.0';

export function validateCalibrationSuite(fixtures = BOT_CALIBRATION_FIXTURES) {
    const errors = [];
    const ids = new Set();
    for (const item of fixtures) {
        if (item.schemaVersion !== BOT_CALIBRATION_FIXTURE_SCHEMA) errors.push(`${item.id}:schema`);
        if (!/^[a-z][a-z0-9-]{2,50}$/.test(item.id) || ids.has(item.id)) errors.push(`${item.id}:id`);
        ids.add(item.id);
        const game = new Chess();
        try { game.load(item.fen); } catch (_) { errors.push(`${item.id}:fen`); continue; }
        const legal = new Set(game.moves({ verbose: true }).map(move =>
            `${move.from}${move.to}${move.promotion || ''}`));
        for (const move of [...item.bestMoves, ...item.acceptableMoves]) {
            if (!legal.has(move)) errors.push(`${item.id}:move:${move}`);
        }
        if (!Number.isInteger(item.timeoutMs) || item.timeoutMs < 500 || item.timeoutMs > 10000)
            errors.push(`${item.id}:timeout`);
        if (item.scoringRule !== 'best-2-acceptable-1-legal-0') errors.push(`${item.id}:scoring`);
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function scoreCalibrationMove(item, observation) {
    if (!observation?.completed) return Object.freeze({ points: 0, outcome: observation?.timeout ? 'timeout' : 'failure' });
    const game = new Chess();
    try {
        game.load(item.fen);
        if (!game.move({
            from: observation.move?.slice(0, 2), to: observation.move?.slice(2, 4),
            promotion: observation.move?.slice(4, 5) || undefined
        })) return Object.freeze({ points: 0, outcome: 'illegal' });
    } catch (_) { return Object.freeze({ points: 0, outcome: 'illegal' }); }
    if (item.bestMoves.includes(observation.move)) return Object.freeze({ points: 2, outcome: 'best' });
    if (item.acceptableMoves.includes(observation.move)) return Object.freeze({ points: 1, outcome: 'acceptable' });
    return Object.freeze({ points: 0, outcome: 'legal-inferior' });
}

export function aggregateCalibration(botId, presetId, observations, fixtures = BOT_CALIBRATION_FIXTURES) {
    const categories = {};
    let totalScore = 0; let legalFailures = 0; let timeouts = 0; let totalLatencyMs = 0;
    const results = fixtures.map((item, index) => {
        const observation = observations[index] || {};
        const scored = scoreCalibrationMove(item, observation);
        categories[item.category] ||= { score: 0, maximum: 0, fixtures: 0 };
        categories[item.category].score += scored.points;
        categories[item.category].maximum += 2;
        categories[item.category].fixtures += 1;
        totalScore += scored.points;
        if (scored.outcome === 'illegal' || scored.outcome === 'failure') legalFailures += 1;
        if (scored.outcome === 'timeout') timeouts += 1;
        if (Number.isFinite(observation.latencyMs)) totalLatencyMs += observation.latencyMs;
        return Object.freeze({ fixtureId: item.id, move: observation.move || null, ...scored,
            latencyMs: observation.latencyMs ?? null });
    });
    return Object.freeze({
        schemaVersion: BOT_CALIBRATION_SCORE_SCHEMA, suiteVersion: BOT_CALIBRATION_SUITE_VERSION,
        botId, presetId, fixtureCount: fixtures.length, totalScore, maximumScore: fixtures.length * 2,
        legalFailures, timeouts, averageLatencyMs: fixtures.length ? Math.round(totalLatencyMs / fixtures.length) : null,
        categories: Object.freeze(Object.fromEntries(Object.entries(categories)
            .map(([key, value]) => [key, Object.freeze(value)]))),
        results: Object.freeze(results)
    });
}

export function inspectRelativeOrdering(reports, order = ['caissa-seed', 'caissa-trail', 'caissa-grove', 'caissa-summit']) {
    const byId = new Map(reports.map(report => [report.botId, report]));
    const warnings = [];
    for (let index = 1; index < order.length; index += 1) {
        const lower = byId.get(order[index - 1]); const higher = byId.get(order[index]);
        if (!lower || !higher) warnings.push(`missing:${order[index - 1]}:${order[index]}`);
        else if (higher.totalScore < lower.totalScore) warnings.push(`inverse:${lower.botId}:${higher.botId}`);
    }
    const first = byId.get(order[0]); const last = byId.get(order.at(-1));
    if (first && last && last.totalScore < first.totalScore) warnings.push('gross-inverse-order');
    return Object.freeze({ order: Object.freeze([...order]), warnings: Object.freeze(warnings),
        supported: !warnings.includes('gross-inverse-order') });
}
