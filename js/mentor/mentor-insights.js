/** Local notification state for verified, completed account-game analysis.
 * No analysis is performed here. An integration must provide actual evidence
 * and reset this controller whenever the signed-in CAISSA owner changes.
 */
export const MENTOR_INSIGHT_SOURCES = Object.freeze(['chesscom', 'lichess', 'caissa']);
export const MENTOR_INSIGHT_THEMES = Object.freeze({
    tactics: 'tactics',
    development: 'piece development',
    kingSafety: 'king safety',
    hangingPieces: 'undefended pieces',
    timeManagement: 'time management',
    endgame: 'endgames'
});
export const MENTOR_INSIGHT_LIMITS = Object.freeze({ games: 100, rememberedAnalyses: 32, themes: 6 });
const sourceLabels = Object.freeze({ chesscom: 'Chess.com', lichess: 'Lichess', caissa: 'CAISSA' });
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max
    && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
const validOwner = ownerId => cleanText(ownerId, 128);

function validate(summary, ownerId) {
    if (!record(summary)) return 'invalid-summary';
    if (!validOwner(ownerId) || summary.ownerId !== ownerId) return 'owner-mismatch';
    if (summary.status !== 'completed' || summary.verified !== true) return 'analysis-not-verified-complete';
    if (!MENTOR_INSIGHT_SOURCES.includes(summary.source)) return 'unsupported-source';
    if (!cleanText(summary.analysisId, 128) || !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(summary.analysisId)) return 'invalid-analysis-id';
    if (!cleanText(summary.username, 80)) return 'invalid-username';
    if (!Number.isInteger(summary.completedGames) || summary.completedGames < 1 || summary.completedGames > MENTOR_INSIGHT_LIMITS.games) return 'invalid-game-count';
    if (!Array.isArray(summary.themes) || summary.themes.length < 1 || summary.themes.length > MENTOR_INSIGHT_LIMITS.themes) return 'invalid-themes';
    const seen = new Set();
    for (const evidence of summary.themes) {
        if (!record(evidence) || !own(MENTOR_INSIGHT_THEMES, evidence.theme) || seen.has(evidence.theme)) return 'invalid-theme';
        if (!Number.isInteger(evidence.sampleGames) || evidence.sampleGames < 1 || evidence.sampleGames > summary.completedGames) return 'invalid-evidence-count';
        seen.add(evidence.theme);
    }
    return null;
}

function createIdea(summary) {
    const themes = Object.freeze(summary.themes.map(item => Object.freeze({ theme: item.theme, sampleGames: item.sampleGames })));
    const evidence = themes.map(item => `${MENTOR_INSIGHT_THEMES[item.theme]} in ${item.sampleGames} of ${summary.completedGames} analyzed games`).join('; ');
    const games = summary.completedGames === 1 ? 'game' : 'games';
    const context = `${summary.completedGames} ${sourceLabels[summary.source]} ${games} for ${summary.username}`;
    return Object.freeze({
        ownerId: summary.ownerId, analysisId: summary.analysisId, source: summary.source,
        username: summary.username, completedGames: summary.completedGames, themes,
        localMessage: `Your completed analysis covers ${context}. It includes evidence about ${evidence}. Don’t worry — we can take this one step at a time and work through those examples together. Would you like a focused training plan?`,
        planPrompt: `Help me make a focused chess training plan using my completed analysis of ${context}. Evidence: ${evidence}. Ask for the underlying game positions before giving specific move advice. Treat these sample counts as evidence coverage, not error rates, strength estimates, or proof of improvement. Do not invent ratings, game details, weaknesses, or a guaranteed outcome.`
    });
}

export function createMentorInsights({ ownerId = null } = {}) {
    let owner = validOwner(ownerId) ? ownerId : null;
    let disposed = false;
    let unread = false;
    let idea = null;
    const remembered = new Set();
    const read = () => Object.freeze({ unread, idea, disposed });
    const result = (accepted, reason) => Object.freeze({ accepted, reason, state: read() });
    return Object.freeze({
        read,
        receive(summary) {
            if (disposed) return result(false, 'disposed');
            const error = validate(summary, owner);
            if (error) return result(false, error);
            const key = JSON.stringify([summary.source, summary.username, summary.analysisId]);
            if (remembered.has(key)) return result(false, 'duplicate-analysis');
            remembered.add(key);
            if (remembered.size > MENTOR_INSIGHT_LIMITS.rememberedAnalyses) remembered.delete(remembered.values().next().value);
            idea = createIdea(summary); unread = true;
            return result(true, 'training-idea-ready');
        },
        acknowledge() {
            unread = false;
            return read();
        },
        reset(nextOwnerId = null) {
            if (disposed) return read();
            owner = validOwner(nextOwnerId) ? nextOwnerId : null;
            remembered.clear(); unread = false; idea = null;
            return read();
        },
        dispose() {
            owner = null; remembered.clear(); unread = false; idea = null; disposed = true;
            return read();
        }
    });
}
