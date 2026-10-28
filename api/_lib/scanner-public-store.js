import { getSupabase } from './supabase.js';

function sanitizedDatabaseError(error, fallback) {
  const message = String(error?.message || '').toUpperCase();
  const known = message.match(/\b(?:IMAGE|RESULTS|SCANNER_CONSENT)_[A-Z0-9_]{1,72}\b/)?.[0];
  return known || `${fallback}_${error?.code || 'ERROR'}`;
}

function checked(result, code) {
  if (result?.error) throw new Error(sanitizedDatabaseError(result.error, code));
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
    async putFeedback({
      userId,
      feedback,
      payloadHash,
      imageUploadId,
      evidenceFingerprint,
      resultsConsentVersion,
      consentSource
    }) {
      return checked(await client.rpc('submit_scanner_public_feedback_v03', {
        p_user_id: userId,
        p_feedback: feedback,
        p_payload_hash: payloadHash,
        p_image_upload_id: imageUploadId || null,
        p_evidence_fingerprint: evidenceFingerprint,
        p_results_consent_version: resultsConsentVersion,
        p_consent_source: consentSource
      }), 'SCANNER_PUBLIC_FEEDBACK');
    },
    async reserveImageUpload(value) {
      return checked(await client.rpc('reserve_scanner_public_image_upload_v04', {
        p_user_id: value.userId,
        p_upload_id: value.uploadId,
        p_scan_id: value.scanId,
        p_feedback_id: value.feedbackId || null,
        p_purpose: value.purpose,
        p_consent_version: value.consentVersion,
        p_consent_source: value.consentSource,
        p_rights_attestation: value.rightsAttestation,
        p_image_hash: value.imageHash,
        p_byte_size: value.byteSize,
        p_content_type: value.contentType,
        p_ttl_seconds: value.ttlSeconds,
        p_user_max_active_uploads: value.userMaxActiveUploads,
        p_user_max_bytes: value.userMaxBytes,
        p_project_max_bytes: value.projectMaxBytes
      }), 'SCANNER_PUBLIC_IMAGE_RESERVE');
    },
    async claimImageUpload({ userId, uploadId, imageHash, byteSize, contentType }) {
      return checked(await client.rpc('claim_scanner_public_image_upload', {
        p_user_id: userId,
        p_upload_id: uploadId,
        p_image_hash: imageHash,
        p_byte_size: byteSize,
        p_content_type: contentType
      }), 'SCANNER_PUBLIC_IMAGE_CLAIM');
    },
    async putImage({ objectKey, bytes, contentType }) {
      const result = await client.storage.from('scanner-public-feedback-images').upload(objectKey, bytes, {
        contentType,
        upsert: false,
        cacheControl: '0'
      });
      if (result.error && String(result.error.statusCode) !== '409') {
        throw new Error(`SCANNER_PUBLIC_IMAGE_${result.error.statusCode || 'ERROR'}`);
      }
      return `supabase://scanner-public-feedback-images/${objectKey}`;
    },
    async completeImageUpload({ userId, uploadId, storageReference }) {
      return checked(await client.rpc('complete_scanner_public_image_upload_v03', {
        p_user_id: userId,
        p_upload_id: uploadId,
        p_storage_reference: storageReference
      }), 'SCANNER_PUBLIC_IMAGE_COMPLETE');
    },
    async failImageUpload({ userId, uploadId, failureCode }) {
      return checked(await client.rpc('fail_scanner_public_image_upload', {
        p_user_id: userId,
        p_upload_id: uploadId,
        p_failure_code: failureCode
      }), 'SCANNER_PUBLIC_IMAGE_FAIL');
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
