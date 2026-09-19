import { createBetaProgramService } from './beta-program-service.js';
import { checkRateLimit } from './rate-limit.js';
import { inferFrozenV05Onnx } from './scanner-beta-inference.js';
import { SCANNER_BETA, betaEnabled, privateHeaders, sameOrigin } from './scanner-beta-policy.js';

const TIMEOUT_MS = 20_000;

function reply(res, status, body) {
  privateHeaders(res);
  return res.status(status).json(body);
}

function contentType(req) {
  return String(req.headers?.['content-type'] || req.headers?.['Content-Type'] || '').split(';')[0].trim().toLowerCase();
}

function payload(req) {
  if (contentType(req) !== 'application/json') throw Object.assign(new Error('INVALID_PAYLOAD'), { code: 'INVALID_PAYLOAD' });
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > SCANNER_BETA.maxJsonBytes) throw Object.assign(new Error('INVALID_PAYLOAD'), { code: 'INVALID_PAYLOAD' });
  try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (_) { throw Object.assign(new Error('INVALID_PAYLOAD'), { code: 'INVALID_PAYLOAD' }); }
}

function statusFor(code) {
  if (code === 'TIMEOUT') return 504;
  if (code === 'MODEL_INTEGRITY_FAILURE' || code === 'INFERENCE_FAILURE') return 503;
  return 400;
}

function timeoutAfter(ms) {
  return new Promise((_, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT' })), ms);
    timer.unref?.();
  });
}

export function createScannerBetaRecognitionService({
  env = process.env,
  authorizeExperiment = null,
  infer = inferFrozenV05Onnx,
  rateLimit = checkRateLimit,
  log = (entry) => console.info(JSON.stringify(entry)),
  clock = () => performance.now(),
  timeoutMs = TIMEOUT_MS
} = {}) {
  const authorize = authorizeExperiment || createBetaProgramService({ env }).authorizeExperiment;
  return Object.freeze({
    async recognize(req, res) {
      privateHeaders(res);
      const started = clock();
      let code = 'OK';
      try {
        if (!betaEnabled(env)) { code = 'BETA_DISABLED'; return reply(res, 404, { error: code }); }
        if (req.method !== 'POST') { code = 'INVALID_PAYLOAD'; return reply(res, 405, { error: code }); }
        if (!sameOrigin(req)) { code = 'BETA_ACCESS_DENIED'; return reply(res, 403, { error: code }); }
        const access = await authorize(req, 'scanner');
        if (!access?.ok) {
          code = access?.status === 401 ? 'AUTH_REQUIRED'
            : access?.code === 'BETA_DISABLED' ? 'BETA_DISABLED' : 'BETA_ACCESS_DENIED';
          return reply(res, access?.status || 403, { error: code });
        }
        if (!access.user?.id) { code = 'BETA_ACCESS_DENIED'; return reply(res, 403, { error: code }); }
        const allowance = rateLimit(access.user.id, { windowMs: 60_000, max: 12, prefix: 'scanner-recognize' });
        if (!allowance.allowed) {
          code = 'RATE_LIMITED';
          res.setHeader('Retry-After', String(allowance.retryAfter || 60));
          return reply(res, 429, { error: code, retryAfter: allowance.retryAfter || 60 });
        }
        const result = await Promise.race([infer(payload(req)), timeoutAfter(timeoutMs)]);
        res.setHeader('Server-Timing', `model;dur=${Number(result.metrics.modelLoadMs || 0).toFixed(1)}, inference;dur=${Number(result.metrics.inferenceMs || 0).toFixed(1)}`);
        return reply(res, 200, result.response);
      } catch (error) {
        code = ['INVALID_IMAGE', 'INVALID_PAYLOAD', 'MODEL_INTEGRITY_FAILURE', 'INFERENCE_FAILURE', 'TIMEOUT'].includes(error?.code)
          ? error.code : 'INFERENCE_FAILURE';
        return reply(res, statusFor(code), { error: code });
      } finally {
        log({ event: 'scanner_beta_recognition', outcome: code === 'OK' ? 'success' : 'failure', code,
          durationMs: Math.round((clock() - started) * 10) / 10 });
      }
    }
  });
}
