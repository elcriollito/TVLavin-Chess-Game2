export function insightsConfiguration(env = process.env) {
    const preview = env.VERCEL_ENV === 'preview';
    const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
    let staging = false;
    try { staging = new URL(url).hostname === 'aqizagaskicotorfpwfn.supabase.co'; } catch { /* Missing configuration. */ }
    return {
        authConfigured: Boolean(env.CLERK_JWT_KEY || env.CLERK_SECRET_KEY),
        storageConfigured: Boolean(url && env.SUPABASE_SERVICE_ROLE_KEY && (!preview || staging)),
        previewUsesStaging: preview ? staging : null
    };
}
