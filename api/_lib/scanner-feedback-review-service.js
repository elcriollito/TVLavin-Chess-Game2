import { createScannerFeedbackReviewAuthorizer } from './scanner-feedback-review-auth.js';
import { publicHeaders, sameOrigin } from './scanner-public-policy.js';
import { createScannerPublicSupabaseStore } from './scanner-public-store.js';
import {
  TARGET_CORPORA,
  feedbackPriority,
  latestCertification,
  validateCertificationDecision
} from '../../scanner/public/scanner-public-contract.js';

function reply(res, status, body) {
  publicHeaders(res);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res.status(status).json(body);
}

function bodyOf(req) {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > 64_000) throw new Error('PAYLOAD_TOO_LARGE');
  return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
}

function currentStatus(record) {
  return latestCertification(record.certifications)?.action || 'RAW_UNVERIFIED';
}

function counters(records) {
  const result = {
    rawInbox: records.length,
    needsReview: 0,
    certified: 0,
    held: 0,
    excluded: 0,
    eligibleForTraining: 0,
    classifierCandidates: 0,
    localizationCandidates: 0
  };
  for (const record of records) {
    const latest = latestCertification(record.certifications);
    if (!latest || ['NEEDS_FIX'].includes(latest.action)) result.needsReview += 1;
    if (latest?.action?.startsWith('CERTIFY')) result.certified += 1;
    if (latest?.action === 'HOLD') result.held += 1;
    if (latest?.action === 'EXCLUDE') result.excluded += 1;
    if (latest?.trainingEligible) result.eligibleForTraining += 1;
    if (latest?.targetCorpus === TARGET_CORPORA[0]) result.classifierCandidates += 1;
    if (latest?.targetCorpus === TARGET_CORPORA[1]) result.localizationCandidates += 1;
  }
  return result;
}

function matches(record, filters) {
  const payload = record.payload || {};
  const changedSquareCount = Number(payload.changedSquareCount || payload.changedSquares?.length || 0);
  const submittedAt = Date.parse(record.submittedAt || 0);
  const highConfidenceError = (payload.changedSquares || [])
    .some(change => Number(change.originalConfidence) >= 0.9);
  const values = {
    status: currentStatus(record),
    platform: record.platform,
    captureType: record.captureType,
    feedbackType: record.feedbackType,
    modelVersion: record.modelVersion,
    duplicate: String(record.duplicateSuspected),
    imageConsent: String(payload.consent?.shareImageForImprovement === true),
    warningType: (payload.warningCodes || []).join(',')
  };
  return Object.entries(filters).every(([key, value]) => {
    if (!value) return true;
    if (key === 'dateFrom') return submittedAt >= Date.parse(`${value}T00:00:00Z`);
    if (key === 'dateTo') return submittedAt <= Date.parse(`${value}T23:59:59.999Z`);
    if (key === 'minCorrections') return changedSquareCount >= Number(value);
    if (key === 'highConfidenceError') return String(highConfidenceError) === value;
    return String(values[key] || '').includes(value);
  });
}

function assertDecisionMatchesEvidence(decision, record) {
  const payload = record.payload || {};
  const orientationCorrection = payload.clientMetadata?.orientationCorrectionApplied === true;
  const orientationReview = payload.clientMetadata?.userOrientationOverride === true
    || payload.clientMetadata?.orientationConfidence === 'LOW_AMBIGUOUS';
  if ((orientationCorrection || orientationReview)
    && (decision.action === 'CERTIFY_CLASSIFIER_CORRECTION' || decision.trainingEligible)) {
    throw new Error('ORIENTATION_REVIEW_REQUIRED');
  }
  if (decision.action === 'CERTIFY_CLASSIFIER_CORRECTION'
    && (payload.feedbackType !== 'PIECE_CORRECTION' || payload.localizationValid !== true)) {
    throw new Error('CLASSIFIER_ROUTING_INVALID');
  }
  if (decision.action === 'CERTIFY_LOCALIZATION_FAILURE'
    && (!['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(payload.feedbackType) || payload.localizationValid !== false)) {
    throw new Error('LOCALIZATION_ROUTING_INVALID');
  }
  if (decision.trainingEligible) {
    if (payload.consent?.shareCorrectionForImprovement !== true || payload.consent?.shareImageForImprovement !== true
      || !record.imageStorageReference || record.duplicateSuspected) throw new Error('TRAINING_ELIGIBILITY_GATE_FAILED');
    if ((record.certifications || []).some(item => ['DUPLICATE', 'EXCLUDE'].includes(item.action))) {
      throw new Error('TRAINING_ELIGIBILITY_HISTORY_BLOCKED');
    }
  }
}

export function createScannerFeedbackReviewService({ store = null, authorize = null } = {}) {
  const data = () => store || createScannerPublicSupabaseStore();
  const guard = authorize || createScannerFeedbackReviewAuthorizer();
  return Object.freeze({
    async list(req, res) {
      if (req.method !== 'GET') return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      const access = await guard(req);
      if (!access.ok) return reply(res, access.status || 403, { error: access.code || 'REVIEWER_ACCESS_DENIED' });
      try {
        const url = new URL(req.url, 'https://www.caissa-chess.org');
        const filters = Object.fromEntries(['status', 'platform', 'captureType', 'feedbackType', 'modelVersion', 'duplicate', 'imageConsent', 'warningType',
          'dateFrom', 'dateTo', 'minCorrections', 'highConfidenceError']
          .map(key => [key, url.searchParams.get(key) || '']));
        const all = await data().listFeedback({ limit: Number(url.searchParams.get('limit') || 100) });
        const rows = all.filter(record => matches(record, filters)).map(record => ({
          ...record,
          priority: feedbackPriority(record),
          currentStatus: currentStatus(record)
        })).sort((left, right) => ({ high: 0, medium: 1, low: 2 }[left.priority])
          - ({ high: 0, medium: 1, low: 2 }[right.priority]));
        return reply(res, 200, { records: rows, counters: counters(all), bulkCertification: false });
      } catch (error) {
        return reply(res, 503, { error: String(error?.message || 'REVIEW_UNAVAILABLE') });
      }
    },
    async action(req, res) {
      if (req.method !== 'POST') return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (!sameOrigin(req)) return reply(res, 403, { error: 'ORIGIN_REJECTED' });
      const access = await guard(req);
      if (!access.ok) return reply(res, access.status || 403, { error: access.code || 'REVIEWER_ACCESS_DENIED' });
      try {
        const decision = validateCertificationDecision(bodyOf(req), access.user);
        const record = await data().getFeedback(decision.feedbackId);
        if (!record) throw new Error('FEEDBACK_NOT_FOUND');
        assertDecisionMatchesEvidence(decision, record);
        const saved = await data().addCertification(decision);
        return reply(res, 201, { accepted: true, decision: saved });
      } catch (error) {
        const code = String(error?.message || 'CERTIFICATION_INVALID');
        return reply(res, code.includes('NOT_FOUND') ? 404 : 400, { error: code });
      }
    },
    async audit(req, res) {
      if (req.method !== 'POST') return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (!sameOrigin(req)) return reply(res, 403, { error: 'ORIGIN_REJECTED' });
      const access = await guard(req);
      if (!access.ok) return reply(res, access.status || 403, { error: access.code || 'REVIEWER_ACCESS_DENIED' });
      try {
        const body = bodyOf(req);
        if (body.eventType !== 'CASE_OPENED' || !/^[0-9a-f-]{36}$/i.test(body.feedbackId || '')) {
          throw new Error('REVIEW_AUDIT_INVALID');
        }
        await data().recordReviewEvent({
          feedbackId: body.feedbackId,
          reviewerId: access.user.id,
          eventType: body.eventType
        });
        return reply(res, 201, { accepted: true });
      } catch (error) {
        const code = String(error?.message || 'REVIEW_AUDIT_INVALID');
        return reply(res, code.includes('NOT_FOUND') ? 404 : 400, { error: code });
      }
    },
    async image(req, res) {
      if (req.method !== 'GET') return reply(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      const access = await guard(req);
      if (!access.ok) return reply(res, access.status || 403, { error: access.code || 'REVIEWER_ACCESS_DENIED' });
      try {
        const feedbackId = new URL(req.url, 'https://www.caissa-chess.org').searchParams.get('feedbackId');
        const record = await data().getFeedback(feedbackId);
        if (!record?.imageStorageReference || record.payload?.consent?.shareImageForImprovement !== true) {
          throw new Error('IMAGE_NOT_AVAILABLE');
        }
        return reply(res, 200, await data().signedImage(record.imageStorageReference, 60));
      } catch (error) {
        return reply(res, 404, { error: String(error?.message || 'IMAGE_NOT_AVAILABLE') });
      }
    }
  });
}
