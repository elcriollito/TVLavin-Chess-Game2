export const TRAINING_MEMORY_VERSION = 1;
export const TRAINING_MEMORY_CLASSIFICATIONS = Object.freeze(['BEST', 'GOOD', 'INACCURACY', 'MISTAKE', 'BLUNDER', 'ONLY_MOVE', 'SUCCESS']);
const MAX_HISTORY = 1000;
const positive = new Set(['BEST', 'GOOD', 'ONLY_MOVE', 'SUCCESS']);
const clone = value => structuredClone(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const id = value => typeof value === 'string' && /^[a-z0-9:_-]{1,120}$/i.test(value) ? value : null;
const text = (value, max = 120) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
const blankCounts = () => Object.fromEntries(TRAINING_MEMORY_CLASSIFICATIONS.map(name => [name, 0]));

export function createTrainingMemory() { return { version: TRAINING_MEMORY_VERSION, sessions: [] }; }

function sanitizeClassifications(value) {
    const result = blankCounts();
    for (const name of TRAINING_MEMORY_CLASSIFICATIONS) result[name] = count(value?.[name]);
    return result;
}

export function sanitizeTrainingSession(value) {
    if (!value || typeof value !== 'object') return null;
    const sessionId = id(value.id ?? value.sessionId), theme = id(value.theme), lessonId = id(value.lessonId);
    const outcome = ['solved', 'failed', 'abandoned'].includes(value.outcome) ? value.outcome : null;
    if (!sessionId || !theme || !lessonId || !outcome) return null;
    return {
        id: sessionId, lessonId, theme, outcome, solved: outcome === 'solved', failed: outcome === 'failed',
        hintsUsed: count(value.hintsUsed), attempts: Math.max(1, count(value.attempts)), durationMs: count(value.durationMs),
        finalResult: text(value.finalResult, 40), classifications: sanitizeClassifications(value.classifications),
        timestamp: count(value.timestamp) || null
    };
}

export function normalizeTrainingMemory(value) {
    if (!value || typeof value !== 'object') return createTrainingMemory();
    const source = value.version === 0 ? { version: 1, sessions: value.history ?? value.sessions ?? [] } : value;
    if (source.version !== TRAINING_MEMORY_VERSION) return createTrainingMemory();
    const unique = new Map();
    for (const item of Array.isArray(source.sessions) ? source.sessions : []) {
        const session = sanitizeTrainingSession(item); if (session && !unique.has(session.id)) unique.set(session.id, session);
    }
    return { version: TRAINING_MEMORY_VERSION, sessions: [...unique.values()].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0) || a.id.localeCompare(b.id)).slice(0, MAX_HISTORY) };
}

export function recordTrainingSession(memory, entry) {
    const state = normalizeTrainingMemory(memory), session = sanitizeTrainingSession(entry);
    if (!session || state.sessions.some(item => item.id === session.id)) return { memory: state, recorded: false };
    return { memory: normalizeTrainingMemory({ version: 1, sessions: [session, ...state.sessions] }), recorded: true };
}

function masteryFor(stat) {
    const attempts = stat.attempts || 1, moves = stat.moveTotal || 1;
    const successRate = stat.solved / attempts;
    const accuracy = stat.positiveMoves / moves;
    const hintEfficiency = Math.max(0, 1 - stat.hints / attempts / 3);
    const speed = stat.averageTimeMs ? Math.max(0, 1 - stat.averageTimeMs / 600000) : 0.5;
    const recent = stat.recentOutcomes.slice(0, 5), older = stat.recentOutcomes.slice(5, 10);
    const rate = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : successRate;
    const improvement = Math.max(0, rate(recent) - rate(older));
    const score = Math.round(55 * successRate + 25 * accuracy + 10 * hintEfficiency + 5 * speed + 5 * improvement);
    const level = score >= 90 && stat.attempts >= 5 ? 'Mastered' : score >= 75 ? 'Strong' : score >= 55 ? 'Improving' : score >= 30 ? 'Learning' : 'Needs Practice';
    return { score, level, successRate: Math.round(successRate * 100), accuracy: Math.round(accuracy * 100), improvement: Math.round(improvement * 100) };
}

export function summarizeTrainingMemory(memory) {
    const state = normalizeTrainingMemory(memory), themes = {}, moves = blankCounts();
    for (const session of state.sessions) {
        const stat = themes[session.theme] ??= { theme: session.theme, attempts: 0, solved: 0, failed: 0, hints: 0, totalTimeMs: 0, averageTimeMs: 0, currentStreak: 0, bestStreak: 0, lastPracticed: null, classifications: blankCounts(), moveTotal: 0, positiveMoves: 0, recentOutcomes: [] };
        stat.attempts += 1; stat.solved += session.solved ? 1 : 0; stat.failed += session.failed ? 1 : 0; stat.hints += session.hintsUsed; stat.totalTimeMs += session.durationMs;
        stat.lastPracticed = Math.max(stat.lastPracticed ?? 0, session.timestamp ?? 0) || null; stat.recentOutcomes.push(session.solved ? 1 : 0);
        for (const name of TRAINING_MEMORY_CLASSIFICATIONS) { const amount = session.classifications[name]; stat.classifications[name] += amount; moves[name] += amount; stat.moveTotal += amount; if (positive.has(name)) stat.positiveMoves += amount; }
    }
    for (const stat of Object.values(themes)) {
        stat.averageTimeMs = stat.attempts ? Math.round(stat.totalTimeMs / stat.attempts) : 0;
        let current = 0, best = 0, run = 0; for (const outcome of stat.recentOutcomes) { if (outcome) run += 1; else run = 0; best = Math.max(best, run); }
        for (const outcome of stat.recentOutcomes) { if (!outcome) break; current += 1; }
        stat.currentStreak = current; stat.bestStreak = best; stat.mastery = masteryFor(stat); delete stat.totalTimeMs; delete stat.positiveMoves; delete stat.moveTotal; delete stat.recentOutcomes;
    }
    const values = Object.values(themes), by = (selector, direction = 1) => values.length ? [...values].sort((a, b) => direction * (selector(a) - selector(b)) || a.theme.localeCompare(b.theme))[0]?.theme ?? null : null;
    const mistake = ['INACCURACY', 'MISTAKE', 'BLUNDER'].sort((a, b) => moves[b] - moves[a] || a.localeCompare(b))[0];
    const weakness = {
        mostDifficultTheme: by(item => item.mastery.score), lowestAccuracyTheme: by(item => item.mastery.accuracy),
        mostRequestedHintTheme: by(item => item.hints, -1), slowestCompletionTheme: by(item => item.averageTimeMs, -1),
        highestImprovementTheme: by(item => item.mastery.improvement, -1), mostFrequentMistake: moves[mistake] ? mistake : null
    };
    const weakest = weakness.mostDifficultTheme;
    const recommendation = !state.sessions.length ? { type: 'start', message: 'Start a guided lesson to build your training memory.' }
        : weakness.mostFrequentMistake === 'BLUNDER' ? { type: 'retry-mistake', theme: weakest, message: `Retry a recent ${weakest} lesson and check the opponent's reply.` }
        : values.find(item => item.theme === weakest)?.hints > values.find(item => item.theme === weakest)?.attempts ? { type: 'reduce-hints', theme: weakest, message: `Practice ${weakest} again and try to use fewer hints.` }
        : { type: 'continue-theme', theme: weakest, message: `Continue practicing ${weakest}.` };
    const solved = state.sessions.filter(item => item.solved).length;
    return clone({ version: TRAINING_MEMORY_VERSION, sessions: state.sessions, themes, moves, overall: { attempts: state.sessions.length, solved, failed: state.sessions.filter(item => item.failed).length, accuracy: state.sessions.length ? Math.round(100 * solved / state.sessions.length) : 0, currentStreak: state.sessions.findIndex(item => !item.solved) < 0 ? solved : state.sessions.findIndex(item => !item.solved) }, weakness, recommendation });
}

export function exportTrainingMemory(memory) { return JSON.stringify(normalizeTrainingMemory(memory), null, 2); }
export function importTrainingMemory(json) {
    try { const parsed = JSON.parse(json); if (parsed?.version !== TRAINING_MEMORY_VERSION || !Array.isArray(parsed.sessions) || parsed.sessions.some(item => !sanitizeTrainingSession(item))) return { ok: false, error: 'invalid-training-memory' }; return { ok: true, memory: normalizeTrainingMemory(parsed) }; }
    catch { return { ok: false, error: 'invalid-json' }; }
}
