import { getSupabase } from './supabase.js';

function mapExperiment(row) {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    description: row.description,
    stage: row.stage,
    enabled: row.enabled,
    route: row.route,
    accessPolicy: row.access_policy,
    requiredEntitlement: row.required_entitlement,
    feedbackEnabled: row.feedback_enabled,
    sortOrder: row.sort_order,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    releasedAt: row.released_at
  };
}

function throwIf(error) {
  if (error) throw new Error('BETA_STORE_UNAVAILABLE');
}

export function createBetaProgramStore(client = null) {
  const db = () => client || getSupabase();
  return Object.freeze({
    async getUserByClerkId(clerkId) {
      const { data: user, error } = await db().from('users').select('id, role').eq('clerk_id', clerkId).maybeSingle();
      throwIf(error);
      if (!user) return null;
      const { data: grants, error: grantError } = await db().from('user_entitlements')
        .select('entitlement, expires_at').eq('user_id', user.id).is('revoked_at', null);
      throwIf(grantError);
      const now = Date.now();
      return {
        authenticated: true,
        id: user.id,
        role: user.role || 'member',
        entitlements: (grants || []).filter(grant => !grant.expires_at || Date.parse(grant.expires_at) > now)
          .map(grant => grant.entitlement)
      };
    },
    async listExperiments() {
      const { data, error } = await db().from('beta_experiments').select('*').order('sort_order', { ascending: true });
      throwIf(error);
      return (data || []).map(mapExperiment);
    },
    async getExperiment(id) {
      const { data, error } = await db().from('beta_experiments').select('*').eq('id', id).maybeSingle();
      throwIf(error);
      return data ? mapExperiment(data) : null;
    },
    async recordEvent({ userId, experimentId = null, eventType }) {
      const { error } = await db().from('beta_audit_events').insert({
        user_id: userId, experiment_id: experimentId, event_type: eventType
      });
      throwIf(error);
    }
  });
}
