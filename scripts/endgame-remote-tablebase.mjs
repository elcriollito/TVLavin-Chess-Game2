import { createHash } from 'node:crypto';
import { ChessRulesFacade } from '../js/endgame-trainer/chess-rules-facade.js';
import {
    boardFromFen, canonicalizeFen, countPieces, hasPawnOnInvalidRank, kingsAreAdjacent
} from '../js/endgame-trainer/endgame-fen-utils.js';
import { stableStringify } from '../js/endgame-trainer/v2/curated-pool-validator.js';

export const REMOTE_PROVIDER = Object.freeze({
    providerId: 'lichess-syzygy-remote',
    providerVersion: '1.0.0',
    baseUrl: 'https://tablebase.lichess.ovh',
    supportedVariants: Object.freeze(['standard']),
    maximumPieceCount: 8,
    completePieceCoverage: 7,
    eightPieceCoverage: 'partial-provider-coverage',
    supportsWdl: true,
    supportsDtz: true,
    supportsDtm: true,
    supportsMoves: true,
    supportsMainline: true,
    networkRequired: true,
    runtimeEligibility: false,
    authoringEligibility: true,
    timeoutPolicy: Object.freeze({ defaultMs: 12000, minimumMs: 1000, maximumMs: 30000 }),
    retryPolicy: Object.freeze({ maximumRetries: 2, backoffMs: 400 }),
    cachePolicy: 'private-content-and-request-digest'
});

export const REMOTE_EVIDENCE_SCHEMA_VERSION = '1.0.0';
export const REVIEW_PACKET_SCHEMA_VERSION = '1.0.0';
export const ALLOWED_REVIEW_DECISIONS = Object.freeze([
    'authored-answer-confirmed', 'accepted-alternative-required', 'objective-needs-rewording',
    'hint-needs-revision', 'position-needs-correction', 'position-valid-but-not-only-move',
    'position-not-suitable-for-quick-challenge', 'engine-result-inconclusive',
    'requires-local-tablebase', 'retire-position'
]);

export const sha256 = (value) =>
    `sha256-${createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value), 'utf8').digest('hex')}`;

export function validateRemoteEligibility(fen, { variant = 'standard', required = true } = {}) {
    if (!required) return { status: 'not-required' };
    if (!REMOTE_PROVIDER.supportedVariants.includes(variant)) return { status: 'unsupported-variant' };
    let canonicalFen;
    let board;
    let rules;
    try {
        canonicalFen = canonicalizeFen(fen);
        board = boardFromFen(canonicalFen);
        rules = ChessRulesFacade.fromFen(canonicalFen);
    } catch {
        return { status: 'invalid-fen' };
    }
    const kings = board.filter((piece) => piece.type === 'k');
    const fields = canonicalFen.split(' ');
    if (kings.length !== 2 || kingsAreAdjacent(board) || hasPawnOnInvalidRank(board) ||
        fields[2] !== '-' || fields[3] !== '-' || rules.sideToMove() === undefined)
        return { status: 'invalid-fen' };
    const pieceCount = countPieces(board);
    if (pieceCount > REMOTE_PROVIDER.maximumPieceCount)
        return { status: 'unsupported-piece-count', canonicalFen, pieceCount };
    return { status: 'eligible', canonicalFen, pieceCount };
}

const CATEGORY_VALUES = Object.freeze({
    loss: -2, 'syzygy-loss': -2, 'maybe-loss': -2, 'blessed-loss': -1,
    draw: 0, 'cursed-win': 1, 'maybe-win': 2, 'syzygy-win': 2, win: 2, unknown: null
});
const invertCategoryValue = (category) =>
    Number.isFinite(CATEGORY_VALUES[category]) ? -CATEGORY_VALUES[category] : null;

export function normalizeTablebaseResponse({ positionId, fen, positionContentDigest, body, httpStatus = 200, retrievedAt }) {
    const eligibility = validateRemoteEligibility(fen);
    if (eligibility.status !== 'eligible') throw Object.assign(new Error(eligibility.status), { code: eligibility.status });
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        !Object.hasOwn(CATEGORY_VALUES, body.category) || !Array.isArray(body.moves))
        throw Object.assign(new Error('invalid-response'), { code: 'invalid-response' });
    const rules = ChessRulesFacade.fromFen(eligibility.canonicalFen);
    const moves = body.moves.map((move) => {
        if (!move || typeof move.uci !== 'string' || typeof move.san !== 'string' ||
            !Object.hasOwn(CATEGORY_VALUES, move.category))
            throw Object.assign(new Error('invalid-response'), { code: 'invalid-response' });
        const applied = rules.move(move.uci);
        if (applied.san !== move.san)
            throw Object.assign(new Error('move-validation-failed'), { code: 'move-validation-failed', move: move.uci });
        const resultingFen = rules.fen();
        rules.undo();
        return {
            uci: move.uci, san: move.san, resultingFen, resultingCategory: move.category,
            wdlForMover: invertCategoryValue(move.category),
            ...(Number.isInteger(move.dtz) ? { dtz: move.dtz } : {}),
            ...(Number.isInteger(move.dtm) ? { dtm: move.dtm } : {}),
            zeroing: Boolean(move.zeroing),
            checkmate: Boolean(move.checkmate),
            stalemate: Boolean(move.stalemate),
            insufficientMaterial: Boolean(move.insufficient_material)
        };
    });
    const knownMoveValues = moves.map((move) => move.wdlForMover).filter(Number.isFinite);
    const bestWdl = knownMoveValues.length ? Math.max(...knownMoveValues) : null;
    const preserving = Number.isFinite(bestWdl) ? moves.filter((move) => move.wdlForMover === bestWdl) : [];
    const firstPreservingDtz = preserving[0]?.dtz;
    const optimal = Number.isInteger(body.dtz) && Number.isInteger(firstPreservingDtz)
        ? preserving.filter((move) => move.dtz === firstPreservingDtz)
        : [];
    const normalized = {
        evidenceSchemaVersion: REMOTE_EVIDENCE_SCHEMA_VERSION,
        evidenceType: 'remote-tablebase',
        providerId: REMOTE_PROVIDER.providerId,
        providerVersion: REMOTE_PROVIDER.providerVersion,
        endpointType: 'standard',
        positionId,
        positionFen: eligibility.canonicalFen,
        positionContentDigest,
        requestDigest: sha256({
            providerId: REMOTE_PROVIDER.providerId, providerVersion: REMOTE_PROVIDER.providerVersion,
            endpointType: 'standard', fen: eligibility.canonicalFen, positionContentDigest
        }),
        responseDigest: sha256(body),
        category: body.category,
        ...(Number.isInteger(body.dtz) ? { dtz: body.dtz } : {}),
        ...(Number.isInteger(body.dtm) ? { dtm: body.dtm } : {}),
        checkmate: Boolean(body.checkmate),
        stalemate: Boolean(body.stalemate),
        insufficientMaterial: Boolean(body.insufficient_material),
        fiftyMoveRule: true,
        moves,
        wdlPreservingMoves: preserving.map((move) => move.uci),
        dtzOptimalMoves: optimal.map((move) => move.uci),
        retrievedAt,
        httpStatus,
        remoteTablebaseEvidenceAvailable: true,
        localTablebaseVerified: false,
        humanReviewedRemoteEvidence: false
    };
    return Object.freeze({ ...normalized, evidenceDigest: sha256(normalized) });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchRemoteTablebase(fen, {
    fetchImpl = fetch,
    timeoutMs = REMOTE_PROVIDER.timeoutPolicy.defaultMs,
    retries = REMOTE_PROVIDER.retryPolicy.maximumRetries
} = {}) {
    if (timeoutMs < REMOTE_PROVIDER.timeoutPolicy.minimumMs || timeoutMs > REMOTE_PROVIDER.timeoutPolicy.maximumMs)
        throw Object.assign(new Error('invalid-timeout'), { code: 'invalid-timeout' });
    if (!Number.isInteger(retries) || retries < 0 || retries > REMOTE_PROVIDER.retryPolicy.maximumRetries)
        throw Object.assign(new Error('invalid-retry-policy'), { code: 'invalid-retry-policy' });
    const url = new URL('/standard', REMOTE_PROVIDER.baseUrl);
    url.searchParams.set('fen', canonicalizeFen(fen));
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(url, {
                signal: controller.signal,
                redirect: 'manual',
                headers: { accept: 'application/json', 'user-agent': 'CAISSA-Chess-private-authoring/10.5A' }
            });
            if (response.status >= 300 && response.status < 400)
                throw Object.assign(new Error('redirect-rejected'), { code: 'redirect-rejected' });
            if (response.status === 429 || response.status >= 500)
                throw Object.assign(new Error('provider-unavailable'), { code: 'provider-unavailable', httpStatus: response.status });
            if (!response.ok)
                throw Object.assign(new Error(response.status === 404 ? 'unsupported' : 'provider-http-error'),
                    { code: response.status === 404 ? 'unsupported' : 'provider-http-error', httpStatus: response.status });
            if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || ''))
                throw Object.assign(new Error('invalid-content-type'), { code: 'invalid-content-type' });
            let body;
            try {
                body = await response.json();
            } catch {
                throw Object.assign(new Error('invalid-json'), { code: 'invalid-json' });
            }
            return { body, httpStatus: response.status };
        } catch (error) {
            lastError = error.name === 'AbortError'
                ? Object.assign(new Error('timeout'), { code: 'timeout' })
                : error;
            if (attempt >= retries || !['timeout', 'provider-unavailable'].includes(lastError.code)) throw lastError;
        } finally {
            clearTimeout(timer);
        }
        await wait(REMOTE_PROVIDER.retryPolicy.backoffMs * (attempt + 1));
    }
    throw lastError;
}

export function compareEvidence(position, engine, tablebase) {
    if (!tablebase?.remoteTablebaseEvidenceAvailable)
        return { technicalClassification: 'provider-unavailable', requiresHumanInterpretation: true };
    const authoredUci = engine.authoredExpectedMoveUci || engine.authoredExpectedMoveLan ||
        engine.authoredExpectedMove;
    const accepted = new Set([authoredUci, ...(engine.authoredAcceptedAlternativesUci || [])].filter(Boolean));
    const preserving = new Set(tablebase.wdlPreservingMoves);
    const authoredPreserves = preserving.has(authoredUci);
    const stockfishPreserves = preserving.has(engine.bestMove);
    const acceptedPreserving = [...accepted].filter((move) => preserving.has(move));
    let technicalClassification = 'requires-human-pedagogical-decision';
    if (!authoredPreserves) technicalClassification = 'authored-move-tablebase-invalid';
    else if (position.objective.type === 'only-move' && preserving.size > 1) technicalClassification = 'only-move-claim-invalid';
    else if (authoredUci === engine.bestMove && tablebase.dtzOptimalMoves.includes(authoredUci))
        technicalClassification = 'all-evidence-aligned';
    else if (authoredPreserves) technicalClassification = 'authored-valid-among-equivalents';
    return {
        technicalClassification,
        authoredMoveUci: authoredUci,
        authoredPreservesTheoreticalResult: authoredPreserves,
        stockfishMovePreservesTheoreticalResult: stockfishPreserves,
        acceptedPreservingMoves: acceptedPreserving,
        tablebaseWdlPreservingMoves: tablebase.wdlPreservingMoves,
        tablebaseDtzOptimalMoves: tablebase.dtzOptimalMoves,
        currentOnlyMoveDefensibleTechnically: position.objective.type !== 'only-move' || preserving.size === 1,
        requiresHumanInterpretation: true
    };
}
