import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const userId = process.argv[2];
const start = process.argv[3];
const end = process.argv[4];
const target = process.argv[5];
const projectRef = process.argv[6];
const startDate = new Date(start);
const endDate = new Date(end);

if (!UUID.test(userId || '')) throw new Error('Provide a valid internal user UUID.');
if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate || endDate - startDate > 15 * 60_000) {
  throw new Error('Provide an ordered UTC window no longer than 15 minutes.');
}
if (!['production', 'preview'].includes(target) || !/^[a-z0-9]{20}$/.test(projectRef || '')) {
  throw new Error('Provide an explicit target and Supabase project ref.');
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || new URL(url).hostname !== `${projectRef}.supabase.co`) throw new Error('Destination guard failed.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const discovery = await db.rpc('find_recent_mentor_operation', {
  p_user_id: userId,
  p_start: startDate.toISOString(),
  p_end: endDate.toISOString()
});
if (discovery.error) throw new Error(`Discovery failed: ${discovery.error.code || 'DATABASE_ERROR'}`);
const rows = Array.isArray(discovery.data) ? discovery.data : [];
if (rows.length !== 1 || !UUID.test(rows[0]?.operation_id || '')) throw new Error(rows.length === 0 ? 'No operation found.' : 'Operation discovery ambiguous.');

console.log(JSON.stringify({
  target,
  count: 1,
  operationId: rows[0].operation_id,
  createdAt: rows[0].created_at
}));
