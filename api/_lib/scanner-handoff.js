export const SCANNER_PRODUCTION_URL = 'https://www.caissa-chess.org/scanner';

function deploymentEnvironment(env) {
  if (env.VERCEL_ENV === 'production') return 'production';
  if (env.VERCEL_ENV || env.VERCEL_TARGET_ENV || env.CAISSA_SCANNER_PREVIEW_HANDOFF_URL) return 'preview';
  return 'development';
}

function validatedPreviewUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error('SCANNER_PREVIEW_HANDOFF_URL_INVALID');
  }
  const shareValues = url.searchParams.getAll('_vercel_share');
  const valid = url.protocol === 'https:'
    && !url.username
    && !url.password
    && url.hostname.endsWith('.vercel.app')
    && (url.pathname === '/scanner' || url.pathname === '/scanner/')
    && shareValues.length === 1
    && /^[A-Za-z0-9_-]{16,256}$/.test(shareValues[0])
    && [...url.searchParams.keys()].every((key) => key === '_vercel_share')
    && !url.hash;
  if (!valid) throw new Error('SCANNER_PREVIEW_HANDOFF_URL_INVALID');
  url.pathname = '/scanner';
  return url.toString();
}

function normalizedSha(value) {
  return /^[a-f0-9]{40}$/i.test(value || '') ? value.toLowerCase() : null;
}

export function getScannerHandoffUrl(env = process.env) {
  const environment = deploymentEnvironment(env);
  if (environment !== 'preview') return SCANNER_PRODUCTION_URL;
  return validatedPreviewUrl(env.CAISSA_SCANNER_PREVIEW_HANDOFF_URL);
}

export function createScannerHandoff(env = process.env) {
  const environment = deploymentEnvironment(env);
  const handoff = {
    schemaVersion: 'caissa-scanner-handoff/1',
    environment,
    url: getScannerHandoffUrl(env)
  };
  if (environment === 'preview') {
    handoff.buildIdentity = Object.freeze({
      sourceSha: normalizedSha(env.VERCEL_GIT_COMMIT_SHA || env.CAISSA_SCANNER_BUILD_SHA),
      publicStage: env.CAISSA_SCANNER_PUBLIC_STAGE || null,
      targetEnvironment: env.VERCEL_TARGET_ENV || env.VERCEL_ENV || null,
      deploymentHost: /^(?:[a-z0-9-]+\.)+vercel\.app$/i.test(env.VERCEL_URL || '') ? env.VERCEL_URL : null
    });
  }
  return Object.freeze(handoff);
}

export function scannerHandoffHeaders(handoff) {
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
  if (handoff.environment === 'preview' && handoff.buildIdentity?.sourceSha) {
    headers['X-Caissa-Scanner-Build'] = handoff.buildIdentity.sourceSha;
  }
  return headers;
}
