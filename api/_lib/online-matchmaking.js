export function ratingWindow(waitMs, options = {}) {
    const initial = Number.isFinite(options.initial) ? options.initial : 100;
    const step = Number.isFinite(options.step) ? options.step : 50;
    const everyMs = Number.isFinite(options.everyMs) ? options.everyMs : 15_000;
    const maximum = Number.isFinite(options.maximum) ? options.maximum : 600;
    const expansions = Math.max(0, Math.floor(Math.max(0, waitMs) / everyMs));
    return Math.min(maximum, initial + (expansions * step));
}

export function canMatch(a, b, now = Date.now()) {
    if (!a || !b || a.userId === b.userId) return false;
    if (a.state !== 'queued' || b.state !== 'queued') return false;
    if (a.pool !== b.pool || a.rated !== b.rated
        || a.baseMs !== b.baseMs || a.incrementMs !== b.incrementMs) return false;
    const aCreatedAt = Number(a.createdAt);
    const bCreatedAt = Number(b.createdAt);
    const aWait = Math.max(0, now - (Number.isFinite(aCreatedAt) ? aCreatedAt : now));
    const bWait = Math.max(0, now - (Number.isFinite(bCreatedAt) ? bCreatedAt : now));
    const difference = Math.abs(Number(a.rating) - Number(b.rating));
    return difference <= Math.max(ratingWindow(aWait), ratingWindow(bWait));
}

export function assignColors(a, b, entropy = Math.random()) {
    if (!a?.userId || !b?.userId || a.userId === b.userId) throw new TypeError('Two distinct players are required.');
    const aIsWhite = Number(entropy) < 0.5;
    return Object.freeze({
        whiteUserId: aIsWhite ? a.userId : b.userId,
        blackUserId: aIsWhite ? b.userId : a.userId
    });
}
