import { ChessRulesFacade } from '../chess-rules-facade.js';

export const CURATED_POSITION_SCHEMA_VERSION = '1.0.0';
export const CURATED_POOL_SCHEMA_VERSION = '1.0.0';
export const CURATED_POOL_CONTRACT_VERSION = '1.0.0';
export const CURATED_POOL_ERROR_VERSION = '1.0.0';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECTIVES = new Set(['only-move', 'authored-move']);
const DIFFICULTIES = new Set(['foundation', 'developing', 'intermediate']);
const VERIFICATION_STATES = new Set([
    'draft', 'legality-verified', 'rules-verified', 'engine-reviewed',
    'tablebase-verified', 'editorially-approved', 'published', 'retired'
]);

export class CuratedPoolValidationError extends Error {
    constructor(errors) {
        super('curated-pool-invalid');
        this.name = 'CuratedPoolValidationError';
        this.code = 'curated-pool-invalid';
        this.version = CURATED_POOL_ERROR_VERSION;
        this.errors = Object.freeze(errors.map((error) => Object.freeze({ ...error })));
    }
}

function issue(code, path, detail = null) {
    return Object.freeze({ code, path, detail });
}

function plainText(value, maximum = 300) {
    return typeof value === 'string' && value.trim() === value && value.length > 0 &&
        value.length <= maximum && !/[<>]/.test(value);
}

function kingGeometry(rules) {
    const kings = rules.pieces().filter(({ type }) => type === 'k');
    if (kings.length !== 2 || new Set(kings.map(({ color }) => color)).size !== 2) return false;
    const [first, second] = kings.map(({ square }) => ({
        file: square.charCodeAt(0) - 97,
        rank: Number(square[1]) - 1
    }));
    return Math.max(Math.abs(first.file - second.file), Math.abs(first.rank - second.rank)) > 1;
}

function normalizeMove(fen, response) {
    try {
        const rules = ChessRulesFacade.fromFen(fen);
        const move = rules.move(response);
        return Object.freeze({
            lan: `${move.from}${move.to}${move.promotion || ''}`,
            san: move.san
        });
    } catch {
        return null;
    }
}

function validatePosition(position, path, { authored }) {
    const errors = [];
    if (!position || typeof position !== 'object') return [issue('position-required', path)];
    if (position.schemaVersion !== CURATED_POSITION_SCHEMA_VERSION)
        errors.push(issue('unsupported-position-schema', `${path}.schemaVersion`));
    if (!ID_PATTERN.test(position.positionId || '')) errors.push(issue('invalid-position-id', `${path}.positionId`));
    if (!plainText(position.title, 100)) errors.push(issue('invalid-title', `${path}.title`));
    if (!plainText(position.theme, 80)) errors.push(issue('invalid-theme', `${path}.theme`));
    if (!OBJECTIVES.has(position.objective?.type)) errors.push(issue('unsupported-objective', `${path}.objective.type`));
    if (position.objective?.evaluator !== 'authored-exact-legal-move')
        errors.push(issue('objective-evaluator-mismatch', `${path}.objective.evaluator`));
    if (!plainText(position.fen, 120)) errors.push(issue('unsafe-fen', `${path}.fen`));
    const fenResult = ChessRulesFacade.validateFen(position.fen);
    let rules = null;
    if (!fenResult.valid) errors.push(issue('invalid-fen', `${path}.fen`));
    else {
        rules = ChessRulesFacade.fromFen(position.fen);
        if (!kingGeometry(rules)) errors.push(issue('invalid-king-geometry', `${path}.fen`));
        if (rules.isGameOver()) errors.push(issue('terminal-position', `${path}.fen`));
        if (rules.sideToMove() !== position.sideToMove) errors.push(issue('side-to-move-mismatch', `${path}.sideToMove`));
    }
    const expected = rules ? normalizeMove(position.fen, position.expectedMove) : null;
    if (!expected) errors.push(issue('illegal-expected-move', `${path}.expectedMove`));
    else {
        if (position.expectedLan && position.expectedLan !== expected.lan)
            errors.push(issue('expected-lan-mismatch', `${path}.expectedLan`));
        if (position.expectedSan && position.expectedSan !== expected.san)
            errors.push(issue('expected-san-mismatch', `${path}.expectedSan`));
    }
    const alternatives = Array.isArray(position.acceptedAlternatives) ? position.acceptedAlternatives : [];
    if (!Array.isArray(position.acceptedAlternatives)) errors.push(issue('alternatives-required', `${path}.acceptedAlternatives`));
    const normalized = new Set(expected ? [expected.lan] : []);
    alternatives.forEach((alternative, index) => {
        const response = typeof alternative === 'object' ? (alternative.lan || alternative.san) : alternative;
        const move = rules ? normalizeMove(position.fen, response) : null;
        if (!move) errors.push(issue('illegal-accepted-alternative', `${path}.acceptedAlternatives[${index}]`));
        else if (normalized.has(move.lan)) errors.push(issue('duplicate-accepted-alternative', `${path}.acceptedAlternatives[${index}]`));
        else normalized.add(move.lan);
    });
    const hints = Array.isArray(position.hintStages) ? position.hintStages : [];
    if (!hints.length) errors.push(issue('hint-stage-required', `${path}.hintStages`));
    hints.forEach((hint, index) => {
        if (hint?.stage !== index + 1 || !plainText(hint?.text, 240) ||
            !['none', 'removes-independent'].includes(hint?.independenceImpact) ||
            ![0, 50].includes(hint?.scorePercent) || hint?.answerReveal !== false)
            errors.push(issue('invalid-hint-stage', `${path}.hintStages[${index}]`));
    });
    if (!DIFFICULTIES.has(position.difficulty?.band) ||
        position.difficulty?.basis !== 'editorial-estimate')
        errors.push(issue('invalid-difficulty', `${path}.difficulty`));
    const verification = position.verification;
    if (!verification || !VERIFICATION_STATES.has(verification.state))
        errors.push(issue('invalid-verification-state', `${path}.verification.state`));
    if (verification?.tablebaseVerified === true && !plainText(verification.tablebaseReference, 200))
        errors.push(issue('unsubstantiated-tablebase-claim', `${path}.verification.tablebaseReference`));
    if (verification?.publicationEligible !== true || verification?.editorialApproved !== true)
        errors.push(issue('position-not-publication-eligible', `${path}.verification`));
    if (position.eligibility?.previewScore !== true ||
        position.eligibility?.personalBest !== false ||
        position.eligibility?.futureLeaderboard !== false)
        errors.push(issue('invalid-score-eligibility', `${path}.eligibility`));
    if (!plainText(position.provenance?.sourceType, 50) ||
        !plainText(position.provenance?.sourceReference, 240) ||
        !plainText(position.provenance?.releaseId, 100))
        errors.push(issue('missing-provenance', `${path}.provenance`));
    if (!plainText(position.feedback?.correct, 240) ||
        !plainText(position.feedback?.incorrect, 240))
        errors.push(issue('invalid-feedback', `${path}.feedback`));
    if (authored && (!position.editorial || !plainText(position.editorial.reviewedByRole, 80)))
        errors.push(issue('missing-editorial-review', `${path}.editorial`));
    return errors;
}

export function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function computeCompatibilityFingerprint(value) {
    const text = stableStringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `epool-fnv1a32-${hash.toString(16).padStart(8, '0')}`;
}

export function validateAuthoredPoolSource(source, { throwOnError = false } = {}) {
    const errors = [];
    if (!source || typeof source !== 'object') errors.push(issue('source-required', '$'));
    else {
        if (source.schemaVersion !== CURATED_POOL_SCHEMA_VERSION)
            errors.push(issue('unsupported-pool-schema', '$.schemaVersion'));
        if (!ID_PATTERN.test(source.poolId || '')) errors.push(issue('invalid-pool-id', '$.poolId'));
        if (!/^\d+\.\d+\.\d+$/.test(source.poolVersion || ''))
            errors.push(issue('invalid-pool-version', '$.poolVersion'));
        if (source.poolVersion === 'latest') errors.push(issue('mutable-version-forbidden', '$.poolVersion'));
        if (!plainText(source.label, 100) || !plainText(source.description, 240))
            errors.push(issue('invalid-pool-copy', '$'));
        if (!Array.isArray(source.positions) || source.positions.length === 0)
            errors.push(issue('empty-pool', '$.positions'));
        const ids = new Set();
        (source.positions || []).forEach((position, index) => {
            if (ids.has(position?.positionId)) errors.push(issue('duplicate-position-id', `$.positions[${index}].positionId`));
            ids.add(position?.positionId);
            errors.push(...validatePosition(position, `$.positions[${index}]`, { authored: true }));
        });
    }
    if (throwOnError && errors.length) throw new CuratedPoolValidationError(errors);
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function artifactFingerprintInput(artifact) {
    const { contentFingerprint: _fingerprint, ...input } = artifact;
    return input;
}

export function validatePublishedPoolArtifact(artifact, expected = {}, { throwOnError = false } = {}) {
    const errors = [];
    if (!artifact || typeof artifact !== 'object') errors.push(issue('artifact-required', '$'));
    else {
        if (artifact.schemaVersion !== CURATED_POOL_SCHEMA_VERSION)
            errors.push(issue('unsupported-pool-schema', '$.schemaVersion'));
        if (artifact.contractVersion !== CURATED_POOL_CONTRACT_VERSION)
            errors.push(issue('unsupported-pool-contract', '$.contractVersion'));
        if (expected.poolId && artifact.poolId !== expected.poolId) errors.push(issue('pool-id-mismatch', '$.poolId'));
        if (expected.poolVersion && artifact.poolVersion !== expected.poolVersion) errors.push(issue('pool-version-mismatch', '$.poolVersion'));
        if (expected.contentFingerprint && artifact.contentFingerprint !== expected.contentFingerprint)
            errors.push(issue('registry-fingerprint-mismatch', '$.contentFingerprint'));
        const calculated = computeCompatibilityFingerprint(artifactFingerprintInput(artifact));
        if (artifact.contentFingerprint !== calculated) errors.push(issue('content-fingerprint-mismatch', '$.contentFingerprint'));
        if (artifact.positionCount !== artifact.positions?.length ||
            artifact.positionIds?.length !== artifact.positions?.length)
            errors.push(issue('pool-membership-mismatch', '$.positionCount'));
        const ids = new Set();
        (artifact.positions || []).forEach((position, index) => {
            if (ids.has(position?.positionId)) errors.push(issue('duplicate-position-id', `$.positions[${index}].positionId`));
            ids.add(position?.positionId);
            if (artifact.positionIds?.[index] !== position?.positionId)
                errors.push(issue('position-order-mismatch', `$.positionIds[${index}]`));
            errors.push(...validatePosition(position, `$.positions[${index}]`, { authored: false }));
        });
    }
    if (throwOnError && errors.length) throw new CuratedPoolValidationError(errors);
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function deepFreezePool(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const child of Object.values(value)) deepFreezePool(child);
    return Object.freeze(value);
}
