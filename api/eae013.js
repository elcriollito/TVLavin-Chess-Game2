// EAE-013 is an opt-in Arena preview surface, never a production provider gate.
const BRANCH_FLAGS = Object.freeze({
  'experiment/lc0-eae013-arena-preview-integration': 'EAE013_ARENA_PREVIEW',
  'experiment/lc0-eae013a-session-reliability': 'EAE013A_SESSION_RELIABILITY_PREVIEW'
});

export function previewArenaEnabled(env, host) {
  const flag = BRANCH_FLAGS[env.VERCEL_GIT_COMMIT_REF];
  if (env.VERCEL_ENV !== 'preview' || !flag || env[flag] !== '1') return false;
  try {
    const main = new URL(env.EAE011_MAIN_ORIGIN);
    const engine = new URL(env.EAE011_ENGINE_ORIGIN);
    return main.protocol === 'https:' && engine.protocol === 'https:' &&
      main.hostname.endsWith('.vercel.app') && engine.hostname.endsWith('.vercel.app') &&
      main.origin !== engine.origin && host === main.host;
  } catch { return false; }
}

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!previewArenaEnabled(process.env, String(req.headers.host || '').toLowerCase()) ||
      (req.headers.origin && req.headers.origin !== process.env.EAE011_MAIN_ORIGIN))
    return res.status(404).json({ error: 'PREVIEW_ONLY' });
  return res.status(200).json({ enabled: true, providerId: 'lc0-maia-1100-preview',
    mainOrigin: process.env.EAE011_MAIN_ORIGIN,
    engineOrigin: process.env.EAE011_ENGINE_ORIGIN });
}
