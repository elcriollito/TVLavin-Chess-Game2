/**
 * Stripe signature-verified webhook. Economic fulfillment is one PostgreSQL RPC.
 */
import Stripe from 'stripe';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';
import { fulfillVerifiedStripeEvent } from '../_lib/stripe-webhook-fulfillment.js';

export const config = { api: { bodyParser: false } };
const MAX_WEBHOOK_BYTES = 1024 * 1024;

function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_WEBHOOK_BYTES) {
                reject(new Error('WEBHOOK_BODY_TOO_LARGE'));
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export function createStripeWebhookHandler(dependencies = {}) {
    const StripeClass = dependencies.Stripe || Stripe;
    const getDatabase = dependencies.getSupabase || getSupabase;
    const fulfill = dependencies.fulfillVerifiedStripeEvent || fulfillVerifiedStripeEvent;

    return async function handler(req, res) {
        if (req.method === 'OPTIONS') return res.status(200).end();
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
            logError('webhook', 'Stripe keys not configured');
            return res.status(500).json({ error: 'Webhook not configured' });
        }

        let rawBody;
        try { rawBody = await getRawBody(req); } catch {
            return res.status(400).json({ error: 'Invalid webhook body' });
        }

        let event;
        try {
            const stripe = new StripeClass(process.env.STRIPE_SECRET_KEY);
            event = stripe.webhooks.constructEvent(
                rawBody,
                req.headers['stripe-signature'],
                process.env.STRIPE_WEBHOOK_SECRET
            );
        } catch {
            return res.status(400).json({ error: 'Invalid signature' });
        }

        let result;
        try {
            result = await fulfill(getDatabase(), event);
        } catch {
            logError('webhook_handler', 'Verified event rejected', { detail: { eventId: event.id, type: event.type } });
            return res.status(200).json({ received: true, rejected: true });
        }

        if (!result.ok) {
            logError('webhook_handler', 'Retryable fulfillment failure', { detail: { eventId: event.id, type: event.type } });
            return res.status(500).json({ error: 'Webhook processing failed' });
        }

        logAction('webhook_processed', {
            detail: { eventId: event.id, type: event.type, status: result.code }
        });
        return res.status(200).json({ received: true, duplicate: result.duplicate === true });
    };
}

export default createStripeWebhookHandler();
