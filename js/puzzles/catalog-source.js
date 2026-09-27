import { poolFor } from './model.js';

const FALLBACK_URL = '/data/puzzles/lichess-curated-preview.json';

export function ratingBounds(target, difficulty) {
    return difficulty === 'easier' ? [target - 450, target - 100]
        : difficulty === 'challenge' ? [target, target + 400]
            : [target - 200, target + 200];
}

export class PuzzleCatalogSource {
    constructor({ fetchFn = (...args) => globalThis.fetch(...args), fallbackUrl = FALLBACK_URL, now = () => Date.now() } = {}) {
        this.fetch = fetchFn;
        this.fallbackUrl = fallbackUrl;
        this.now = now;
        this.preview = null;
        this.queues = new Map();
        this.pages = new Map();
        this.remoteRetryAt = 0;
    }

    async initialize() {
        const response = await this.fetch(this.fallbackUrl);
        if (!response.ok) throw new Error(`Puzzle collection HTTP ${response.status}`);
        this.preview = await response.json();
        return this.preview;
    }

    keyFor({ category, theme, target, difficulty }) {
        return JSON.stringify([category, theme, target, difficulty]);
    }

    fallback({ category, theme, target, difficulty }, seen) {
        const pool = poolFor(this.preview.puzzles, {
            category: this.preview.categories[category], theme, target, difficulty,
        });
        let candidates = pool.filter(puzzle => !seen.has(puzzle.id));
        if (!candidates.length) candidates = pool;
        return {
            puzzle: candidates[Math.floor(Math.random() * candidates.length)] || null,
            source: 'curated-fallback',
            estimatedTotal: pool.length,
        };
    }

    async next(selection, seen, { allowRemote = true } = {}) {
        const key = this.keyFor(selection);
        const queue = this.queues.get(key) || [];
        while (queue.length) {
            const puzzle = queue.shift();
            if (!seen.has(puzzle.id)) {
                return { puzzle, source: queue.catalogSource, estimatedTotal: queue.estimatedTotal };
            }
        }

        if (allowRemote && this.now() >= this.remoteRetryAt) {
            const [minRating, maxRating] = ratingBounds(selection.target, selection.difficulty);
            const tags = selection.theme ? [selection.theme] : this.preview.categories[selection.category];
            const page = this.pages.get(key) || 0;
            const params = new URLSearchParams({
                themes: tags.join(','), minRating: String(minRating), maxRating: String(maxRating),
                limit: '12', page: String(page),
            });
            try {
                const response = await this.fetch(`/api/puzzles/select?${params}`);
                if (!response.ok) throw new Error(`Puzzle API HTTP ${response.status}`);
                const payload = await response.json();
                if (!Array.isArray(payload.puzzles) || !payload.puzzles.length) {
                    throw new Error('Puzzle API returned no candidates');
                }
                const shuffled = payload.puzzles.slice().sort(() => Math.random() - 0.5);
                shuffled.estimatedTotal = payload.estimatedTotal;
                shuffled.catalogSource = payload.source;
                this.queues.set(key, shuffled);
                this.pages.set(key, payload.hasMore && page < 50 ? page + 1 : 0);
                return this.next(selection, seen, { allowRemote });
            } catch {
                this.remoteRetryAt = this.now() + 30_000;
            }
        }
        return this.fallback(selection, seen);
    }
}
