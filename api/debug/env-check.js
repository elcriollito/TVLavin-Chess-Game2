/**
 * Temporary diagnostic endpoint to check environment variables
 * DELETE THIS FILE after debugging
 */

export default async function handler(req, res) {
  // Only allow in development/preview
  if (process.env.VERCEL_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const checks = {
    together_api_key: !!process.env.TOGETHER_API_KEY,
    together_model: process.env.TOGETHER_MODEL || 'moonshotai/Kimi-K2.5 (default)',
    together_base_url: process.env.TOGETHER_BASE_URL || process.env.TOGETHER_API_BASE_URL || 'https://api.together.xyz (default)',
    supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    clerk_secret_key: !!process.env.CLERK_SECRET_KEY,
    node_version: process.version
  };

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local',
    checks,
    summary: {
      all_critical_vars_present:
        checks.together_api_key &&
        checks.supabase_url &&
        checks.supabase_service_key &&
        checks.clerk_secret_key
    }
  });
}
