import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import test from 'node:test';
import {
    buildStripeFulfillmentCommand,
    fulfillVerifiedStripeEvent,
    stripeWebhookInternals
} from '../api/_lib/stripe-webhook-fulfillment.js';
import { createStripeWebhookHandler } from '../api/stripe/webhook.js';

const uuid = '00000000-0000-4000-8000-00000000000f';
const checkoutEvent = (overrides = {}) => ({
    id: 'evt_test_checkout_1',
    type: 'checkout.session.completed',
    data: {
        object: {
            id: 'cs_test_purchase_1',
            customer: 'cus_test_atomic',
            mode: 'payment',
            payment_status: 'paid',
            metadata: {
                type: 'credits',
                package: 'starter',
                credits_amount: '999999',
                caissa_user_id: uuid,
                clerk_id: 'FORGED_OR_LEGACY_SUBJECT'
            },
            ...overrides
        }
    }
});

test('credit amount is derived only from the server allowlist', () => {
    assert.deepEqual(stripeWebhookInternals.creditPackages, { starter: 25, standard: 75, pro: 200 });
    const command = buildStripeFulfillmentCommand(checkoutEvent());
    assert.equal(command.creditAmount, 25);
    assert.equal(command.reason, 'purchase_starter');
    assert.equal(command.userId, uuid);
});

test('unknown credit packages and malformed supported events fail closed', () => {
    assert.throws(() => buildStripeFulfillmentCommand(checkoutEvent({ metadata: { type: 'credits', package: 'attacker', caissa_user_id: uuid } })), /UNKNOWN_CREDIT_PACKAGE/);
    assert.throws(() => buildStripeFulfillmentCommand({ id: 'evt_test_bad', type: 'checkout.session.completed', data: {} }), /INVALID_EVENT_OBJECT/);
    assert.throws(() => buildStripeFulfillmentCommand(checkoutEvent({ customer: null })), /INVALID_CUSTOMER_ID/);
});

test('unpaid or mode-confused Checkout Sessions cannot authorize value', () => {
    assert.throws(() => buildStripeFulfillmentCommand(checkoutEvent({ payment_status: 'unpaid' })), /CHECKOUT_NOT_PAID/);
    assert.throws(() => buildStripeFulfillmentCommand(checkoutEvent({ mode: 'subscription' })), /CHECKOUT_NOT_PAID/);
});

test('business keys use the economic Stripe object, not event ID', () => {
    const first = buildStripeFulfillmentCommand(checkoutEvent());
    const second = buildStripeFulfillmentCommand({ ...checkoutEvent(), id: 'evt_test_checkout_2' });
    assert.notEqual(first.eventId, second.eventId);
    assert.equal(first.businessKey, second.businessKey);
    const invoice = buildStripeFulfillmentCommand({
        id: 'evt_test_invoice', type: 'invoice.paid',
        data: { object: { id: 'in_test_period_1', customer: 'cus_test_atomic', subscription: 'sub_test_1', billing_reason: 'subscription_cycle' } }
    });
    assert.equal(invoice.businessKey, 'invoice:in_test_period_1');
    assert.equal(invoice.creditAmount, 50);
});

test('non-economic and first subscription invoice events are ignored', () => {
    assert.equal(buildStripeFulfillmentCommand({ id: 'evt_test_unknown', type: 'payment_intent.succeeded', data: { object: {} } }), null);
    assert.equal(buildStripeFulfillmentCommand({
        id: 'evt_test_first_invoice', type: 'invoice.paid',
        data: { object: { subscription: 'sub_test_1', billing_reason: 'subscription_create' } }
    }), null);
});

test('verified event calls one atomic RPC with server-derived fields', async () => {
    let call;
    const supabase = { rpc: async (name, params) => { call = { name, params }; return { data: [{ success: true, code: 'COMPLETED' }], error: null }; } };
    const result = await fulfillVerifiedStripeEvent(supabase, checkoutEvent());
    assert.deepEqual(result, { ok: true, code: 'COMPLETED' });
    assert.equal(call.name, 'fulfill_stripe_webhook_event');
    assert.equal(call.params.p_credit_amount, 25);
    assert.equal(call.params.p_legacy_clerk_subject, 'FORGED_OR_LEGACY_SUBJECT');
});

test('event and business duplicates are safe 2xx outcomes', async () => {
    for (const code of ['ALREADY_COMPLETED', 'ALREADY_PROCESSING', 'BUSINESS_OPERATION_ALREADY_COMPLETED']) {
        const supabase = { rpc: async () => ({ data: [{ success: false, code }], error: null }) };
        assert.deepEqual(await fulfillVerifiedStripeEvent(supabase, checkoutEvent()), { ok: true, code, duplicate: true });
    }
});

test('database errors are retryable and fail closed', async () => {
    const supabase = { rpc: async () => ({ data: null, error: new Error('synthetic database outage') }) };
    assert.deepEqual(await fulfillVerifiedStripeEvent(supabase, checkoutEvent()), { ok: false, code: 'RETRYABLE_DATABASE_FAILURE' });
});

function responseHarness() {
    return {
        statusCode: 0, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { return this; }
    };
}

function request(body = '{}') {
    const req = Readable.from([Buffer.from(body)]);
    req.method = 'POST';
    req.headers = { 'stripe-signature': 'synthetic-signature' };
    return req;
}

async function withStripeEnvironment(fn) {
    const previousKey = process.env.STRIPE_SECRET_KEY;
    const previousWebhook = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = 'synthetic_server_key';
    process.env.STRIPE_WEBHOOK_SECRET = 'synthetic_webhook_secret';
    try { await fn(); } finally {
        if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousKey;
        if (previousWebhook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = previousWebhook;
    }
}

test('invalid signature is rejected before database access', async () => withStripeEnvironment(async () => {
    let databaseAccessed = false;
    class StripeMock { constructor() { this.webhooks = { constructEvent: () => { throw new Error('invalid'); } }; } }
    const handler = createStripeWebhookHandler({ Stripe: StripeMock, getSupabase: () => { databaseAccessed = true; } });
    const res = responseHarness();
    await handler(request(), res);
    assert.equal(res.statusCode, 400);
    assert.equal(databaseAccessed, false);
}));

test('official raw-body verification precedes fulfillment', async () => withStripeEnvironment(async () => {
    let rawObserved;
    let fulfilled = 0;
    class StripeMock {
        constructor() {
            this.webhooks = { constructEvent: (raw) => { rawObserved = raw; return checkoutEvent(); } };
        }
    }
    const handler = createStripeWebhookHandler({
        Stripe: StripeMock,
        getSupabase: () => ({}),
        fulfillVerifiedStripeEvent: async () => { fulfilled += 1; return { ok: true, code: 'COMPLETED' }; }
    });
    const res = responseHarness();
    await handler(request('{"synthetic":true}'), res);
    assert.equal(Buffer.isBuffer(rawObserved), true);
    assert.equal(fulfilled, 1);
    assert.equal(res.statusCode, 200);
}));

test('retryable failure returns non-2xx while duplicate returns 2xx', async () => withStripeEnvironment(async () => {
    class StripeMock { constructor() { this.webhooks = { constructEvent: () => checkoutEvent() }; } }
    for (const [result, expected] of [[{ ok: false }, 500], [{ ok: true, code: 'ALREADY_COMPLETED', duplicate: true }, 200]]) {
        const handler = createStripeWebhookHandler({ Stripe: StripeMock, getSupabase: () => ({}), fulfillVerifiedStripeEvent: async () => result });
        const res = responseHarness(); await handler(request(), res); assert.equal(res.statusCode, expected);
    }
}));

test('permanently malformed signed event is acknowledged as rejected', async () => withStripeEnvironment(async () => {
    class StripeMock { constructor() { this.webhooks = { constructEvent: () => ({ id: 'evt_test_malformed', type: 'checkout.session.completed', data: {} }) }; } }
    let fulfillmentInvoked = false;
    const handler = createStripeWebhookHandler({
        Stripe: StripeMock,
        getSupabase: () => ({}),
        fulfillVerifiedStripeEvent: async () => { fulfillmentInvoked = true; throw new Error('malformed'); }
    });
    const res = responseHarness(); await handler(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.rejected, true);
    assert.equal(fulfillmentInvoked, true);
}));

test('static guard prevents check-fulfill-insert and metadata amount regression', () => {
    const webhook = fs.readFileSync('api/stripe/webhook.js', 'utf8');
    const fulfillment = fs.readFileSync('api/_lib/stripe-webhook-fulfillment.js', 'utf8');
    const checkout = fs.readFileSync('api/checkout/session.js', 'utf8');
    assert.doesNotMatch(webhook, /from\(['"]stripe_events|add_credits|credits_amount/);
    assert.match(fulfillment, /fulfill_stripe_webhook_event/);
    assert.doesNotMatch(checkout, /credits_amount/);
    assert.match(checkout, /userError[\s\S]+updateError/);
});
