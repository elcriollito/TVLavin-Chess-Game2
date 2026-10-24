import {
  MODEL,
  analyzeStructuralPosition,
  createPublicFeedbackRecord,
  createPublicPredictionSnapshot,
  createPublicScanFailureRecord
} from './scanner-public-contract.js';
import { randomUuid, sha256Hex } from '../beta/scanner-beta-crypto.js';

const RECOGNITION_TIMEOUT_MS = 25_000;
const LOCALIZATION_VERSION = 'caissa-scanner-board-localizer/4';
const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS = Object.freeze({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' });
const HEIC = new Set(['image/heic', 'image/heif', 'image/x-heic', 'image/x-heif']);

function typedError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function extensionOf(name) {
  return String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '';
}

export function resolvePublicImage(file) {
  if (!file) throw typedError('IMAGE_REQUIRED');
  const declaredType = String(file.type || '').trim().toLowerCase();
  const extension = extensionOf(file.name);
  if (HEIC.has(declaredType) || ['heic', 'heif'].includes(extension)) throw typedError('UNSUPPORTED_HEIC');
  const sourceImageType = SUPPORTED.has(declaredType) ? declaredType : (!declaredType ? EXTENSIONS[extension] : null);
  if (!sourceImageType) throw typedError('UNSUPPORTED_IMAGE');
  return Object.freeze({
    blob: declaredType === sourceImageType ? file : file.slice(0, file.size, sourceImageType),
    sourceImageType,
    metadata: Object.freeze({ declaredType: declaredType || null, extension: extension || null, size: file.size })
  });
}

function rgbaBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(value);
}

async function responseBody(response) {
  try { return await response.json(); }
  catch (_) { return {}; }
}

function responseError(response, body) {
  const server = String(body?.error || '').toUpperCase();
  if (response.status === 401) return typedError('AUTH_REQUIRED');
  if (response.status === 403) return typedError(server || 'ACCESS_DENIED');
  if (response.status === 404) return typedError('PUBLIC_BETA_DISABLED');
  if (response.status === 413) return typedError('PAYLOAD_TOO_LARGE');
  if (response.status === 429) return typedError('RATE_LIMITED', { retryAfter: response.headers.get('Retry-After') });
  if (response.status === 504) return typedError('TIMEOUT');
  if (server === 'MODEL_INTEGRITY_FAILURE' || server === 'INFERENCE_FAILURE') return typedError(server);
  return typedError(server || 'SERVICE_UNAVAILABLE');
}

async function jsonRequest(endpoint, { method = 'POST', body, signal } = {}) {
  let response;
  try {
    response = await fetch(endpoint, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw typedError('NETWORK_FAILURE');
  }
  const value = await responseBody(response);
  if (!response.ok) throw responseError(response, value);
  return value;
}

async function recognizeCanonicalBoard(request, parentSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, RECOGNITION_TIMEOUT_MS);
  try {
    return await jsonRequest('/api/scanner/public/recognize', { body: request, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw typedError('TIMEOUT');
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
}

export async function recognizePublicPosition({ file, prepared, captureType, orientation = 'white-at-bottom', signal }) {
  const selected = resolvePublicImage(file);
  const imageHash = await sha256Hex(await file.arrayBuffer());
  const scanId = randomUuid();
  try {
    const prediction = await recognizeCanonicalBoard({
      schemaVersion: 'caissa-scanner-beta-recognition-request/1',
      boardEncoding: 'rgba8',
      boardWidth: 512,
      boardHeight: 512,
      sourceImageType: selected.sourceImageType,
      boardRgbaBase64: rgbaBase64(prepared.board.pixels),
      orientation
    }, signal);
    const snapshot = createPublicPredictionSnapshot({
      scanId,
      timestamp: new Date().toISOString(),
      imageHash,
      orientation,
      detectedCorners: prepared.board.corners,
      predictedFEN: prediction.predictedFEN,
      squarePredictions: prediction.squarePredictions,
      modelVersion: prediction.modelVersion,
      modelChecksum: prediction.modelChecksum,
      occupancyThreshold: prediction.occupancyThreshold
    });
    await jsonRequest('/api/scanner/public/scan', { body: {
      snapshot,
      metadata: {
        platform: null,
        captureType,
        localizationVersion: LOCALIZATION_VERSION,
        clientMetadata: {
          viewport: { width: innerWidth, height: innerHeight },
          selectedImage: selected.metadata,
          localization: {
            status: prepared.status,
            diagnostics: prepared.diagnostics,
            corners: prepared.board.corners,
            candidateScore: prepared.board.candidateScore,
            geometryScore: prepared.board.geometryScore,
            gridEvidenceScore: prepared.board.gridEvidenceScore
          },
          timingsMs: prepared.timing
        }
      }
    }, signal });
    return Object.freeze({ snapshot, imageHash, sourceImageType: selected.sourceImageType, selected });
  } catch (error) {
    error.publicFailureContext = Object.freeze({ scanId, imageHash, captureType, orientation, selected });
    throw error;
  }
}

export async function createPublicFailureContext(file, captureType, orientation = 'white-at-bottom') {
  const selected = resolvePublicImage(file);
  return Object.freeze({
    scanId: randomUuid(),
    imageHash: await sha256Hex(await file.arrayBuffer()),
    captureType,
    orientation,
    selected
  });
}

async function uploadConsentedImage(file, imageHash) {
  const selected = resolvePublicImage(file);
  const response = await fetch('/api/scanner/public/image', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': selected.sourceImageType, 'X-Caissa-Image-Sha256': imageHash },
    body: selected.blob
  });
  const value = await responseBody(response);
  if (!response.ok) throw responseError(response, value);
  return value.imageStorageReference;
}

export async function submitPublicFeedback({
  snapshot,
  correctedFEN,
  feedbackType,
  captureType,
  file,
  shareCorrectionForImprovement,
  shareImageForImprovement
}) {
  const consent = { shareCorrectionForImprovement, shareImageForImprovement };
  const record = createPublicFeedbackRecord({
    feedbackId: randomUuid(),
    snapshot,
    feedbackType,
    correctedFEN: feedbackType === 'LOCALIZATION_FAILURE' ? null : correctedFEN,
    finalPositionConfirmed: !['LOCALIZATION_FAILURE', 'SCAN_FAILURE'].includes(feedbackType),
    localizationValid: feedbackType !== 'LOCALIZATION_FAILURE',
    consent,
    platform: null,
    captureType,
    clientMetadata: { viewport: { width: innerWidth, height: innerHeight }, localizationVersion: LOCALIZATION_VERSION }
  });
  const imageStorageReference = shareImageForImprovement
    ? await uploadConsentedImage(file, snapshot.imageHash)
    : null;
  return jsonRequest('/api/scanner/public/feedback', { body: { feedback: record, imageStorageReference } });
}

export async function submitPublicFailure({ context, error, file, shareCorrectionForImprovement, shareImageForImprovement }) {
  const normalized = normalizeFailure(error);
  const consent = { shareCorrectionForImprovement, shareImageForImprovement };
  const record = createPublicScanFailureRecord({
    feedbackId: randomUuid(),
    scanId: context.scanId,
    createdAt: new Date().toISOString(),
    imageHash: context.imageHash,
    modelVersion: MODEL.version,
    modelChecksum: MODEL.checksum,
    occupancyThreshold: MODEL.occupancyThreshold,
    orientation: context.orientation,
    consent,
    platform: null,
    captureType: context.captureType,
    clientMetadata: { localizationVersion: LOCALIZATION_VERSION },
    failureStage: normalized.stage,
    errorCode: normalized.code
  });
  const imageStorageReference = shareImageForImprovement
    ? await uploadConsentedImage(file, context.imageHash)
    : null;
  return jsonRequest('/api/scanner/public/failure', { body: { failure: record, imageStorageReference } });
}

export function normalizeFailure(error) {
  const raw = String(error?.code || error?.message || 'DECODE_FAILURE').toUpperCase();
  if (/HEIC|HEIF|UNSUPPORTED/.test(raw)) return { code: 'UNSUPPORTED_IMAGE', stage: 'unsupported-input' };
  if (/NO-BOARD|NO_BOARD|LOCALIZATION|AMBIGUOUS|GRID|QUAD|HOMOGRAPHY|BOARD/.test(raw)) return { code: raw.replace(/[^A-Z0-9_-]/g, '_').slice(0, 80), stage: 'localization' };
  if (/RATE/.test(raw)) return { code: 'RATE_LIMITED', stage: 'rate-limit' };
  if (/AUTH|ACCESS/.test(raw)) return { code: raw.replace(/[^A-Z0-9_-]/g, '_').slice(0, 80), stage: 'authorization' };
  if (/NETWORK/.test(raw)) return { code: 'NETWORK_FAILURE', stage: 'network' };
  if (/INFERENCE|MODEL/.test(raw)) return { code: raw.replace(/[^A-Z0-9_-]/g, '_').slice(0, 80), stage: 'classifier' };
  return { code: raw.replace(/[^A-Z0-9_-]/g, '_').slice(0, 80), stage: /DECODE/.test(raw) ? 'decode' : 'service' };
}

export function publicErrorMessage(error) {
  const code = normalizeFailure(error).code;
  if (code === 'UNSUPPORTED_IMAGE') return 'This format is not supported. Choose a JPEG, PNG, or WebP image. HEIC and HEIF are not supported yet.';
  if (code === 'RATE_LIMITED') return 'Too many scan attempts. Wait a moment, then try again.';
  if (code === 'AUTH_REQUIRED') return 'Sign in to send optional Scanner feedback.';
  if (code === 'PUBLIC_BETA_DISABLED') return 'Scanner is temporarily paused. Please try again later.';
  if (/NO_BOARD|LOCALIZATION|AMBIGUOUS|GRID|QUAD|HOMOGRAPHY|BOARD/.test(code)) return 'The board could not be detected reliably. Try a clearer image with the full 2D board visible.';
  if (/INFERENCE|MODEL|SERVICE|TIMEOUT/.test(code)) return 'Recognition is temporarily unavailable. Please try again.';
  if (code === 'NETWORK_FAILURE') return 'Could not reach Scanner. Check your connection and try again.';
  return 'Could not read that image. Choose another JPEG, PNG, or WebP image.';
}

export async function publicStatus() {
  try {
    const response = await fetch('/api/scanner/public/status', { credentials: 'same-origin' });
    return response.ok ? { known: true, ...(await response.json()) } : { known: false };
  } catch (_) { return { known: false }; }
}

export { MODEL, LOCALIZATION_VERSION, analyzeStructuralPosition };
