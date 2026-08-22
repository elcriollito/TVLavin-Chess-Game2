import crypto from 'node:crypto';

export const MENTOR_MAINTENANCE_DEFAULT_BATCH = 100;
export const MENTOR_MAINTENANCE_MAX_BATCH = 500;

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
};

export function validCronAuthorization(header, env = process.env) {
  const secret = env.CRON_SECRET;
  return typeof secret === 'string' && secret.length >= 32 && safeEqual(header, `Bearer ${secret}`);
}

export function parseMaintenanceBatch(value) {
  if (value === undefined || value === null || value === '') return MENTOR_MAINTENANCE_DEFAULT_BATCH;
  if (!/^[1-9][0-9]{0,2}$/.test(String(value))) return null;
  const batch = Number(value);
  return batch <= MENTOR_MAINTENANCE_MAX_BATCH ? batch : null;
}

export function maintenanceDestinationReady(env = process.env) {
  const target = env.CAISSA_MENTOR_MAINTENANCE_TARGET;
  const projectRef = env.CAISSA_MENTOR_MAINTENANCE_SUPABASE_PROJECT_REF;
  if (!['production', 'preview', 'development'].includes(target) || env.VERCEL_ENV !== target
      || typeof projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(projectRef)) return false;
  try { return new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname === `${projectRef}.supabase.co`; }
  catch { return false; }
}

export async function inspectMentorMaintenance(db, batch) {
  const inspected = await db.rpc('inspect_mentor_economic_maintenance', { p_batch_size: batch });
  const row = inspected.data?.[0] || inspected.data;
  if (inspected.error || !row) throw new Error('MAINTENANCE_INSPECTION_FAILED');
  const plan = {
    release: Number(row.release_count), consume: Number(row.consume_count),
    compensate: Number(row.compensate_count), cleanup: Number(row.cleanup_count),
    deliveryAckReview: Number(row.pending_delivery_ack_review)
  };
  if (Object.values(plan).some(value => !Number.isSafeInteger(value) || value < 0 || value > batch)) throw new Error('MAINTENANCE_INSPECTION_FAILED');
  return Object.freeze(plan);
}

export async function executeMentorMaintenance(db, batch) {
  const reconciled = await db.rpc('reconcile_mentor_reservations', { p_batch_size: batch });
  if (reconciled.error) throw new Error('MAINTENANCE_RECONCILIATION_FAILED');
  const actions = { released: 0, consumed: 0, compensated: 0 };
  for (const row of reconciled.data || []) {
    if (row.action === 'EXPIRED_RELEASED') actions.released += 1;
    else if (row.action === 'CONSUMED') actions.consumed += 1;
    else if (row.action === 'COMPENSATED') actions.compensated += 1;
  }
  const cleaned = await db.rpc('cleanup_mentor_economic_state', { p_batch_size: batch });
  if (cleaned.error) throw new Error('MAINTENANCE_CLEANUP_FAILED');
  return Object.freeze({ ...actions, cleaned: Number(cleaned.data) || 0 });
}

export function createMentorMaintenanceHandler({ db, env = process.env, inspect = inspectMentorMaintenance, execute = executeMentorMaintenance } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
    if (!validCronAuthorization(req.headers?.authorization, env)) return res.status(401).json({ code: 'UNAUTHORIZED' });
    const batch = parseMaintenanceBatch(req.query?.batch);
    const mode = req.query?.mode || 'dry-run';
    if (!batch || !['dry-run', 'execute'].includes(mode)) return res.status(400).json({ code: 'INVALID_REQUEST' });
    if (!db || !maintenanceDestinationReady(env)) return res.status(503).json({ code: 'DESTINATION_GUARD_FAILED' });
    try {
      const planned = await inspect(db, batch);
      if (mode === 'dry-run') return res.status(200).json({ ok: true, mode, batch, planned });
      if (env.CAISSA_MENTOR_MAINTENANCE_EXECUTE_ENABLED !== 'true') return res.status(409).json({ code: 'EXECUTION_DISABLED' });
      const actions = await execute(db, batch);
      return res.status(200).json({ ok: true, mode, batch, planned, actions });
    } catch {
      return res.status(503).json({ code: 'MAINTENANCE_UNAVAILABLE' });
    }
  };
}
