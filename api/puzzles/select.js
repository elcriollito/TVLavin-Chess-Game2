import { setCorsHeaders } from '../_lib/auth.js';
import { checkRateLimit, getClientIP } from '../_lib/rate-limit.js';
import {
    PuzzleCatalogRequestError,
    PuzzleCatalogUnavailableError,
    fetchPuzzleSelection,
    parsePuzzleSelection,
} from '../_lib/puzzle-catalog.js';

export default async function handler(req, res, dependencies = {}) {
    if (!setCorsHeaders(req, res, ['GET'])) return;
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed' });

    const limiter = dependencies.checkRateLimit || checkRateLimit;
    const rate = limiter(getClientIP(req), { prefix: 'puzzles-select', windowMs: 60_000, max: 60 });
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfter));
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(429).json({ code: 'RATE_LIMITED', error: 'Too many puzzle requests' });
    }

    try {
        const selection = parsePuzzleSelection(req.query || {});
        const result = await (dependencies.fetchPuzzleSelection || fetchPuzzleSelection)(selection, dependencies);
        // Every initial response starts at a fresh random shuffle key; shared CDN
        // caching would make different users receive the same first page.
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).json(result);
    } catch (error) {
        res.setHeader('Cache-Control', 'private, no-store');
        if (error instanceof PuzzleCatalogRequestError) {
            return res.status(400).json({ code: 'INVALID_SELECTION', error: error.message });
        }
        if (error instanceof PuzzleCatalogUnavailableError) {
            return res.status(503).json({
                code: 'PUZZLE_CATALOG_UNAVAILABLE',
                error: 'The full puzzle catalog is temporarily unavailable.',
                fallback: '/data/puzzles/lichess-curated-preview.json',
            });
        }
        return res.status(500).json({ code: 'PUZZLE_SELECTION_FAILED', error: 'Puzzle selection failed' });
    }
}
