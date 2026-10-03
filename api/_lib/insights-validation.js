import { createHash } from 'node:crypto';
import { Chess } from '../../assets/vendor/chess.js/chess-1.4.0.esm.js';
import '../../js/insights/core.js';

export const core = globalThis.CaissaInsightsCore;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export function invalid(message, status = 400) { return Object.assign(new Error(message), { status, code: 'INVALID_INSIGHT' }); }
function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
    return value;
}
export const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export function bodyObject(body, limit = core.LIMITS.reportBytes) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('A JSON object is required.');
    if (Buffer.byteLength(JSON.stringify(body)) > limit) throw invalid('Payload exceeds the supported size.', 413);
    if (['user_id', 'clerk_id', 'ownerId', 'accountId'].some(k => Object.hasOwn(body, k))) throw invalid('Account ownership is determined by your session.');
    return body;
}
export function validateDataset(body) {
    bodyObject(body);
    if (typeof body.rawText !== 'string' || !body.subject || !['local', 'chess.com', 'lichess'].includes(body.subject.provider)
        || typeof body.subject.username !== 'string' || !body.subject.username.trim() || body.subject.username.length > 200) throw invalid('Choose the exact player name and source.');
    if (Buffer.byteLength(body.rawText) > core.LIMITS.pgnBytes) throw invalid('PGN exceeds the 1 MiB limit.', 413);
    const metadata = body.importMetadata || [];
    if (!Array.isArray(metadata) || metadata.length > core.LIMITS.games) throw invalid('Invalid import metadata.');
    const importedGames = metadata.map(m => {
        if (!m || typeof m !== 'object' || (m.id != null && (typeof m.id !== 'string' || m.id.length > 500))
            || (m.playedAt != null && (typeof m.playedAt !== 'string' || m.playedAt.length > 40 || !Number.isFinite(Date.parse(m.playedAt))))
            || (m.timeControl != null && (typeof m.timeControl !== 'string' || m.timeControl.length > 80))) throw invalid('Invalid game provenance.');
        return { id: m.id || null, playedAt: m.playedAt || null, timeControl: m.timeControl || null };
    });
    let dataset;
    try { dataset = core.parse(body.rawText, { ...body.subject, importedGames }, Chess); }
    catch (error) { throw invalid(error.message); }
    if (!dataset.games.length || !dataset.stats.identified) throw invalid('No legal games identify the selected player.');
    const inputHash = hash({ rawText: dataset.rawText, subject: dataset.subject, importMetadata: dataset.importMetadata });
    return { dataset, inputHash };
}
function evaluation(value, fen) {
    if (value == null) return null;
    if (value.status === 'unavailable') return { status: 'unavailable', reason: ['ENGINE_TIMEOUT', 'ENGINE_UNAVAILABLE', 'INCOMPLETE_ENGINE_RESULT', 'ENGINE_REQUEST_REJECTED'].includes(value.reason) ? value.reason : 'INCOMPLETE_ENGINE_RESULT', cp: null, mate: null, depth: null, nodes: null, pv: [], bestMove: null };
    if (value.status !== 'complete') throw invalid('Invalid evaluation state.');
    const actualTerminal = core.terminal(fen, Chess);
    if (value.terminal) {
        if (!actualTerminal || actualTerminal.cp !== value.cp || actualTerminal.mate !== value.mate || actualTerminal.winner !== value.winner) throw invalid('Terminal evaluation does not match the replay.');
        return actualTerminal;
    }
    const cp = value.cp, mate = value.mate;
    if ((cp === null) === (mate === null) || (cp !== null && (!Number.isInteger(cp) || Math.abs(cp) > 100000))
        || (mate !== null && (!Number.isInteger(mate) || mate === 0 || Math.abs(mate) > 1000))
        || !Number.isInteger(value.depth) || value.depth < 12 || value.depth > 128
        || !Number.isSafeInteger(value.nodes) || value.nodes < 0
        || !Array.isArray(value.pv) || value.pv.length > 12 || value.pv.some(m => !UCI.test(m))
        || (value.bestMove !== null && !UCI.test(value.bestMove || ''))
        || !['runId', 'requestId', 'generationId'].every(k => typeof value[k] === 'string' && value[k].length <= 150)) throw invalid('Malformed engine evidence.');
    return { status: 'complete', cp, mate, winner: null, perspective: 'white', unit: mate !== null ? 'mate' : 'centipawn',
        depth: value.depth, nodes: value.nodes, pv: value.pv, bestMove: value.bestMove,
        runId: value.runId, requestId: value.requestId, generationId: value.generationId,
        elapsedMs: Number.isFinite(value.elapsedMs) ? Math.min(10000, Math.max(0, value.elapsedMs)) : null };
}
export function validateSnapshot(snapshot, dataset) {
    bodyObject(snapshot);
    if (snapshot.schemaVersion !== '1.0.0' || snapshot.method !== 'engine_browser'
        || snapshot.policy?.depth !== 12 || snapshot.policy?.criticalLossCp !== 120
        || snapshot.policy?.phaseVersion !== 'fullmove-material-v1') throw invalid('Unsupported analysis method.');
    let games;
    try { games = core.selectGames(dataset, snapshot.config?.gameCount, snapshot.config?.colorFilter); }
    catch (error) { throw invalid(error.message); }
    if (!games.length || !Array.isArray(snapshot.selectedGames) || hash(snapshot.selectedGames) !== hash(games.map(g => ({ id: g.id, userColor: g.userColor, resultForTarget: core.resultFor(g) })))
        || !Array.isArray(snapshot.analyses) || snapshot.analyses.length !== games.length) throw invalid('Report games do not match the dataset and filters.');
    const analyses = [], moments = [];
    for (let index = 0; index < games.length; index++) {
        const game = games[index], input = snapshot.analyses[index], replay = core.replay(game, Chess);
        if (input?.gameId !== game.id || !Array.isArray(input.evaluations) || input.evaluations.length !== replay.positions.length) throw invalid('Invalid game coverage.');
        const evaluations = input.evaluations.map((v, i) => evaluation(v, replay.positions[i]));
        const phases = Object.fromEntries(['opening', 'middlegame', 'endgame'].map(p => [p, { eligible: 0, evaluated: 0, critical: 0 }]));
        const analysis = { gameId: game.id, eligible: 0, evaluated: 0, phases, evaluations, moments: [] };
        for (const move of replay.moves) {
            if (move.color !== game.userColor) continue;
            const phase = core.phase(move.before); analysis.eligible++; phases[phase].eligible++;
            const before = evaluations[move.ply], after = evaluations[move.ply + 1], loss = core.loss(before, after, move.color);
            if (!loss) continue;
            analysis.evaluated++; phases[phase].evaluated++;
            if (loss.cp >= 120 || loss.mateTransition) {
                phases[phase].critical++;
                const moment = { gameId: game.id, ply: move.ply, moveSAN: move.san,
                    playedMove: `${move.from}${move.to}${move.promotion || ''}`, fen: move.before, fenAfter: move.after,
                    playerColor: move.color, phase, lossCp: loss.cp, mateTransition: loss.mateTransition,
                    bestMove: before?.bestMove || null, tags: [], evidenceStatus: 'client_reported' };
                analysis.moments.push(moment); moments.push(moment);
            }
        }
        analysis.status = analysis.eligible > 0 && analysis.evaluated === analysis.eligible ? 'complete' : analysis.evaluated ? 'partial' : 'unavailable'; analyses.push(analysis);
    }
    const aggregate = core.aggregate(games, analyses);
    const analysisStatus = aggregate.coverage.eligible > 0 && aggregate.coverage.evaluated === aggregate.coverage.eligible ? 'complete' : aggregate.coverage.evaluated ? 'partial' : 'unavailable';
    if (snapshot.analysisStatus !== analysisStatus) throw invalid('Analysis status does not match its coverage.');
    const clean = { schemaVersion: '1.0.0', method: 'engine_browser', verificationStatus: 'structurally_validated', analysisStatus,
        versions: { analysis: '1.0.0', phase: 'fullmove-material-v1', rules: 'chess.js-replay-v1' }, subject: dataset.subject,
        config: { gameCount: snapshot.config.gameCount, colorFilter: snapshot.config.colorFilter }, selectedGames: snapshot.selectedGames,
        gamesAnalyzed: games.length, moments, analyses: analyses.map(({ moments, ...a }) => a), aggregate, plan: [],
        timestamp: typeof snapshot.timestamp === 'string' && Number.isFinite(Date.parse(snapshot.timestamp)) ? snapshot.timestamp : null,
        engine: snapshot.engine && typeof snapshot.engine.reportedUciName === 'string' && snapshot.engine.reportedUciName.length <= 100
            ? { providerId: 'stockfish-18-lite', reportedUciName: snapshot.engine.reportedUciName, evidenceStatus: 'client_reported' } : null,
        policy: { depth: 12, perPositionMs: 2500, runMs: 180000, criticalLossCp: 120, phaseVersion: 'fullmove-material-v1' } };
    bodyObject(clean);
    return clean;
}
export function summary(snapshot) {
    return { subject: snapshot.subject, gamesAnalyzed: snapshot.gamesAnalyzed, analysisStatus: snapshot.analysisStatus,
        wld: snapshot.aggregate.wld, coverage: snapshot.aggregate.coverage, method: snapshot.method, verificationStatus: snapshot.verificationStatus };
}
