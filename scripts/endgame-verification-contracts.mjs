import { createHash } from 'node:crypto';
import { stableStringify } from '../js/endgame-trainer/v2/curated-pool-validator.js';

export const EVIDENCE_SCHEMA_VERSION = '1.0.0';
export const REVIEW_WORKFLOW_VERSION = '1.0.0';
export const REVIEW_STATES = Object.freeze([
    'draft', 'author-reviewed', 'chess-review-required', 'chess-reviewed',
    'verification-required', 'verified', 'editorially-approved',
    'publish-ready', 'published', 'rejected', 'retired'
]);
export const EVIDENCE_TYPES = Object.freeze([
    'legality', 'authored-answer-legality', 'engine-review', 'tablebase',
    'human-chess-review', 'editorial-approval'
]);

export const reviewablePoolContent = (source) => ({
    poolId: source.poolId,
    poolVersion: source.poolVersion,
    positions: source.positions.map((position) => ({
        positionId: position.positionId,
        fen: position.fen,
        objective: position.objective,
        expectedMove: position.expectedMove,
        acceptedAlternatives: position.acceptedAlternatives,
        hintStages: position.hintStages,
        provenance: position.provenance
    }))
});

export const nodeSha256 = (value) =>
    `sha256-${createHash('sha256').update(stableStringify(value), 'utf8').digest('hex')}`;

export function validateReviewBundle(source, bundle) {
    const errors = [];
    const expectedDigest = nodeSha256(reviewablePoolContent(source));
    if (bundle?.reviewWorkflowVersion !== REVIEW_WORKFLOW_VERSION) errors.push('unsupported-review-workflow');
    if (bundle?.poolId !== source.poolId || bundle?.poolVersion !== source.poolVersion) errors.push('review-pool-mismatch');
    if (bundle?.reviewedContentDigest !== expectedDigest) errors.push('stale-review-approval');
    if (!Array.isArray(bundle?.positionReviews) || bundle.positionReviews.length !== source.positions.length)
        errors.push('incomplete-position-reviews');
    const reviews = new Map((bundle?.positionReviews || []).map((review) => [review.positionId, review]));
    for (const position of source.positions) {
        const review = reviews.get(position.positionId);
        if (!review || review.reviewStatus !== 'publish-ready') errors.push(`position-not-publish-ready:${position.positionId}`);
        if (!review?.authorReview || !review?.chessReview || !review?.editorialApproval)
            errors.push(`incomplete-review:${position.positionId}`);
        for (const field of ['authorReview', 'chessReview', 'editorialApproval']) {
            const record = review?.[field];
            if (!record?.reviewerReference || !record?.reviewRole || !record?.reviewRevision)
                errors.push(`invalid-${field}:${position.positionId}`);
        }
    }
    if (errors.length) throw Object.assign(new Error('review-validation-failed'), { code: 'review-validation-failed', errors });
    return { valid: true, reviewedContentDigest: expectedDigest };
}

export function validateEvidenceRecord(record) {
    const required = ['positionId', 'positionContentFingerprint', 'evidenceType',
        'evidenceVersion', 'toolOrReviewer', 'result', 'inputFingerprint', 'outputFingerprint'];
    return record?.evidenceSchemaVersion === EVIDENCE_SCHEMA_VERSION &&
        EVIDENCE_TYPES.includes(record.evidenceType) &&
        required.every((field) => record[field] !== undefined && record[field] !== '');
}
