const THEME = /^[A-Za-z][A-Za-z0-9]{0,39}$/;

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
    const themes = [...new Set(scalar(query.themes, 'themes').split(',').map(value => value.trim()).filter(Boolean))];
    if (!themes.length || themes.length > 12 || themes.some(value => !THEME.test(value))) {
        throw new PuzzleCatalogRequestError('themes must contain 1 to 12 official theme identifiers');
    }
    const minRating = integer(query.minRating, 'minRating', 1600, 400, 3500);
    const maxRating = integer(query.maxRating, 'maxRating', 2000, 400, 3500);
    if (maxRating < minRating || maxRating - minRating > 600) {
        throw new PuzzleCatalogRequestError('rating range must be ordered and no wider than 600 points');
    }
    const limit = integer(query.limit, 'limit', 8, 1, 16);
    const page = integer(query.page, 'page', 0, 0, 50);
    return {
        themes,
        minRating,
        maxRating,
        limit,
        page,
        maxDeviation: 100,
        minPopularity: 80,
        minPlays: themes.length === 1 && themes[0] === 'equality' ? 100 : 500,
    };
}

export function buildPuzzleCatalogUrl(baseUrl, selection) {
    let url;
    try { url = new URL('/rest/v1/puzzles', baseUrl); }
    catch { throw new PuzzleCatalogUnavailableError('Puzzle catalog configuration is invalid'); }
    const columns = [
        'puzzle_id', 'fen', 'moves', 'rating', 'rating_deviation', 'popularity',
        'nb_plays', 'themes', 'game_url', 'opening_tags',
    ].join(',');
    url.searchParams.set('select', columns);
    url.searchParams.set('rating', `gte.${selection.minRating}`);
    url.searchParams.append('rating', `lte.${selection.maxRating}`);
    url.searchParams.set('rating_deviation', `lte.${selection.maxDeviation}`);
    url.searchParams.set('popularity', `gte.${selection.minPopularity}`);
    url.searchParams.set('nb_plays', `gte.${selection.minPlays}`);
    url.searchParams.set('themes', selection.themes.length === 1 && selection.themes[0] === 'equality'
        ? 'cs.{equality}' : `ov.{${selection.themes.join(',')}}`);
    url.searchParams.set('order', 'rating.asc,popularity.desc,nb_plays.desc,puzzle_id.asc');
    url.searchParams.set('offset', String(selection.page * selection.limit));
    url.searchParams.set('limit', String(selection.limit));
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
        const placeholders = selection.themes.map(() => '?').join(',');
        const qualityPredicate = selection.minPlays === 100
            ? 'p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 100'
            : 'p.rating_deviation <= 100 and p.popularity >= 80 and p.nb_plays >= 500';
        const themePredicate = selection.themes.length === 1 && selection.themes[0] === 'equality'
            ? "instr(' ' || p.themes || ' ', ' equality ') > 0"
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
        const themeParameters = selection.themes.length === 1 && selection.themes[0] === 'equality' ? [] : selection.themes;
        const rows = statement.all(
            ...themeParameters, selection.minRating, selection.maxRating,
            selection.limit, selection.page * selection.limit,
        ).map(row => ({
            ...row,
            themes: String(row.themes).split(' '),
            opening_tags: String(row.opening_tags).split(' ').filter(Boolean),
        }));
        return {
            source: 'local-full-catalog',
            sourceVersion: '2026-09-10',
            filters: selection,
            page: selection.page,
            limit: selection.limit,
            estimatedTotal: null,
            hasMore: rows.length === selection.limit && selection.page < 50,
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
    const baseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey) throw new PuzzleCatalogUnavailableError('Puzzle catalog is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs || 3000);
    try {
        const response = await fetchFn(buildPuzzleCatalogUrl(baseUrl, selection), {
            headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Accept: 'application/json',
                Prefer: 'count=planned',
            },
            signal: controller.signal,
        });
        if (!response.ok) throw new PuzzleCatalogUnavailableError(`Puzzle catalog returned HTTP ${response.status}`);
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new PuzzleCatalogUnavailableError('Puzzle catalog returned an invalid response');
        const contentRange = response.headers.get('content-range') || '';
        const totalText = contentRange.includes('/') ? contentRange.split('/').pop() : '';
        const estimatedTotal = /^\d+$/.test(totalText) ? Number(totalText) : null;
        return {
            source: 'full-catalog',
            sourceVersion: '2026-09-10',
            filters: selection,
            page: selection.page,
            limit: selection.limit,
            estimatedTotal,
            hasMore: rows.length === selection.limit && (estimatedTotal == null || (selection.page + 1) * selection.limit < estimatedTotal),
            puzzles: rows.map(toPuzzle),
        };
    } catch (error) {
        if (error instanceof PuzzleCatalogUnavailableError) throw error;
        throw new PuzzleCatalogUnavailableError(error?.name === 'AbortError'
            ? 'Puzzle catalog request timed out' : 'Puzzle catalog request failed');
    } finally {
        clearTimeout(timeout);
    }
}
