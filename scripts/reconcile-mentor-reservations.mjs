import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const batch = Number(process.argv[2] || 100);
if (!url || !key) throw new Error('Set a Supabase URL and service-role key in this process only.');
if (!Number.isInteger(batch) || batch < 1 || batch > 500) throw new Error('Batch size must be between 1 and 500.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await db.rpc('reconcile_mentor_reservations', { p_batch_size: batch });
if (error) throw new Error(`Mentor reconciliation failed (${error.code || 'database_error'}).`);
const counts = Object.create(null);
for (const row of data || []) counts[row.action] = (counts[row.action] || 0) + 1;
console.log(JSON.stringify({ inspectedMaximum: batch, actions: counts }));
