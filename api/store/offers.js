import Stripe from 'stripe';
import { verifyAuth, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { checkRateLimit } from '../_lib/rate-limit.js';
import { CREDIT_OFFERS, getCreditOffer, isCreditStoreEnabled } from '../_lib/credit-offers.js';

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await (dependencies.verifyAuth || verifyAuth)(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    const rl = checkRateLimit(auth.userId, { windowMs: 60 * 1000, max: 12, prefix: 'store-offers' });
    if (!rl.allowed) return res.status(429).json({ error: 'Too many requests.', retryAfter: rl.retryAfter });

    const enabled = isCreditStoreEnabled() && Boolean(process.env.STRIPE_SECRET_KEY);
    const stripe = enabled ? new (dependencies.Stripe || Stripe)(process.env.STRIPE_SECRET_KEY) : null;
    const offers = [];
    for (const key of Object.keys(CREDIT_OFFERS)) {
        const offer = getCreditOffer(key);
        let price = null;
        if (stripe && offer.priceId) {
            try {
                const stripePrice = await stripe.prices.retrieve(offer.priceId);
                if (stripePrice.active && Number.isInteger(stripePrice.unit_amount) && stripePrice.currency) {
                    price = { amount: stripePrice.unit_amount, currency: stripePrice.currency };
                }
            } catch (_) {
                price = null;
            }
        }
        offers.push({ key, credits: offer.credits, price, available: Boolean(enabled && offer.priceId && price) });
    }

    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.status(200).json({ enabled, offers });
}
