/**
 * Vercel Serverless Function: POST /api/checkout/session
 *
 * Creates a Stripe Checkout Session for subscriptions or credit purchases.
 * Body: { type: 'subscription'|'credits', plan?: 'monthly'|'annual', package?: 'starter'|'standard'|'pro' }
 * Returns: { url } — redirect URL for Stripe Checkout
 */

import Stripe from 'stripe';
import { verifyAuth, setCorsHeaders } from '../_lib/auth.js';
import { getSupabase } from '../_lib/supabase.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { logAction, logError } from '../_lib/logger.js';

// Price ID mapping from env vars
function getPriceMap() {
    return {
        subscription: {
            monthly: process.env.STRIPE_PRICE_MONTHLY,
            annual: process.env.STRIPE_PRICE_ANNUAL
        },
        credits: {
            starter: { priceId: process.env.STRIPE_PRICE_CREDITS_25, amount: 25 },
            standard: { priceId: process.env.STRIPE_PRICE_CREDITS_75, amount: 75 },
            pro: { priceId: process.env.STRIPE_PRICE_CREDITS_200, amount: 200 }
        }
    };
}

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Verify Clerk token
    const auth = await verifyAuth(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    // Rate limit: 5 requests per 10 minutes per user
    const rl = checkRateLimit(auth.userId, { windowMs: 10 * 60 * 1000, max: 5, prefix: 'checkout' });
    if (!rl.allowed) {
        return res.status(429).json({ error: 'Too many checkout attempts. Please try again later.', retryAfter: rl.retryAfter });
    }

    const { type, plan, package: pkg } = req.body || {};

    if (!type || !['subscription', 'credits'].includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Must be "subscription" or "credits".' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
        logError('checkout', 'STRIPE_SECRET_KEY not configured');
        return res.status(500).json({ error: 'Payment system not configured' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const prices = getPriceMap();

    try {
        let sessionParams;

        if (type === 'subscription') {
            if (!plan || !['monthly', 'annual'].includes(plan)) {
                return res.status(400).json({ error: 'Invalid plan. Must be "monthly" or "annual".' });
            }

            const priceId = prices.subscription[plan];
            if (!priceId) {
                return res.status(500).json({ error: `Price not configured for ${plan} plan` });
            }

            // Look up or create Stripe customer
            const customerId = await _getOrCreateCustomer(stripe, auth);

            sessionParams = {
                mode: 'subscription',
                customer: customerId,
                line_items: [{ price: priceId, quantity: 1 }],
                metadata: {
                    clerk_id: auth.userId,
                    type: 'subscription',
                    plan: plan
                },
                success_url: `${_getBaseUrl(req)}/premium?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${_getBaseUrl(req)}/premium`
            };

        } else {
            // credits
            if (!pkg || !['starter', 'standard', 'pro'].includes(pkg)) {
                return res.status(400).json({ error: 'Invalid package. Must be "starter", "standard", or "pro".' });
            }

            const creditPkg = prices.credits[pkg];
            if (!creditPkg || !creditPkg.priceId) {
                return res.status(500).json({ error: `Price not configured for ${pkg} package` });
            }

            const customerId = await _getOrCreateCustomer(stripe, auth);

            sessionParams = {
                mode: 'payment',
                customer: customerId,
                line_items: [{ price: creditPkg.priceId, quantity: 1 }],
                metadata: {
                    clerk_id: auth.userId,
                    type: 'credits',
                    package: pkg,
                    credits_amount: String(creditPkg.amount)
                },
                success_url: `${_getBaseUrl(req)}/premium?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${_getBaseUrl(req)}/premium`
            };
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        logAction('checkout_created', { userId: auth.userId, detail: { type, plan: plan || pkg } });

        return res.status(200).json({ url: session.url });

    } catch (err) {
        logError('checkout', err, { userId: auth.userId, detail: { type, plan: plan || pkg } });
        return res.status(500).json({ error: 'Payment system is temporarily unavailable. Please try again.' });
    }
}

/**
 * Get or create a Stripe customer linked to this Clerk user.
 */
async function _getOrCreateCustomer(stripe, auth) {
    const supabase = getSupabase();

    // Check if user already has a Stripe customer ID
    const { data: user } = await supabase
        .from('users')
        .select('stripe_customer_id, email')
        .eq('clerk_id', auth.userId)
        .single();

    if (user?.stripe_customer_id) {
        return user.stripe_customer_id;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
        email: user?.email || auth.email,
        metadata: { clerk_id: auth.userId }
    });

    // Store customer ID in Supabase
    await supabase
        .from('users')
        .update({ stripe_customer_id: customer.id })
        .eq('clerk_id', auth.userId);

    return customer.id;
}

/**
 * Get base URL from request headers.
 */
function _getBaseUrl(req) {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers['host'];
    return `${proto}://${host}`;
}
