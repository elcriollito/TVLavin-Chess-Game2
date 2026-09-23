import { timingSafeEqual } from 'node:crypto';
import { configuredStore } from '../../experiments/lc0-preview-relay/store.mjs';
import { PRODUCTION_POLICY } from '../../experiments/lc0-preview-relay/production-policy.mjs';

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  const branch = process.env.VERCEL_GIT_COMMIT_REF || process.env.EAE015A_BRANCH_GUARD;
  if (process.env.VERCEL_ENV !== 'preview' ||
      branch !== 'experiment/lc0-eae015a-production-infrastructure')
    return res.status(404).json({ error: 'PREVIEW_ONLY' });
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!equalSecret(supplied, process.env.CRON_SECRET))
    return res.status(401).json({ error: 'CRON_AUTH_REQUIRED' });
  const started = Date.now();
  try {
    const result = await configuredStore().cleanupDetailed({
      batchSize: PRODUCTION_POLICY.cleanupBatchSize,
      terminalRetentionMs: PRODUCTION_POLICY.terminalRetentionMs
    });
    console.info('LC0_SCHEDULED_CLEANUP', JSON.stringify({
      removed: result.removed,
      reasons: result.reasons,
      tombstonesPruned: result.tombstonesPruned || 0,
      rateWindowsPruned: result.rateWindowsPruned || 0,
      latencyMs: Date.now() - started
    }));
    return res.status(200).json({ ok: true, ...result, latencyMs: Date.now() - started });
  } catch (error) {
    console.error('LC0_SCHEDULED_CLEANUP_FAILED', String(error?.code || error?.name || 'ERROR'));
    return res.status(503).json({ error: 'CLEANUP_FAILED' });
  }
}
