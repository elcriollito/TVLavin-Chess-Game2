import { getSupabase } from './supabase.js';

function validSubject(value) {
    return typeof value === 'string' && value.length >= 1 && value.length <= 255;
}

export function createMarketReaderEntitlementLookup(dependencies = {}) {
    const getDatabase = dependencies.getSupabase || getSupabase;

    return async function lookupEntitlement({ clerkId, productId }) {
        if (!validSubject(clerkId) || !validSubject(productId)) return null;
        const database = getDatabase();
        const { data: user, error: userError } = await database
            .from('users')
            .select('id')
            .eq('clerk_id', clerkId)
            .maybeSingle();

        if (userError) throw new Error('MARKET_ACCOUNT_LOOKUP_FAILED');
        if (!user?.id) return null;

        const { data: entitlement, error: entitlementError } = await database
            .from('product_entitlements')
            .select('id, product_id, status, granted_at, updated_at')
            .eq('user_id', user.id)
            .eq('product_id', productId)
            .eq('status', 'active')
            .maybeSingle();

        if (entitlementError) throw new Error('MARKET_ENTITLEMENT_LOOKUP_FAILED');
        if (!entitlement) return null;
        return Object.freeze({
            entitlementId: entitlement.id,
            productId: entitlement.product_id,
            status: entitlement.status,
            grantedAt: entitlement.granted_at,
            updatedAt: entitlement.updated_at
        });
    };
}

export const lookupMarketReaderEntitlement = createMarketReaderEntitlementLookup();
