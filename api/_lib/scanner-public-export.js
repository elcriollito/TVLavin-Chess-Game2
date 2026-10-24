import { eligiblePublicExport, latestCertification } from '../../scanner/public/scanner-public-contract.js';

export function buildPublicFeedbackExport(records) {
  const rows = [];
  const rejected = [];
  for (const item of records || []) {
    const record = item.record || item;
    const history = item.certifications || record.certifications || [];
    if (!eligiblePublicExport(record, history)) {
      rejected.push({ feedbackId: record.feedbackId || record.feedback_id, reason: 'GOVERNANCE_GATE_FAILED' });
      continue;
    }
    const decision = latestCertification(history);
    rows.push(Object.freeze({
      feedbackId: record.feedbackId || record.feedback_id,
      targetCorpus: decision.targetCorpus || decision.target_corpus,
      certificationVersion: decision.certificationVersion || decision.certification_version,
      certifiedBy: decision.certifiedBy || decision.certified_by,
      certifiedAt: decision.certifiedAt || decision.certified_at,
      imageStorageReference: record.imageStorageReference || record.image_storage_reference,
      evidenceFingerprint: record.evidenceFingerprint || record.evidence_fingerprint,
      feedback: record.payload || record
    }));
  }
  return Object.freeze({ dryRun: true, eligible: Object.freeze(rows), rejected: Object.freeze(rejected) });
}
