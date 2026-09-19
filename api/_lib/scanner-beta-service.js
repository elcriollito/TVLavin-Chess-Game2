import { PLATFORMS, createFeedbackRecord, createPredictionSnapshot, createScanFailureRecord } from '../../scanner/beta/scanner-beta-contract.js';
import { SCANNER_BETA, betaEnabled, privateHeaders, sameOrigin, sha256, stableJson } from './scanner-beta-policy.js';
import { createScannerBetaSupabaseStore } from './scanner-beta-store.js';
import { createBetaProgramService } from './beta-program-service.js';

function reply(res, status, body) {
  privateHeaders(res);
  return res.status(status).json(body);
}

function jsonBody(req) {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > SCANNER_BETA.maxJsonBytes) throw new Error('PAYLOAD_TOO_LARGE');
  return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
}

function failStatus(code) {
  if (code === 'PAYLOAD_TOO_LARGE') return 413;
  if (/MISMATCH|IMMUTABLE|CONFLICT/.test(code)) return 409;
  return 400;
}

function scanMetadata(value) {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (metadata.platform != null && !PLATFORMS.includes(metadata.platform)) throw new Error('PLATFORM_INVALID');
  if (metadata.captureType != null && !['camera', 'gallery', 'screenshot', 'photo-of-screen'].includes(metadata.captureType)) {
    throw new Error('CAPTURE_TYPE_INVALID');
  }
  const consent = metadata.consent || { shareImageForImprovement: false, shareCorrectionForImprovement: false };
  if (typeof consent.shareImageForImprovement !== 'boolean' || typeof consent.shareCorrectionForImprovement !== 'boolean') {
    throw new Error('CONSENT_INVALID');
  }
  if (metadata.imageStorageReference != null && !/^(?:external-file:\/\/[A-F0-9]{2}\/[A-F0-9]{64}\.(?:jpg|png|webp)|supabase:\/\/scanner-beta-images\/[A-F0-9]{2}\/[A-F0-9]{64})$/.test(metadata.imageStorageReference)) {
    throw new Error('IMAGE_STORAGE_REFERENCE_INVALID');
  }
  if (metadata.clientMetadata != null && (typeof metadata.clientMetadata !== 'object' || Array.isArray(metadata.clientMetadata))) {
    throw new Error('CLIENT_METADATA_INVALID');
  }
  return {
    ...metadata,
    consent,
    clientMetadata: { ...(metadata.clientMetadata || {}), experimentId: 'scanner', betaStage: 'internal-beta' }
  };
}

export function createScannerBetaService({ store = null, env = process.env, authorizeExperiment = null } = {}) {
  const data = () => store || createScannerBetaSupabaseStore();
  const authorize = authorizeExperiment || createBetaProgramService({ env }).authorizeExperiment;
  const guard = async (req, res) => {
    if (!betaEnabled(env)) { reply(res, 404, { error: 'BETA_DISABLED' }); return false; }
    if (req.method !== 'POST' && req.method !== 'PUT') { reply(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return false; }
    if (!sameOrigin(req)) { reply(res, 403, { error: 'ORIGIN_REJECTED' }); return false; }
    const access = await authorize(req, 'scanner');
    if (!access?.ok) { reply(res, access?.status || 403, { error: access?.code || 'BETA_ACCESS_DENIED' }); return null; }
    if (!access.user?.id) { reply(res, 503, { error: 'BETA_IDENTITY_UNAVAILABLE' }); return null; }
    return access;
  };
  return Object.freeze({
    async status(req, res) {
      privateHeaders(res);
      if (!betaEnabled(env)) return res.status(404).json({ available: false });
      const access = await authorize(req, 'scanner');
      if (!access?.ok) return res.status(access?.status || 403).json({ available: false, error: access?.code || 'BETA_ACCESS_DENIED' });
      return res.status(200).json({ available: true, stage: 'internal' });
    },
    async scan(req, res) {
      const access = await guard(req, res); if (!access) return;
      try {
        const body = jsonBody(req);
        const snapshot = createPredictionSnapshot(body.snapshot);
        const snapshotHash = sha256(stableJson(snapshot));
        const metadata = scanMetadata(body.metadata);
        const result = await data().putScan({ userId: access.user.id, snapshot, snapshotHash, metadata });
        return reply(res, 200, { accepted: true, duplicate: result?.duplicate === true, scanId: snapshot.scanId, snapshotHash });
      } catch (error) {
        const code = String(error?.message || 'INVALID_SCAN');
        return reply(res, failStatus(code), { error: code });
      }
    },
    async feedback(req, res) {
      const access = await guard(req, res); if (!access) return;
      try {
        const body = jsonBody(req);
        const source = await data().getScan(body.feedback?.scanId, access.user.id);
        if (!source?.snapshot) throw new Error('SCAN_NOT_FOUND');
        const record = createFeedbackRecord({ ...body.feedback, snapshot: source.snapshot,
          clientMetadata: { ...(body.feedback?.clientMetadata || {}), experimentId: 'scanner', betaStage: 'internal-beta' } });
        const payloadHash = sha256(stableJson(record));
        const result = await data().putFeedback({ userId: access.user.id, feedback: record, payloadHash });
        return reply(res, 200, { accepted: true, duplicate: result?.duplicate === true,
          feedbackId: record.feedbackId, changedSquareCount: record.changedSquareCount, payloadHash });
      } catch (error) {
        const code = String(error?.message || 'INVALID_FEEDBACK');
        return reply(res, failStatus(code), { error: code });
      }
    },
    async failure(req, res) {
      const access = await guard(req, res); if (!access) return;
      try {
        const body = jsonBody(req);
        const record = createScanFailureRecord({ ...(body.failure || {}),
          clientMetadata: { ...(body.failure?.clientMetadata || {}), experimentId: 'scanner', betaStage: 'internal-beta' } });
        const payloadHash = sha256(stableJson(record));
        const result = await data().putFailure({ userId: access.user.id, failure: record, payloadHash });
        return reply(res, 200, { accepted: true, duplicate: result?.duplicate === true,
          feedbackId: record.feedbackId, scanId: record.scanId, payloadHash });
      } catch (error) {
        const code = String(error?.message || 'INVALID_SCAN_FAILURE');
        return reply(res, failStatus(code), { error: code });
      }
    },
    async image(req, res) {
      if (!await guard(req, res)) return;
      try {
        const contentType = String(req.headers['content-type'] || '').split(';')[0];
        if (!SCANNER_BETA.imageTypes.includes(contentType)) throw new Error('IMAGE_TYPE_INVALID');
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
        if (!bytes.length || bytes.length > SCANNER_BETA.maxImageBytes) throw new Error('IMAGE_SIZE_INVALID');
        const imageHash = sha256(bytes);
        if (String(req.headers['x-caissa-image-sha256'] || '').toUpperCase() !== imageHash) throw new Error('IMAGE_HASH_MISMATCH');
        const reference = await data().putImage({ imageHash, bytes, contentType });
        return reply(res, 200, { accepted: true, imageHash, imageStorageReference: reference });
      } catch (error) {
        const code = String(error?.message || 'INVALID_IMAGE');
        return reply(res, failStatus(code), { error: code });
      }
    }
  });
}
