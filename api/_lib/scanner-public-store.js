import { getSupabase } from './supabase.js';

function checked(result, code) {
  if (result?.error) throw new Error(`${code}_${result.error.code || 'ERROR'}`);
  return Array.isArray(result?.data) ? result.data[0] : result?.data;
}

function mapCertification(row) {
  return {
    id: row.id,
    feedbackId: row.feedback_id,
    action: row.action,
    certifiedBy: row.certified_by,
    certifiedAt: row.certified_at,
    certificationVersion: row.certification_version,
    notes: row.certification_notes,
    targetCorpus: row.target_corpus,
    trainingEligible: row.training_eligible,
    reasonCodes: row.reason_codes || [],
    duplicateOf: row.duplicate_of
  };
}

function mapRaw(row) {
  return {
    feedbackId: row.feedback_id,
    scanId: row.scan_id,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    feedbackType: row.feedback_type,
    sourceTrust: row.source_trust,
    certificationStatus: row.certification_status,
    platform: row.platform,
    captureType: row.capture_type,
    modelVersion: row.model_version,
    localizationVersion: row.localization_version,
    imageStorageReference: row.image_storage_reference,
    duplicateSuspected: row.duplicate_suspected,
    evidenceFingerprint: row.evidence_fingerprint,
    payloadHash: row.payload_hash,
    payload: row.payload
  };
}

export function createScannerPublicSupabaseStore(client = getSupabase()) {
  return Object.freeze({
    async putScan({ userId, snapshot, snapshotHash, metadata }) {
      return checked(await client.rpc('submit_scanner_public_scan', {
        p_user_id: userId || null,
        p_snapshot: snapshot,
        p_snapshot_hash: snapshotHash,
        p_metadata: metadata
      }), 'SCANNER_PUBLIC_SCAN');
    },
    async getScan(scanId) {
      return checked(await client.from('scanner_public_scans')
        .select('scan_id,submitted_by,snapshot,snapshot_hash')
        .eq('scan_id', scanId).maybeSingle(), 'SCANNER_PUBLIC_SCAN_READ');
    },
    async putFeedback({ userId, feedback, payloadHash, imageStorageReference, evidenceFingerprint }) {
      return checked(await client.rpc('submit_scanner_public_feedback', {
        p_user_id: userId,
        p_feedback: feedback,
        p_payload_hash: payloadHash,
        p_image_storage_reference: imageStorageReference || null,
        p_evidence_fingerprint: evidenceFingerprint
      }), 'SCANNER_PUBLIC_FEEDBACK');
    },
    async putImage({ userId, imageHash, bytes, contentType }) {
      const key = `${userId}/${imageHash.slice(0, 2)}/${imageHash}`;
      const result = await client.storage.from('scanner-public-feedback-images').upload(key, bytes, {
        contentType,
        upsert: false,
        cacheControl: '0'
      });
      if (result.error && String(result.error.statusCode) !== '409') {
        throw new Error(`SCANNER_PUBLIC_IMAGE_${result.error.statusCode || 'ERROR'}`);
      }
      return `supabase://scanner-public-feedback-images/${key}`;
    },
    async listFeedback({ limit = 50 } = {}) {
      const { data, error } = await client.from('scanner_public_feedback_raw').select('*')
        .order('submitted_at', { ascending: false }).limit(Math.min(100, Math.max(1, limit)));
      if (error) throw new Error('SCANNER_PUBLIC_REVIEW_LIST');
      const rows = (data || []).map(mapRaw);
      if (!rows.length) return [];
      const ids = rows.map(row => row.feedbackId);
      const history = await client.from('scanner_feedback_certifications').select('*').in('feedback_id', ids)
        .order('certified_at', { ascending: false });
      if (history.error) throw new Error('SCANNER_PUBLIC_CERTIFICATION_READ');
      const grouped = Object.groupBy
        ? Object.groupBy((history.data || []).map(mapCertification), item => item.feedbackId)
        : (history.data || []).map(mapCertification).reduce((result, item) => {
          (result[item.feedbackId] ||= []).push(item); return result;
        }, {});
      return rows.map(row => ({ ...row, certifications: grouped[row.feedbackId] || [] }));
    },
    async getFeedback(feedbackId) {
      const raw = checked(await client.from('scanner_public_feedback_raw').select('*')
        .eq('feedback_id', feedbackId).maybeSingle(), 'SCANNER_PUBLIC_REVIEW_READ');
      if (!raw) return null;
      const history = await client.from('scanner_feedback_certifications').select('*')
        .eq('feedback_id', feedbackId).order('certified_at', { ascending: false });
      if (history.error) throw new Error('SCANNER_PUBLIC_CERTIFICATION_READ');
      return { ...mapRaw(raw), certifications: (history.data || []).map(mapCertification) };
    },
    async addCertification(decision) {
      const row = checked(await client.rpc('record_scanner_feedback_certification', {
        p_decision: decision
      }), 'SCANNER_PUBLIC_CERTIFICATION_WRITE');
      return row ? mapCertification(row) : null;
    },
    async recordReviewEvent({ feedbackId, reviewerId, eventType }) {
      return checked(await client.rpc('record_scanner_feedback_review_event', {
        p_feedback_id: feedbackId,
        p_reviewer_id: reviewerId,
        p_event_type: eventType
      }), 'SCANNER_PUBLIC_REVIEW_AUDIT');
    },
    async signedImage(reference, expiresIn = 60) {
      const match = String(reference || '').match(/^supabase:\/\/scanner-public-feedback-images\/(.+)$/);
      if (!match) throw new Error('IMAGE_REFERENCE_INVALID');
      const result = await client.storage.from('scanner-public-feedback-images').createSignedUrl(match[1], expiresIn);
      if (result.error) throw new Error('SCANNER_PUBLIC_IMAGE_ACCESS');
      return { signedUrl: result.data.signedUrl, expiresIn };
    }
  });
}
