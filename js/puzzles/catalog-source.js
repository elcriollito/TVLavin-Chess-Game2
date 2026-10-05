import { poolFor } from './model.js';

const FALLBACK_URL = '/data/puzzles/lichess-curated-preview.json';
const COUNTS_URL = '/data/puzzles/lichess-full-counts.json';

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
        this.counts = null;
        this.queues = new Map();
        this.cursors = new Map();
        this.remoteExhausted = new Set();
        this.remoteRetryAt = 0;
    }

    async initialize() {
        const response = await this.fetch(this.fallbackUrl);
        if (!response.ok) throw new Error(`Puzzle collection HTTP ${response.status}`);
        this.preview = await response.json();
        return this.preview;
    }

    async loadCounts() {
        try {
            const response = await this.fetch(COUNTS_URL);
            if (!response.ok) return false;
            const manifest = await response.json();
            if (manifest.schemaVersion !== 1 || manifest.sourceVersion !== '2026-09-10'
                || manifest.puzzles !== 6_100_952 || !manifest.counts) return false;
            this.counts = manifest.counts;
            return true;
        } catch { return false; }
    }

    countFor(category, theme, target, difficulty, requiredThemes = []) {
        const intersection = [...new Set([...(requiredThemes || []), ...(theme ? [theme] : [])])];
        const key = intersection.length > 1
            ? `intersection:${intersection.join('+')}`
            : theme ? `theme:${theme}` : `category:${category}`;
        const record = this.counts?.[key];
        const quality = theme === 'equality' ? 'relaxed' : 'standard';
        const matching = record?.ranges?.[`${target}:${difficulty}:${quality}`];
        return Number.isInteger(record?.total) && Number.isInteger(matching)
            ? { total: record.total, matching } : null;
    }

    keyFor({ category, theme, target, difficulty, requiredThemes = [] }) {
        return JSON.stringify([category, theme, target, difficulty, [...requiredThemes].sort()]);
    }

    fallback({ category, theme, target, difficulty, requiredThemes = [] }, seen) {
        const pool = poolFor(this.preview.puzzles, {
            category: this.preview.categories[category], theme, target, difficulty,
        }).filter(puzzle => requiredThemes.every(tag => puzzle.themes.includes(tag)));
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

        if (allowRemote && !this.remoteExhausted.has(key) && this.now() >= this.remoteRetryAt) {
            const [minRating, maxRating] = ratingBounds(selection.target, selection.difficulty);
            const tags = [...new Set([
                ...(selection.requiredThemes || []),
                ...(selection.theme ? [selection.theme] : this.preview.categories[selection.category]),
            ])];
            const cursor = this.cursors.get(key) || '';
            const params = new URLSearchParams({
                themes: tags.join(','), minRating: String(minRating), maxRating: String(maxRating),
                limit: '12',
            });
            if (tags.length > 1 && selection.requiredThemes?.length) params.set('themeMode', 'all');
            if (cursor) params.set('cursor', cursor);
            try {
                const response = await this.fetch(`/api/puzzles/select?${params}`);
                if (!response.ok) throw new Error(`Puzzle API HTTP ${response.status}`);
                const payload = await response.json();
                if (!Array.isArray(payload.puzzles) || !payload.puzzles.length) {
                    throw new Error('Puzzle API returned no candidates');
                }
                const shuffled = payload.puzzles
                    .filter(puzzle => tags.every(tag => selection.requiredThemes?.length ? puzzle.themes?.includes(tag) : true))
                    .sort(() => Math.random() - 0.5);
                if (!shuffled.length) throw new Error('Puzzle API returned no matching candidates');
                shuffled.estimatedTotal = payload.estimatedTotal;
                shuffled.catalogSource = payload.source;
                this.queues.set(key, shuffled);
                this.cursors.set(key, payload.hasMore && payload.cursor ? payload.cursor : '');
                if (!payload.hasMore || !payload.cursor) this.remoteExhausted.add(key);
                return this.next(selection, seen, { allowRemote });
            } catch {
                this.remoteRetryAt = this.now() + 30_000;
            }
        }
        return this.fallback(selection, seen);
    }
}
