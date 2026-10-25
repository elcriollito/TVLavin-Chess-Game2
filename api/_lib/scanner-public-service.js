import { authenticateRequest } from './auth.js';
import { createBetaProgramStore } from './beta-program-store.js';
import { checkRateLimit } from './rate-limit.js';
import { sha256, stableJson } from './scanner-beta-policy.js';
import {
  SCANNER_PUBLIC,
  mutationRatePolicy,
  publicHeaders,
  publicScannerEnabled,
  sameOrigin
} from './scanner-public-policy.js';
import { createScannerPublicSupabaseStore } from './scanner-public-store.js';
import {
  MODEL,
  PLATFORMS,
  PUBLIC_FEEDBACK,
  createPublicFeedbackRecord,
  createPublicPredictionSnapshot,
  createPublicScanFailureRecord
} from '../../scanner/public/scanner-public-contract.js';

const LOCALIZATION_VERSION = 'caissa-scanner-board-localizer/4';
const CAPTURE_TYPES = Object.freeze(['camera', 'gallery', 'screenshot', 'photo-of-screen']);

function reply(res, status, body) {
  publicHeaders(res);
  return res.status(status).json(body);
}

function jsonBody(req) {
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > SCANNER_PUBLIC.maxJsonBytes) throw new Error('PAYLOAD_TOO_LARGE');
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { throw new Error('INVALID_JSON'); }
}

function failStatus(code) {
  if (code === 'PAYLOAD_TOO_LARGE') return 413;
  if (/AUTH_REQUIRED/.test(code)) return 401;
  if (/MISMATCH|IMMUTABLE|CONFLICT/.test(code)) return 409;
  if (/NOT_FOUND/.test(code)) return 404;
  return 400;
}

function metadataOf(value) {
  const metadata = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  if (metadata.platform != null && !PLATFORMS.includes(metadata.platform)) throw new Error('PLATFORM_INVALID');
  if (metadata.captureType != null && !CAPTURE_TYPES.includes(metadata.captureType)) throw new Error('CAPTURE_TYPE_INVALID');
  if (metadata.localizationVersion !== LOCALIZATION_VERSION) throw new Error('LOCALIZATION_VERSION_MISMATCH');
  if (metadata.clientMetadata != null && (typeof metadata.clientMetadata !== 'object' || Array.isArray(metadata.clientMetadata))) {
    throw new Error('CLIENT_METADATA_INVALID');
  }
  return {
    platform: metadata.platform || null,
    captureType: metadata.captureType || null,
    localizationVersion: LOCALIZATION_VERSION,
    clientMetadata: metadata.clientMetadata || {}
  };
}

function validImageReference(reference, userId) {
  if (reference == null) return null;
  const pattern = new RegExp(`^supabase://scanner-public-feedback-images/${String(userId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[A-F0-9]{2}/[A-F0-9]{64}$`);
  if (!pattern.test(reference)) throw new Error('IMAGE_STORAGE_REFERENCE_INVALID');
  return Object.freeze({ reference, imageHash: reference.slice(-64) });
}

function detectedImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function evidenceFingerprint(record) {
  return sha256(stableJson({
    feedbackType: record.feedbackType,
    imageHash: record.imageHash || record.clientMetadata?.imageHash || null,
    modelVersion: record.modelVersion,
    originalFEN: record.originalFEN,
    correctedFEN: record.correctedFEN,
    localizationValid: record.localizationValid
  }));
}

export function createScannerPublicService({
  store = null,
  userStore = null,
  authenticate = authenticateRequest,
  rateLimit = checkRateLimit,
  env = process.env
} = {}) {
  const data = () => store || createScannerPublicSupabaseStore();
  const users = () => userStore || createBetaProgramStore();

  async function identity(req, required) {
    const auth = await authenticate(req);
    if (!auth.authenticated) {
      const credentialPresented = Boolean(req.headers?.authorization || req.headers?.Authorization);
      if (credentialPresented) throw new Error('AUTH_REQUIRED');
      if (required) throw new Error(auth.code === 'INVALID_TOKEN' ? 'AUTH_REQUIRED' : (auth.code || 'AUTH_REQUIRED'));
      return null;
    }
    const user = await users().getUserByClerkId(auth.userId);
    if (!user && required) throw new Error('AUTH_ACCOUNT_REQUIRED');
    return user || null;
  }

  async function guard(req, res, { methods = ['POST'], auth = false, rateKind = null } = {}) {
    if (!publicScannerEnabled(env)) { reply(res, 404, { error: 'PUBLIC_BETA_DISABLED' }); return false; }
    if (!methods.includes(req.method)) { reply(res, 405, { error: 'METHOD_NOT_ALLOWED' }); return false; }
    if (!sameOrigin(req)) { reply(res, 403, { error: 'ORIGIN_REJECTED' }); return false; }
    try {
      const user = await identity(req, auth);
      if (rateKind) {
        const policy = mutationRatePolicy(rateKind, user, req, env);
        const allowance = rateLimit(policy.identifier, { windowMs: 60_000, max: policy.max, prefix: policy.prefix });
        res.setHeader('X-RateLimit-Limit', String(policy.max));
        res.setHeader('X-RateLimit-Remaining', String(allowance.remaining));
        if (!allowance.allowed) {
          res.setHeader('Retry-After', String(allowance.retryAfter || 60));
          reply(res, 429, { error: 'RATE_LIMITED', retryAfter: allowance.retryAfter || 60 });
          return false;
        }
      }
      return { user };
    }
    catch (error) { reply(res, failStatus(String(error.message)), { error: String(error.message) }); return false; }
  }

  return Object.freeze({
    async status(req, res) {
      publicHeaders(res);
      if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
      return res.status(200).json({
        available: publicScannerEnabled(env),
        stage: 'public-beta',
        modelVersion: MODEL.version,
        localizationVersion: LOCALIZATION_VERSION,
        supportedImageTypes: [...SCANNER_PUBLIC.imageTypes]
      });
    },
    async scan(req, res) {
      const access = await guard(req, res, { rateKind: 'scan' }); if (!access) return;
      try {
        const body = jsonBody(req);
        const snapshot = createPublicPredictionSnapshot(body.snapshot);
        const snapshotHash = sha256(stableJson(snapshot));
        const metadata = metadataOf(body.metadata);
        const result = await data().putScan({ userId: access.user?.id || null, snapshot, snapshotHash, metadata });
        return reply(res, 200, { accepted: true, duplicate: result?.duplicate === true, scanId: snapshot.scanId, snapshotHash });
      } catch (error) {
        const code = String(error?.message || 'INVALID_SCAN');
        return reply(res, failStatus(code), { error: code });
      }
    },
    async feedback(req, res) {
      const access = await guard(req, res, { auth: true, rateKind: 'feedback' }); if (!access) return;
      try {
        const body = jsonBody(req);
        const source = await data().getScan(body.feedback?.scanId);
        if (!source?.snapshot) throw new Error('SCAN_NOT_FOUND');
        if (source.submitted_by && source.submitted_by !== access.user.id) throw new Error('FEEDBACK_SCAN_OWNERSHIP_INVALID');
        const record = createPublicFeedbackRecord({
          ...body.feedback,
          snapshot: source.snapshot,
          clientMetadata: {
            ...(body.feedback?.clientMetadata || {}),
            sourceTrust: PUBLIC_FEEDBACK.sourceTrust,
            localizationVersion: LOCALIZATION_VERSION
          }
        });
        const imageReference = validImageReference(body.imageStorageReference, access.user.id);
        if (imageReference && record.consent.shareImageForImprovement !== true) throw new Error('IMAGE_CONSENT_REQUIRED');
        if (imageReference && imageReference.imageHash !== source.snapshot.imageHash) throw new Error('IMAGE_EVIDENCE_HASH_MISMATCH');
        const payloadHash = sha256(stableJson(record));
        const result = await data().putFeedback({
          userId: access.user.id,
          feedback: record,
          payloadHash,
          imageStorageReference: imageReference?.reference || null,
          evidenceFingerprint: evidenceFingerprint(record)
        });
        return reply(res, 200, {
          accepted: true,
          duplicate: result?.duplicate === true,
          duplicateSuspected: result?.duplicate_suspected === true,
          feedbackId: record.feedbackId,
          certificationStatus: 'raw-unverified',
          payloadHash
        });
      } catch (error) {
        const code = String(error?.message || 'INVALID_FEEDBACK');
        return reply(res, failStatus(code), { error: code });
      }
    },
    async failure(req, res) {
      const access = await guard(req, res, { auth: true, rateKind: 'failure' }); if (!access) return;
      try {
        const body = jsonBody(req);
        const record = createPublicScanFailureRecord({
          ...(body.failure || {}),
          clientMetadata: {
            ...(body.failure?.clientMetadata || {}),
            sourceTrust: PUBLIC_FEEDBACK.sourceTrust,
            localizationVersion: LOCALIZATION_VERSION
          }
        });
        const imageReference = validImageReference(body.imageStorageReference, access.user.id);
        if (imageReference && record.consent.shareImageForImprovement !== true) throw new Error('IMAGE_CONSENT_REQUIRED');
        if (imageReference && imageReference.imageHash !== record.imageHash) throw new Error('IMAGE_EVIDENCE_HASH_MISMATCH');
        const payloadHash = sha256(stableJson(record));
        const result = await data().putFeedback({
          userId: access.user.id,
          feedback: record,
          payloadHash,
          imageStorageReference: imageReference?.reference || null,
          evidenceFingerprint: evidenceFingerprint(record)
        });
        return reply(res, 200, {
          accepted: true,
          duplicate: result?.duplicate === true,
          feedbackId: record.feedbackId,
          certificationStatus: 'raw-unverified',
          payloadHash
        });
      } catch (error) {
        const code = String(error?.message || 'INVALID_SCAN_FAILURE');
        return reply(res, failStatus(code), { error: code });
      }
    },
    async image(req, res) {
      const access = await guard(req, res, { methods: ['PUT'], auth: true, rateKind: 'image' }); if (!access) return;
      try {
        const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
        if (!SCANNER_PUBLIC.imageTypes.includes(contentType)) throw new Error('IMAGE_TYPE_INVALID');
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
        if (!bytes.length || bytes.length > SCANNER_PUBLIC.maxImageBytes) throw new Error('IMAGE_SIZE_INVALID');
        if (detectedImageType(bytes) !== contentType) throw new Error('IMAGE_TYPE_MISMATCH');
        const imageHash = sha256(bytes);
        if (String(req.headers['x-caissa-image-sha256'] || '').toUpperCase() !== imageHash) throw new Error('IMAGE_HASH_MISMATCH');
        const reference = await data().putImage({ userId: access.user.id, imageHash, bytes, contentType });
        return reply(res, 200, { accepted: true, imageHash, imageStorageReference: reference });
      } catch (error) {
        const code = String(error?.message || 'INVALID_IMAGE');
        return reply(res, failStatus(code), { error: code });
      }
    }
  });
}

export { LOCALIZATION_VERSION };
