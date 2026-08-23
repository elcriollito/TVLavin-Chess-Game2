export const CREDIT_OFFERS = Object.freeze({
    starter: Object.freeze({ key: 'starter', credits: 25, priceEnv: 'STRIPE_PRICE_CREDITS_25' }),
    standard: Object.freeze({ key: 'standard', credits: 75, priceEnv: 'STRIPE_PRICE_CREDITS_75' }),
    pro: Object.freeze({ key: 'pro', credits: 200, priceEnv: 'STRIPE_PRICE_CREDITS_200' })
});

export function getCreditOffer(key, env = process.env) {
    const offer = CREDIT_OFFERS[key];
    if (!offer) return null;
    return { ...offer, priceId: env[offer.priceEnv] || null };
}

export function isCreditStoreEnabled(env = process.env) {
    return env.CAISSA_CREDIT_STORE_ENABLED === 'true';
}
