import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
    buildMarketReaderCheckoutFulfillment,
    fulfillMarketReaderCheckout,
    getMarketReaderCheckoutContract
} from '../api/_lib/market-reader-checkout.js';
import { buildStripeFulfillmentCommand, fulfillVerifiedStripeEvent } from '../api/_lib/stripe-webhook-fulfillment.js';
import { createMarketReaderAuditLog } from '../api/_lib/market-reader-logging.js';

const userId = '00000000-0000-4000-8000-000000000071';
const event = (overrides = {}) => ({
    id: 'evt_market_reader_1',
    type: 'checkout.session.completed',
    data: {
        object: {
            id: 'cs_market_reader_1',
            customer: 'cus_market_reader_1',
            mode: 'payment',
            payment_status: 'paid',
            metadata: {
                type: 'product',
                product_id: 'caissa-pgn-reader',
                caissa_user_id: userId
            },
            ...overrides
        }
    }
});

test('verified successful product payment maps to one server-owned durable entitlement command', () => {
    const command = buildMarketReaderCheckoutFulfillment(event());
    assert.equal(command.operation, 'PRODUCT_ENTITLEMENT_GRANT');
    assert.equal(command.productId, 'caissa-pgn-reader');
    assert.equal(command.businessKey, 'checkout_session:cs_market_reader_1');
    assert.equal(buildStripeFulfillmentCommand(event()).operation, 'PRODUCT_ENTITLEMENT_GRANT');
});

test('unpaid, unknown product, and missing authoritative identity fail closed', () => {
    assert.throws(() => buildMarketReaderCheckoutFulfillment(event({ payment_status: 'unpaid' })), /CHECKOUT_NOT_PAID/);
    assert.throws(() => buildMarketReaderCheckoutFulfillment(event({ metadata: { type: 'product', product_id: 'attacker', caissa_user_id: userId } })), /UNKNOWN_MARKET_PRODUCT/);
    assert.throws(() => buildMarketReaderCheckoutFulfillment(event({ metadata: { type: 'product', product_id: 'caissa-pgn-reader' } })), /IDENTITY_MAPPING_REQUIRED/);
});

test('product fulfillment invokes only the dedicated idempotent RPC', async () => {
    let call;
    const supabase = { rpc: async (name, params) => {
        call = { name, params };
        return { data: [{ success: true, code: 'COMPLETED' }], error: null };
    } };
    assert.deepEqual(await fulfillVerifiedStripeEvent(supabase, event()), { ok: true, code: 'COMPLETED' });
    assert.equal(call.name, 'fulfill_market_product_checkout');
    assert.equal(call.params.p_product_id, 'caissa-pgn-reader');
    assert.equal(call.params.p_checkout_session_id, 'cs_market_reader_1');
});

test('duplicate durable entitlement fulfillment is an idempotent success', async () => {
    for (const code of ['ALREADY_COMPLETED', 'ALREADY_PROCESSING', 'BUSINESS_OPERATION_ALREADY_COMPLETED']) {
        const supabase = { rpc: async () => ({ data: [{ success: false, code }], error: null }) };
        assert.deepEqual(await fulfillMarketReaderCheckout(supabase, buildMarketReaderCheckoutFulfillment(event())), {
            ok: true, code, duplicate: true
        });
    }
});

test('checkout contract is prepared but Buy remains disabled in every environment', () => {
    const staging = getMarketReaderCheckoutContract({ VERCEL_TARGET_ENV: 'staging', STRIPE_PRICE_CAISSA_PGN_READER: 'price_staging_fixture' });
    assert.equal(staging.configuredForStaging, true);
    assert.equal(staging.enabled, false);
    assert.equal(staging.productionBuyEnabled, false);
    assert.equal(getMarketReaderCheckoutContract({ VERCEL_TARGET_ENV: 'production' }).enabled, false);
});

test('entitlement migration is RLS-enabled, server-only, atomic and does not define refund policy', () => {
    const source = fs.readFileSync('supabase/migrations/20260901010208_caissa_market_reader_entitlements.sql', 'utf8');
    assert.match(source, /create table public\.product_entitlements/);
    assert.match(source, /alter table public\.product_entitlements enable row level security/);
    assert.match(source, /revoke all on table public\.product_entitlements from public, anon, authenticated, service_role/);
    assert.match(source, /grant select, insert, update on table public\.product_entitlements to service_role/);
    assert.match(source, /fulfill_market_product_checkout/);
    assert.match(source, /on conflict \(user_id, product_id\) do update/);
    assert.match(source, /set search_path = pg_catalog/);
    assert.doesNotMatch(source, /refund|chargeback/i);
    const rollback = fs.readFileSync('supabase/rehearsals/20260901010208_caissa_market_reader_entitlements_rollback.sql', 'utf8');
    assert.match(rollback, /rollback blocked: entitlement history exists/);
    assert.doesNotMatch(rollback, /delete from public\.product_entitlements|delete from public\.stripe_events/i);
});

test('Market logging allowlist drops URL, pathname, user and token fields', () => {
    const lines = [];
    const audit = createMarketReaderAuditLog((line) => lines.push(line));
    audit('market.download_authorized', {
        outcome: 'ok', productId: 'caissa-pgn-reader', releaseId: '1.0.0-rc1',
        userId: 'secret-user', pathname: 'secret-path', downloadUrl: 'secret-url', token: 'secret-token'
    });
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.deepEqual(Object.keys(record).sort(), ['event', 'outcome', 'productId', 'reason', 'releaseId', 'ts'].sort());
    assert.equal(lines[0].includes('secret'), false);
});
