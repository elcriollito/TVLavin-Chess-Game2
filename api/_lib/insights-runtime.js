import { authenticateRequest, respondAuthFailure } from './auth.js';
import { getSupabase } from './supabase.js';
import { checkRateLimit } from './rate-limit.js';
import { insightsConfiguration } from './insights-config.js';

export const insightsDependencies = {
    authenticate: authenticateRequest, authFailure: respondAuthFailure, rate: checkRateLimit, log: console,
    db() {
        // Preview writes must never fall through to the production database.
        if (!insightsConfiguration().storageConfigured) throw new Error('Insights database is not configured for this environment');
        return getSupabase();
    }
};
