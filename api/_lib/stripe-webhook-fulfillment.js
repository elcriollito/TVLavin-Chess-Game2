import { CREDIT_OFFERS } from './credit-offers.js';

const CREDIT_PACKAGES = Object.freeze(Object.fromEntries(
    Object.entries(CREDIT_OFFERS).map(([key, offer]) => [key, offer.credits])
));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredString(value, name) {
    if (typeof value !== 'string' || !value || value.length > 255) throw new Error(`INVALID_${name}`);
    return value;
}

export function buildStripeFulfillmentCommand(event) {
    requiredString(event?.id, 'EVENT_ID');
    requiredString(event?.type, 'EVENT_TYPE');
    const object = event?.data?.object;
    if (!object || typeof object !== 'object') throw new Error('INVALID_EVENT_OBJECT');

    if (event.type === 'checkout.session.completed') {
        const sessionId = requiredString(object.id, 'SESSION_ID');
        const customerId = requiredString(object.customer, 'CUSTOMER_ID');
        const metadata = object.metadata || {};
        const userId = UUID.test(metadata.caissa_user_id || '') ? metadata.caissa_user_id : null;
        const legacySubject = typeof metadata.clerk_id === 'string' ? metadata.clerk_id : null;
        if (!userId && !legacySubject) throw new Error('IDENTITY_MAPPING_REQUIRED');

        if (metadata.type === 'credits') {
            if (object.mode !== 'payment' || object.payment_status !== 'paid') {
                throw new Error('CHECKOUT_NOT_PAID');
            }
            const amount = CREDIT_PACKAGES[metadata.package];
            if (!amount) throw new Error('UNKNOWN_CREDIT_PACKAGE');
            return {
                eventId: event.id,
                eventType: event.type,
                businessKey: `checkout_session:${sessionId}`,
                operation: 'CREDIT_PURCHASE',
                userId,
                legacySubject,
                customerId,
                creditAmount: amount,
                reason: `purchase_${metadata.package}`
            };
        }
        if (metadata.type === 'subscription') {
            if (object.mode !== 'subscription' || object.payment_status !== 'paid') {
                throw new Error('CHECKOUT_NOT_PAID');
            }
            return {
                eventId: event.id,
                eventType: event.type,
                businessKey: `checkout_session:${sessionId}`,
                operation: 'SUBSCRIPTION_ACTIVATE',
                userId,
                legacySubject,
                customerId,
                creditAmount: 0,
                reason: 'subscription_activation'
            };
        }
        throw new Error('UNKNOWN_CHECKOUT_TYPE');
    }

    if (event.type === 'invoice.paid') {
        if (!object.subscription || object.billing_reason === 'subscription_create') return null;
        const invoiceId = requiredString(object.id, 'INVOICE_ID');
        const customerId = requiredString(object.customer, 'CUSTOMER_ID');
        return {
            eventId: event.id,
            eventType: event.type,
            businessKey: `invoice:${invoiceId}`,
            operation: 'SUBSCRIPTION_RENEWAL',
            userId: null,
            legacySubject: null,
            customerId,
            creditAmount: 50,
            reason: 'subscription_renewal'
        };
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscriptionId = requiredString(object.id, 'SUBSCRIPTION_ID');
        const customerId = requiredString(object.customer, 'CUSTOMER_ID');
        return {
            eventId: event.id,
            eventType: event.type,
            businessKey: `subscription_delete:${subscriptionId}`,
            operation: 'SUBSCRIPTION_DELETE',
            userId: null,
            legacySubject: null,
            customerId,
            creditAmount: 0,
            reason: 'subscription_deleted'
        };
    }

    return null;
}

export async function fulfillVerifiedStripeEvent(supabase, event) {
    const command = buildStripeFulfillmentCommand(event);
    if (!command) return { ok: true, code: 'IGNORED' };
    const { data, error } = await supabase.rpc('fulfill_stripe_webhook_event', {
        p_event_id: command.eventId,
        p_event_type: command.eventType,
        p_business_key: command.businessKey,
        p_operation: command.operation,
        p_user_id: command.userId,
        p_legacy_clerk_subject: command.legacySubject,
        p_stripe_customer_id: command.customerId,
        p_credit_amount: command.creditAmount,
        p_reason: command.reason
    });
    if (error) return { ok: false, code: 'RETRYABLE_DATABASE_FAILURE' };
    const result = data?.[0] || data;
    if (result?.success === true) return { ok: true, code: 'COMPLETED' };
    if (['ALREADY_COMPLETED', 'ALREADY_PROCESSING', 'BUSINESS_OPERATION_ALREADY_COMPLETED'].includes(result?.code)) {
        return { ok: true, code: result.code, duplicate: true };
    }
    return { ok: false, code: 'RETRYABLE_DATABASE_FAILURE' };
}

export const stripeWebhookInternals = Object.freeze({ creditPackages: CREDIT_PACKAGES });
