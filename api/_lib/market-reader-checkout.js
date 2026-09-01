import { MARKET_READER_PRODUCT_ID } from './market-reader-releases.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredString(value, code) {
    if (typeof value !== 'string' || value.length < 5 || value.length > 255) throw new Error(code);
    return value;
}
export function buildMarketReaderCheckoutFulfillment(event) {
    if (event?.type !== 'checkout.session.completed') return null;
    const session = event?.data?.object;
    if (session?.metadata?.type !== 'product') return null;
    if (session.metadata.product_id !== MARKET_READER_PRODUCT_ID) throw new Error('UNKNOWN_MARKET_PRODUCT');
    if (session.mode !== 'payment' || session.payment_status !== 'paid') throw new Error('CHECKOUT_NOT_PAID');
    const userId = UUID.test(session.metadata.caissa_user_id || '') ? session.metadata.caissa_user_id : null;
    if (!userId) throw new Error('IDENTITY_MAPPING_REQUIRED');
    const sessionId = requiredString(session.id, 'INVALID_SESSION_ID');
    const customerId = requiredString(session.customer, 'INVALID_CUSTOMER_ID');
    return Object.freeze({
        eventId: requiredString(event.id, 'INVALID_EVENT_ID'),
        eventType: event.type,
        businessKey: `checkout_session:${sessionId}`,
        operation: 'PRODUCT_ENTITLEMENT_GRANT',
        userId,
        customerId,
        productId: MARKET_READER_PRODUCT_ID,
        checkoutSessionId: sessionId
    });
}

export async function fulfillMarketReaderCheckout(supabase, command) {
    const { data, error } = await supabase.rpc('fulfill_market_product_checkout', {
        p_event_id: command.eventId,
        p_event_type: command.eventType,
        p_business_key: command.businessKey,
        p_user_id: command.userId,
        p_stripe_customer_id: command.customerId,
        p_product_id: command.productId,
        p_checkout_session_id: command.checkoutSessionId
    });
    if (error) return { ok: false, code: 'RETRYABLE_DATABASE_FAILURE' };
    const result = data?.[0] || data;
    if (result?.success === true) return { ok: true, code: 'COMPLETED' };
    if (['ALREADY_COMPLETED', 'ALREADY_PROCESSING', 'BUSINESS_OPERATION_ALREADY_COMPLETED'].includes(result?.code)) {
        return { ok: true, code: result.code, duplicate: true };
    }
    return { ok: false, code: 'RETRYABLE_DATABASE_FAILURE' };
}

export function getMarketReaderCheckoutContract(env = process.env) {
    return Object.freeze({
        enabled: false,
        productId: MARKET_READER_PRODUCT_ID,
        mode: 'payment',
        priceSource: 'STRIPE_PRICE_CAISSA_PGN_READER',
        successEvent: 'checkout.session.completed',
        fulfillment: 'durable-product-entitlement',
        productionBuyEnabled: false,
        configuredForStaging: env.VERCEL_TARGET_ENV === 'staging'
            && typeof env.STRIPE_PRICE_CAISSA_PGN_READER === 'string'
            && env.STRIPE_PRICE_CAISSA_PGN_READER.startsWith('price_')
    });
}
