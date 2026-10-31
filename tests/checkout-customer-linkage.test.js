import test from 'node:test';
import assert from 'node:assert/strict';

import { _getOrCreateCustomer } from '../api/checkout/session.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLERK_ID = 'user_checkout_owner';

function createSupabase({ user, resolveUpdate }) {
    const observed = { patch: null, filters: [], selected: null };

    return {
        observed,
        from(table) {
            assert.equal(table, 'users');
            return {
                select() {
                    const query = {
                        eq(column, value) {
                            assert.equal(column, 'clerk_id');
                            assert.equal(value, CLERK_ID);
                            return query;
                        },
                        async single() {
                            return { data: user, error: null };
                        }
                    };
                    return query;
                },
                update(patch) {
                    observed.patch = patch;
                    const query = {
                        eq(column, value) {
                            observed.filters.push({ operator: 'eq', column, value });
                            return query;
                        },
                        is(column, value) {
                            observed.filters.push({ operator: 'is', column, value });
                            return query;
                        },
                        select(columns) {
                            observed.selected = columns;
                            return query;
                        },
                        async maybeSingle() {
                            return resolveUpdate({ patch, filters: observed.filters });
                        }
                    };
                    return query;
                }
            };
        }
    };
}

test('first Stripe customer must be linked to the same live account before checkout can continue', async () => {
    const supabase = createSupabase({
        user: { id: USER_ID, stripe_customer_id: null, email: 'owner@example.test' },
        resolveUpdate: ({ patch }) => ({
            data: { id: USER_ID, stripe_customer_id: patch.stripe_customer_id },
            error: null
        })
    });
    const stripe = {
        customers: {
            async create() {
                return { id: 'cus_linked' };
            }
        }
    };

    const result = await _getOrCreateCustomer(stripe, { userId: CLERK_ID, email: 'fallback@example.test' }, { supabase });

    assert.deepEqual(result, { customerId: 'cus_linked', userId: USER_ID });
    assert.deepEqual(supabase.observed.patch, { stripe_customer_id: 'cus_linked' });
    assert.deepEqual(supabase.observed.filters, [
        { operator: 'eq', column: 'id', value: USER_ID },
        { operator: 'eq', column: 'clerk_id', value: CLERK_ID },
        { operator: 'is', column: 'stripe_customer_id', value: null }
    ]);
    assert.equal(supabase.observed.selected, 'id, stripe_customer_id');
});

test('account erasure winning while Stripe creates the first customer fails closed', async () => {
    let accountStillLinkable = true;
    const supabase = createSupabase({
        user: { id: USER_ID, stripe_customer_id: null, email: 'owner@example.test' },
        resolveUpdate: () => ({ data: accountStillLinkable ? { id: USER_ID, stripe_customer_id: 'cus_race' } : null, error: null })
    });
    const stripe = {
        customers: {
            async create() {
                accountStillLinkable = false;
                return { id: 'cus_race' };
            }
        }
    };

    await assert.rejects(
        _getOrCreateCustomer(stripe, { userId: CLERK_ID, email: 'owner@example.test' }, { supabase }),
        /Stripe customer linkage failed/
    );
});

test('a pre-existing customer is reused without a provider create or linkage write', async () => {
    let created = 0;
    const supabase = createSupabase({
        user: { id: USER_ID, stripe_customer_id: 'cus_existing', email: 'owner@example.test' },
        resolveUpdate: () => {
            assert.fail('linkage update must not run for an existing customer');
        }
    });
    const stripe = {
        customers: {
            async create() {
                created += 1;
                return { id: 'cus_unexpected' };
            }
        }
    };

    const result = await _getOrCreateCustomer(stripe, { userId: CLERK_ID }, { supabase });

    assert.deepEqual(result, { customerId: 'cus_existing', userId: USER_ID });
    assert.equal(created, 0);
    assert.equal(supabase.observed.patch, null);
});
