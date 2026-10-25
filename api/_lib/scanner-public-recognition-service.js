import { authenticateBrowserRequest } from './auth.js';
import { checkRateLimit } from './rate-limit.js';
import { inferFrozenV05Onnx } from './scanner-beta-inference.js';
import { SCANNER_BETA } from './scanner-beta-policy.js';
import {
  publicHeaders,
  publicScannerEnabled,
  recognitionRatePolicy,
  sameOrigin
} from './scanner-public-policy.js';

const TIMEOUT_MS = 20_000;

function reply(res, status, body) {
  publicHeaders(res);
  return res.status(status).json(body);
}

function payload(req) {
  if (String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw Object.assign(new Error('INVALID_PAYLOAD'), { code: 'INVALID_PAYLOAD' });
  }
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  if (Buffer.byteLength(raw) > SCANNER_BETA.maxJsonBytes) throw Object.assign(new Error('INVALID_PAYLOAD'), { code: 'INVALID_PAYLOAD' });
  return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
}

async function withTimeout(promise, milliseconds) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT' })), milliseconds);
  });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(timer); }
}

function hasCredential(req) {
  return Boolean(req.headers?.authorization || /(?:^|;\s*)__session=/.test(String(req.headers?.cookie || '')));
}

export function createScannerPublicRecognitionService({
  env = process.env,
  authenticate = authenticateBrowserRequest,
  infer = inferFrozenV05Onnx,
  rateLimit = checkRateLimit,
  clock = () => performance.now(),
  log = entry => console.info(JSON.stringify(entry)),
  timeoutMs = TIMEOUT_MS
} = {}) {
  return Object.freeze({
    async recognize(req, res) {
      const started = clock();
      let code = 'OK';
      let audience = 'guest';
      try {
        if (!publicScannerEnabled(env)) { code = 'PUBLIC_BETA_DISABLED'; return reply(res, 404, { error: code }); }
        if (req.method !== 'POST') { code = 'METHOD_NOT_ALLOWED'; return reply(res, 405, { error: code }); }
        if (!sameOrigin(req)) { code = 'ORIGIN_REJECTED'; return reply(res, 403, { error: code }); }
        const identity = await authenticate(req);
        if (hasCredential(req) && !identity.authenticated) {
          code = identity.status === 503 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_REQUIRED';
          return reply(res, identity.status === 503 ? 503 : 401, { error: code });
        }
        const policy = recognitionRatePolicy(identity, req, env);
        audience = policy.audience;
        const allowance = rateLimit(policy.identifier, { windowMs: 60_000, max: policy.max, prefix: 'scanner-public-recognize' });
        res.setHeader('X-RateLimit-Limit', String(policy.max));
        res.setHeader('X-RateLimit-Remaining', String(allowance.remaining));
        if (!allowance.allowed) {
          code = 'RATE_LIMITED';
          res.setHeader('Retry-After', String(allowance.retryAfter || 60));
          return reply(res, 429, { error: code, retryAfter: allowance.retryAfter || 60 });
        }
        const result = await withTimeout(infer(payload(req)), timeoutMs);
        res.setHeader('Server-Timing', `model;dur=${Number(result.metrics.modelLoadMs || 0).toFixed(1)}, inference;dur=${Number(result.metrics.inferenceMs || 0).toFixed(1)}`);
        return reply(res, 200, result.response);
      } catch (error) {
        code = ['INVALID_IMAGE', 'INVALID_PAYLOAD', 'MODEL_INTEGRITY_FAILURE', 'INFERENCE_FAILURE', 'TIMEOUT'].includes(error?.code)
          ? error.code : 'INFERENCE_FAILURE';
        const status = code === 'TIMEOUT' ? 504 : /MODEL|INFERENCE/.test(code) ? 503 : 422;
        return reply(res, status, { error: code });
      } finally {
        log({ event: 'scanner_public_recognition', audience, outcome: code === 'OK' ? 'success' : 'failure', code,
          durationMs: Math.round((clock() - started) * 10) / 10 });
      }
    }
  });
}
