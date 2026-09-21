// EAE-013 is an opt-in Arena preview surface, never a production provider gate.
const BRANCH = 'experiment/lc0-eae013-arena-preview-integration';

export function previewArenaEnabled(env, host) {
  if (env.VERCEL_ENV !== 'preview' || env.VERCEL_GIT_COMMIT_REF !== BRANCH ||
      env.EAE013_ARENA_PREVIEW !== '1') return false;
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
