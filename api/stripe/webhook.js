/**
 * Vercel Serverless Function: POST /api/stripe/webhook
 *
 * Handles Stripe webhook events. NO Clerk auth — uses Stripe signature verification.
 * Events handled:
 *   - checkout.session.completed → subscription or credit purchase fulfillment
 *   - invoice.paid → recurring subscription renewal (add monthly credits)
 *   - customer.subscription.deleted → revoke premium
 */

import Stripe from 'stripe';
import { getSupabase } from '../_lib/supabase.js';
import { logAction, logError } from '../_lib/logger.js';

// Disable Vercel body parsing — we need the raw body for signature verification
export const config = {
    api: {
        bodyParser: false
    }
};

/**
 * Read raw body from request stream.
 */
function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    // CORS not needed for webhooks (server-to-server), but handle OPTIONS gracefully
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        logError('webhook', 'Stripe keys not configured');
        return res.status(500).json({ error: 'Webhook not configured' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Read raw body for signature verification
    let rawBody;
    try {
        rawBody = await getRawBody(req);
    } catch (err) {
        logError('webhook', err, { detail: 'Failed to read body' });
        return res.status(400).json({ error: 'Failed to read body' });
    }

    // Verify Stripe signature
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        logError('webhook', err, { detail: 'Signature verification failed' });
        return res.status(400).json({ error: 'Invalid signature' });
    }

    const supabase = getSupabase();

    // Idempotency: skip duplicate events
    try {
        const { data: existing } = await supabase
            .from('stripe_events')
            .select('event_id')
            .eq('event_id', event.id)
            .single();

        if (existing) {
            logAction('webhook_duplicate', { detail: { eventId: event.id, type: event.type } });
            return res.status(200).json({ received: true, duplicate: true });
        }
    } catch (lookupErr) {
        // If the table doesn't exist yet or lookup fails, continue processing
        logError('webhook_idempotency_check', lookupErr, { outcome: 'non-blocking' });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(supabase, stripe, event.data.object);
                break;

            case 'invoice.paid':
                await handleInvoicePaid(supabase, event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(supabase, event.data.object);
                break;

            default:
                logAction('webhook_unhandled', { detail: { type: event.type } });
        }

        // Record processed event for idempotency
        try {
            await supabase.from('stripe_events').insert({
                event_id: event.id,
                event_type: event.type
            });
        } catch (insertErr) {
            logError('webhook_idempotency_insert', insertErr, { outcome: 'non-blocking' });
        }

        return res.status(200).json({ received: true });

    } catch (err) {
        logError('webhook_handler', err, { detail: { type: event.type } });
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
}

/**
 * Handle checkout.session.completed
 * Fulfills subscription activation or credit purchase.
 */
async function handleCheckoutCompleted(supabase, stripe, session) {
    const meta = session.metadata || {};
    const clerkId = meta.clerk_id;

    if (!clerkId) {
        logError('webhook_checkout', 'Missing clerk_id in metadata');
        return;
    }

    if (meta.type === 'subscription') {
        // Activate premium — store customer ID and set is_premium
        const updates = {
            is_premium: true,
            stripe_customer_id: session.customer,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('clerk_id', clerkId);

        if (error) {
            logError('webhook_premium_activate', error, { userId: clerkId });
        } else {
            logAction('premium_activated', { userId: clerkId });
        }

    } else if (meta.type === 'credits') {
        // Add credits via RPC
        const amount = parseInt(meta.credits_amount, 10);
        if (!amount || amount <= 0) {
            logError('webhook_credits', 'Invalid credits_amount in metadata', { userId: clerkId, detail: { raw: meta.credits_amount } });
            return;
        }

        const { data, error } = await supabase.rpc('add_credits', {
            p_clerk_id: clerkId,
            p_amount: amount,
            p_reason: `purchase_${meta.package || 'unknown'}`
        });

        if (error) {
            logError('webhook_credits', error, { userId: clerkId });
        } else {
            logAction('credits_added', { userId: clerkId, detail: { amount, balance: data?.new_balance } });
        }
    }
}

/**
 * Handle invoice.paid
 * For recurring subscription renewals — add 50 monthly credits for premium users.
 */
async function handleInvoicePaid(supabase, invoice) {
    // Only process subscription invoices (not one-time payments)
    if (!invoice.subscription) return;

    // Skip the first invoice (already handled by checkout.session.completed)
    if (invoice.billing_reason === 'subscription_create') return;

    const customerId = invoice.customer;
    if (!customerId) return;

    // Find user by stripe_customer_id
    const { data: user, error: findError } = await supabase
        .from('users')
        .select('clerk_id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (findError || !user) {
        logError('webhook_invoice', 'User not found for customer', { detail: { customerId } });
        return;
    }

    // Add 50 monthly credits
    const { error } = await supabase.rpc('add_credits', {
        p_clerk_id: user.clerk_id,
        p_amount: 50,
        p_reason: 'subscription_renewal'
    });

    if (error) {
        logError('webhook_renewal', error, { userId: user.clerk_id });
    } else {
        logAction('credits_renewed', { userId: user.clerk_id, detail: { amount: 50 } });
    }
}

/**
 * Handle customer.subscription.deleted
 * Revoke premium access.
 */
async function handleSubscriptionDeleted(supabase, subscription) {
    const customerId = subscription.customer;
    if (!customerId) return;

    const { error } = await supabase
        .from('users')
        .update({
            is_premium: false,
            updated_at: new Date().toISOString()
        })
        .eq('stripe_customer_id', customerId);

    if (error) {
        logError('webhook_revoke', error, { detail: { customerId } });
    } else {
        logAction('premium_revoked', { detail: { customerId } });
    }
}
