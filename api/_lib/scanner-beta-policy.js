import { createHash } from 'node:crypto';

export const SCANNER_BETA = Object.freeze({
  requiredStage: 'internal',
  maxJsonBytes: 1_500_000,
  maxImageBytes: 12_000_000,
  imageTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp'])
});

export function betaEnabled(env = process.env) {
  return env.CAISSA_SCANNER_BETA_STAGE === SCANNER_BETA.requiredStage;
}

export function privateHeaders(target) {
  const entries = {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
  for (const [name, value] of Object.entries(entries)) {
    if (typeof target.setHeader === 'function') target.setHeader(name, value);
    else target[name] = value;
  }
  return entries;
}

export function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  const host = req.headers?.host;
  try { return new URL(origin).host === host; } catch (_) { return false; }
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
