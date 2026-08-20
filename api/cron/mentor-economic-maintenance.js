import { createClient } from '@supabase/supabase-js';
import { createMentorMaintenanceHandler } from '../_lib/mentor-maintenance.js';

const db = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  }) : null;

export default createMentorMaintenanceHandler({ db });
