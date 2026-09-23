// EAE-015B is an internal-only release-candidate surface. The normal Arena
// never consumes this configuration and the server defaults to DISABLED.
import { configuredStore } from '../experiments/lc0-preview-relay/store.mjs';

const BRANCH_FLAGS = Object.freeze({
  'experiment/lc0-eae013-arena-preview-integration': 'EAE013_ARENA_PREVIEW',
  'experiment/lc0-eae013a-session-reliability': 'EAE013A_SESSION_RELIABILITY_PREVIEW',
  'experiment/lc0-eae015a-production-infrastructure': 'EAE015A_ARENA_PREVIEW',
  'integration/lc0-limited-production-rc': 'EAE015B_INTERNAL_PREVIEW'
});

export function previewArenaEnabled(env, host) {
  const branch = [env.VERCEL_GIT_COMMIT_REF, env.EAE015A_BRANCH_GUARD]
    .find(candidate => BRANCH_FLAGS[candidate]);
  const flag = BRANCH_FLAGS[branch];
  if (env.VERCEL_ENV !== 'preview' || !flag || env[flag] !== '1') return false;
  try {
    const main = new URL(env.EAE011_MAIN_ORIGIN);
    const engine = new URL(env.EAE011_ENGINE_ORIGIN);
    return main.protocol === 'https:' && engine.protocol === 'https:' &&
      main.hostname.endsWith('.vercel.app') && engine.hostname.endsWith('.vercel.app') &&
      main.origin !== engine.origin && host === main.host;
  } catch { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!previewArenaEnabled(process.env, String(req.headers.host || '').toLowerCase()) ||
      (req.headers.origin && req.headers.origin !== process.env.EAE011_MAIN_ORIGIN))
    return res.status(404).json({ error: 'PREVIEW_ONLY' });
  const mode = await configuredStore().getControlMode();
  const releaseStage = String(process.env.EAE015B_RELEASE_STAGE || 'DISABLED').toUpperCase();
  const enabled = mode === 'ENABLED' && releaseStage === 'INTERNAL_ONLY';
  return res.status(200).json({ enabled, mode, releaseStage,
    providerId: 'lc0-maia-1100-preview',
    mainOrigin: process.env.EAE011_MAIN_ORIGIN,
    engineOrigin: process.env.EAE011_ENGINE_ORIGIN,
    relayOrigin: process.env.EAE015A_RELAY_ORIGIN || process.env.EAE011_MAIN_ORIGIN,
    manifestSha256: process.env.EAE015A_MANIFEST_SHA256,
    enginePath: process.env.EAE015A_PRODUCTION_SHAPE === '1' ? '/' :
      '/experiments/lc0-preview-relay/engine/index.html' });
}
