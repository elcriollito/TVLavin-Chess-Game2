const TAG = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const CURSOR = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class PuzzleCatalogRequestError extends Error {}
export class PuzzleCatalogUnavailableError extends Error {}

function scalar(value, name) {
    if (Array.isArray(value)) throw new PuzzleCatalogRequestError(`${name} must appear once`);
    return value == null ? '' : String(value).trim();
}

function integer(value, name, fallback, minimum, maximum) {
    const raw = scalar(value, name);
    if (!raw) return fallback;
    if (!/^-?\d+$/.test(raw)) throw new PuzzleCatalogRequestError(`${name} must be an integer`);
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new PuzzleCatalogRequestError(`${name} is outside the allowed range`);
    }
    return parsed;
}

export function parsePuzzleSelection(query = {}) {
    const dimensions = ['themes', 'openings'].filter(name => scalar(query[name], name));
    if (dimensions.length !== 1) throw new PuzzleCatalogRequestError('provide exactly one of themes or openings');
    const parameter = dimensions[0];
    const tags = [...new Set(scalar(query[parameter], parameter).split(',').map(value => value.trim()).filter(Boolean))];
    if (!tags.length || tags.length > 12 || tags.some(value => !TAG.test(value))) {
        throw new PuzzleCatalogRequestError(`${parameter} must contain 1 to 12 official identifiers`);
    }
    const minRating = integer(query.minRating, 'minRating', 1600, 400, 3500);
    const maxRating = integer(query.maxRating, 'maxRating', 2000, 400, 3500);
    if (maxRating < minRating || maxRating - minRating > 600) {
        throw new PuzzleCatalogRequestError('rating range must be ordered and no wider than 600 points');
    }
    const limit = integer(query.limit, 'limit', 8, 1, 16);
    const defaultQuality = parameter === 'themes' && tags.length === 1 && tags[0] === 'equality' ? 'relaxed' : 'standard';
    const quality = scalar(query.quality, 'quality') || defaultQuality;
    if (!['standard', 'relaxed', 'all'].includes(quality)) throw new PuzzleCatalogRequestError('quality is invalid');
    const themeMode = scalar(query.themeMode, 'themeMode') || 'any';
    if (!['any', 'all'].includes(themeMode) || (parameter !== 'themes' && themeMode !== 'any')) {
        throw new PuzzleCatalogRequestError('themeMode is invalid');
    }
    const cursor = scalar(query.cursor, 'cursor');
    if (cursor && (cursor.length > 1024 || !CURSOR.test(cursor))) throw new PuzzleCatalogRequestError('cursor is invalid');
    return {
        dimension: parameter === 'themes' ? 'theme' : 'opening',
        parameter,
        tags,
        minRating,
        maxRating,
        limit,
        cursor,
        quality,
        themeMode,
        maxDeviation: 100,
        minPopularity: 80,
        minPlays: quality === 'standard' ? 500 : quality === 'relaxed' ? 100 : 0,
    };
}

export function buildPuzzleCatalogUrl(baseUrl, selection) {
    let url;
    try { url = new URL('/v1/select', baseUrl); }
    catch { throw new PuzzleCatalogUnavailableError('Puzzle catalog configuration is invalid'); }
    url.searchParams.set(selection.parameter, selection.tags.join(','));
    url.searchParams.set('minRating', String(selection.minRating));
    url.searchParams.set('maxRating', String(selection.maxRating));
    url.searchParams.set('limit', String(selection.limit));
    url.searchParams.set('quality', selection.quality);
    if (selection.dimension === 'theme' && selection.themeMode === 'all') url.searchParams.set('themeMode', 'all');
    if (selection.cursor) url.searchParams.set('cursor', selection.cursor);
    return url;
}

const toPuzzle = row => ({
    id: row.puzzle_id,
    fen: row.fen,
    moves: row.moves,
    rating: row.rating,
    deviation: row.rating_deviation,
    popularity: row.popularity,
    plays: row.nb_plays,
    themes: row.themes,
    gameUrl: row.game_url,
    openingTags: row.opening_tags,
});

export async function selectLocalPuzzles(selection, databasePath) {
    const { DatabaseSync } = await import('node:sqlite');
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
        if (selection.dimension !== 'theme') throw new PuzzleCatalogUnavailableError('Local opening selection is not supported');
        const placeholders = selection.tags.map(() => '?').join(',');
        const qualityPredicate = selection.minPlays === 0 ? '1 = 1' : selection.minPlays === 100
            ? 'p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 100'
            : 'p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 500';
        const allThemes = selection.themeMode === 'all';
        const themePredicate = selection.tags.length === 1 && selection.tags[0] === 'equality'
            ? "instr(' ' || p.themes || ' ', ' equality ') > 0"
            : allThemes
                ? selection.tags.map(() => 'exists (select 1 from puzzle_themes t where t.puzzle_id = p.puzzle_id and t.theme = ?)').join(' and ')
                : `exists (select 1 from puzzle_themes t where t.puzzle_id = p.puzzle_id and t.theme in (${placeholders}))`;
        const statement = database.prepare(
            `select p.puzzle_id, p.fen, p.moves, p.rating, p.rating_deviation, p.popularity,
                    p.nb_plays, p.themes, p.game_url, p.opening_tags
               from puzzles p
              where ${themePredicate}
                and p.rating between ? and ?
                and ${qualityPredicate}
              order by p.rating, p.popularity desc, p.nb_plays desc, p.puzzle_id
              limit ? offset ?`
        );
        const themeParameters = selection.tags.length === 1 && selection.tags[0] === 'equality' ? [] : selection.tags;
        const rows = statement.all(
            ...themeParameters, selection.minRating, selection.maxRating,
            selection.limit, 0,
        ).map(row => ({
            ...row,
            themes: String(row.themes).split(' '),
            opening_tags: String(row.opening_tags).split(' ').filter(Boolean),
        }));
        return {
            source: 'local-full-catalog',
            sourceVersion: '2026-09-10',
            filters: selection,
            limit: selection.limit,
            estimatedTotal: null,
            cursor: null,
            hasMore: false,
            puzzles: rows.map(toPuzzle),
        };
    } finally {
        database.close();
    }
}

export async function fetchPuzzleSelection(selection, dependencies = {}) {
    const env = dependencies.env || process.env;
    const fetchFn = dependencies.fetch || fetch;
    if (env.CAISSA_PUZZLE_ALLOW_LOCAL_SQLITE === '1' && env.CAISSA_PUZZLE_SQLITE_PATH && env.VERCEL_ENV !== 'production') {
        try {
            return await (dependencies.selectLocalPuzzles || selectLocalPuzzles)(selection, env.CAISSA_PUZZLE_SQLITE_PATH);
        } catch {
            throw new PuzzleCatalogUnavailableError('Local puzzle catalog request failed');
        }
    }
    const baseUrl = env.CAISSA_PUZZLE_WORKER_URL;
    const workerToken = env.CAISSA_PUZZLE_WORKER_TOKEN;
    if (!baseUrl || !workerToken) throw new PuzzleCatalogUnavailableError('Puzzle catalog is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs || 3000);
    try {
        const response = await fetchFn(buildPuzzleCatalogUrl(baseUrl, selection), {
            headers: {
                Authorization: `Bearer ${workerToken}`,
                Accept: 'application/json',
            },
            signal: controller.signal,
        });
        if (!response.ok) throw new PuzzleCatalogUnavailableError(`Puzzle catalog returned HTTP ${response.status}`);
        const payload = await response.json();
        if (!payload || !Array.isArray(payload.puzzles)) throw new PuzzleCatalogUnavailableError('Puzzle catalog returned an invalid response');
        return {
            source: 'full-catalog',
            sourceVersion: payload.sourceVersion || '2026-09-10',
            filters: selection,
            limit: selection.limit,
            cursor: typeof payload.cursor === 'string' ? payload.cursor : null,
            estimatedTotal: Number.isSafeInteger(payload.estimatedTotal) ? payload.estimatedTotal : null,
            hasMore: payload.hasMore === true,
            puzzles: payload.puzzles.map(row => toPuzzle({
                ...row,
                themes: Array.isArray(row.themes) ? row.themes : String(row.themes || '').split(' ').filter(Boolean),
                opening_tags: Array.isArray(row.opening_tags) ? row.opening_tags : String(row.opening_tags || '').split(' ').filter(Boolean),
            })),
        };
    } catch (error) {
        if (error instanceof PuzzleCatalogUnavailableError) throw error;
        throw new PuzzleCatalogUnavailableError(error?.name === 'AbortError'
            ? 'Puzzle catalog request timed out' : 'Puzzle catalog request failed');
    } finally {
        clearTimeout(timeout);
    }
}
