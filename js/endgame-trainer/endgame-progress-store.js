export const ENDGAME_PROGRESS_STORAGE_KEY = 'caissa:endgame-trainer:progress:v1';
export const ENDGAME_PROGRESS_VERSION = 1;
const CATEGORIES = ['KQK', 'KRK', 'KPK', 'KPKP', 'KRPvKR'];
const TOTAL_FIELDS = ['positionsPrepared', 'sessionsStarted', 'sessionsCompleted', 'checkmates', 'stalemates', 'draws', 'resignations', 'abandoned', 'hintsUsed', 'undosUsed', 'attempts'];
const ENTRY_RESULTS = new Set(['checkmate', 'stalemate', 'draw', 'resignation', 'abandoned']);
const MAX_RECENT = 20;
const MAX_CURRICULUM_LESSONS = 40;
const clone = value => structuredClone(value);
const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const short = (value, max = 160) => typeof value === 'string' ? value.slice(0, max) : null;
const blankCounters = () => Object.fromEntries(TOTAL_FIELDS.map(name => [name, 0]));
const blankLesson = () => ({ sessionsStarted: 0, sessionsCompleted: 0, resignations: 0, abandoned: 0, hintsUsed: 0, undosUsed: 0, moveCount: 0, bestMoveCount: 0, completed: false, completedAt: null, updatedAt: null, rolesCompleted: [] });
const freshCurriculum = () => ({ selectedPathId: null, selectedLessonId: null, guidedSessions: 0, lessons: {} });
const fresh = () => ({ version: ENDGAME_PROGRESS_VERSION, totals: blankCounters(), categories: Object.fromEntries(CATEGORIES.map(id => [id, blankCounters()])), recentSessions: [], curriculum: freshCurriculum(), updatedAt: null });
const identifier = value => typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value) ? value : null;

function sanitizeLesson(value) {
    const state = blankLesson();
    if (!value || typeof value !== 'object') return state;
    for (const field of ['sessionsStarted', 'sessionsCompleted', 'resignations', 'abandoned', 'hintsUsed', 'undosUsed', 'moveCount', 'bestMoveCount']) state[field] = integer(value[field]);
    state.completed = Boolean(value.completed); state.completedAt = integer(value.completedAt) || null; state.updatedAt = integer(value.updatedAt) || null;
    state.rolesCompleted = Array.isArray(value.rolesCompleted) ? [...new Set(value.rolesCompleted.filter(role => ['attack', 'defense'].includes(role)))].slice(0, 2) : [];
    return state;
}

function sanitizeEntry(value) {
    if (!value || typeof value !== 'object' || !CATEGORIES.includes(value.category) || !ENTRY_RESULTS.has(value.result)) return null;
    const id = short(value.id, 100); if (!id) return null;
    return { id, category: value.category, pieceCount: integer(value.pieceCount), userColor: ['white', 'black'].includes(value.userColor) ? value.userColor : 'white',
        result: value.result, completed: Boolean(value.completed), attemptNumber: integer(value.attemptNumber), hintsUsed: integer(value.hintsUsed), undosUsed: integer(value.undosUsed),
        moveCount: integer(value.moveCount), preparedAt: integer(value.preparedAt) || null, endedAt: integer(value.endedAt) || null, durationMs: integer(value.durationMs),
        initialFen: short(value.initialFen), finalFen: short(value.finalFen), mode: value.mode === 'guided' ? 'guided' : 'free',
        pathId: identifier(value.pathId), lessonId: identifier(value.lessonId), pathTitle: short(value.pathTitle, 100), lessonTitle: short(value.lessonTitle, 100) };
}
function normalize(value) {
    if (!value || typeof value !== 'object') return { state: fresh(), future: false };
    if (value.version === 0) value = { ...value, version: 1, recentSessions: value.recentSessions ?? [] };
    if (value.version !== ENDGAME_PROGRESS_VERSION) return { state: fresh(), future: Number.isInteger(value.version) && value.version > ENDGAME_PROGRESS_VERSION };
    const state = fresh();
    for (const field of TOTAL_FIELDS) state.totals[field] = integer(value.totals?.[field]);
    for (const id of CATEGORIES) for (const field of TOTAL_FIELDS) state.categories[id][field] = integer(value.categories?.[id]?.[field]);
    state.recentSessions = Array.isArray(value.recentSessions) ? value.recentSessions.map(sanitizeEntry).filter(Boolean).slice(-MAX_RECENT) : [];
    state.curriculum.selectedPathId = identifier(value.curriculum?.selectedPathId);
    state.curriculum.selectedLessonId = identifier(value.curriculum?.selectedLessonId);
    state.curriculum.guidedSessions = integer(value.curriculum?.guidedSessions);
    const lessons = value.curriculum?.lessons && typeof value.curriculum.lessons === 'object' ? Object.entries(value.curriculum.lessons).slice(0, MAX_CURRICULUM_LESSONS) : [];
    for (const [id, lesson] of lessons) if (identifier(id)) state.curriculum.lessons[id] = sanitizeLesson(lesson);
    state.updatedAt = integer(value.updatedAt) || null;
    return { state, future: false };
}

export function createEndgameProgressStore(options = {}) {
    const storage = options.storage === undefined ? globalThis.localStorage : options.storage;
    const now = options.now ?? Date.now;
    let state = fresh(), disposed = false, available = Boolean(storage), errorCode = null, futureVersion = false;
    const seen = { prepared: new Set(), started: new Set(), terminal: new Set(), curriculumStarted: new Set(), curriculumTerminal: new Set() };
    const fail = code => { available = false; errorCode = code; };
    const read = ({ preserveOnError = false } = {}) => {
        if (!storage) { fail('storage-unavailable'); return false; }
        try {
            const raw = storage.getItem(ENDGAME_PROGRESS_STORAGE_KEY);
            const parsed = raw === null ? { state: fresh(), future: false } : normalize(JSON.parse(raw));
            state = parsed.state; futureVersion = parsed.future; available = true; errorCode = null; return true;
        } catch (error) {
            if (!preserveOnError) state = fresh();
            fail(error instanceof SyntaxError ? 'invalid-json' : 'storage-unavailable'); return false;
        }
    };
    const write = () => {
        if (!storage || futureVersion) { if (!storage) fail('storage-unavailable'); return false; }
        try { state.updatedAt = integer(now()); storage.setItem(ENDGAME_PROGRESS_STORAGE_KEY, JSON.stringify(state)); available = true; errorCode = null; return true; }
        catch (error) { fail(error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'storage-unavailable'); return false; }
    };
    const assertActive = () => { if (disposed) throw new Error('progress-store-disposed'); };
    const bump = (category, fields) => { for (const [field, amount] of Object.entries(fields)) { if (!TOTAL_FIELDS.includes(field)) continue; state.totals[field] += integer(amount); if (CATEGORIES.includes(category)) state.categories[category][field] += integer(amount); } };
    const idFor = entry => short(entry?.id ?? entry?.sessionId, 100);
    const once = (type, entry, action) => { assertActive(); const id = idFor(entry); if (!id || seen[type].has(id)) return false; read({ preserveOnError: true }); if (type === 'terminal' && state.recentSessions.some(item => item.id === id)) { seen[type].add(id); return false; } seen[type].add(id); action(id); write(); return true; };
    const terminal = (entry, result, completed) => once('terminal', entry, id => {
        const category = CATEGORIES.includes(entry.category) ? entry.category : entry.categoryId;
        const field = result === 'resignation' ? 'resignations' : result === 'abandoned' ? 'abandoned' : `${result}s`;
        bump(category, { sessionsCompleted: completed ? 1 : 0, [field]: 1, hintsUsed: entry.hintsUsed, undosUsed: entry.undosUsed, attempts: entry.attemptNumber });
        const item = sanitizeEntry({ ...entry, id, category, result, completed, endedAt: entry.endedAt ?? now() });
        if (item) state.recentSessions = [...state.recentSessions.filter(old => old.id !== id), item].slice(-MAX_RECENT);
    });
    const curriculumLesson = lessonId => state.curriculum.lessons[lessonId] ??= blankLesson();
    const curriculumComplete = (lesson, entry) => {
        const rule = entry.completionRule ?? {}, target = integer(rule.target) || 1;
        if (rule.type === 'defend-moves') return !['resignation', 'abandoned'].includes(entry.result) && lesson.moveCount >= (integer(rule.minMoves) || 1);
        if (rule.type === 'both-roles') return lesson.rolesCompleted.includes('attack') && lesson.rolesCompleted.includes('defense');
        if (rule.type === 'hint-limited-sessions') return lesson.sessionsCompleted >= target && lesson.hintsUsed <= integer(rule.maxHints);
        if (rule.type === 'terminal-completed') return entry.exerciseOutcome === 'completed' && lesson.sessionsCompleted >= target;
        return lesson.sessionsCompleted >= target;
    };
    return {
        load() { assertActive(); read(); return clone(state); },
        refreshFromStorage() { assertActive(); read(); return clone({ ...state, completionRate: state.totals.sessionsStarted ? Math.round(state.totals.sessionsCompleted * 100 / state.totals.sessionsStarted) : 0, persistence: { available, errorCode } }); },
        getSnapshot() { assertActive(); return clone({ ...state, completionRate: state.totals.sessionsStarted ? Math.round(state.totals.sessionsCompleted * 100 / state.totals.sessionsStarted) : 0, persistence: { available, errorCode } }); },
        getDiagnosticSnapshot() { assertActive(); return { storageKey: ENDGAME_PROGRESS_STORAGE_KEY, schemaVersion: ENDGAME_PROGRESS_VERSION, lastRecordedSessionId: state.recentSessions.at(-1)?.id ?? null, persistenceAvailable: available, persistenceErrorCode: errorCode }; },
        isStorageArea(value) { assertActive(); return !value || value === storage; },
        recordPreparedPosition(entry) { return once('prepared', entry, () => bump(entry.category ?? entry.categoryId, { positionsPrepared: 1 })); },
        recordSessionStarted(entry) { return once('started', entry, () => bump(entry.category ?? entry.categoryId, { sessionsStarted: 1 })); },
        recordSessionCompleted(entry) { const result = ENTRY_RESULTS.has(entry.result) ? entry.result : 'draw'; return terminal(entry, result, true); },
        recordSessionResigned(entry) { return terminal(entry, 'resignation', false); },
        recordSessionAbandoned(entry) { return terminal(entry, 'abandoned', false); },
        selectCurriculumLesson(pathId, lessonId) { assertActive(); pathId = identifier(pathId); lessonId = identifier(lessonId); if (!pathId || !lessonId) return false; read({ preserveOnError: true }); state.curriculum.selectedPathId = pathId; state.curriculum.selectedLessonId = lessonId; write(); return true; },
        recordCurriculumStarted(entry) { const lessonId = identifier(entry?.lessonId), pathId = identifier(entry?.pathId), id = idFor(entry); if (!lessonId || !pathId || !id) return false; return once('curriculumStarted', { id }, () => { state.curriculum.selectedPathId = pathId; state.curriculum.selectedLessonId = lessonId; state.curriculum.guidedSessions += 1; const lesson = curriculumLesson(lessonId); lesson.sessionsStarted += 1; lesson.updatedAt = integer(now()); }); },
        recordCurriculumTerminal(entry) {
            const lessonId = identifier(entry?.lessonId), pathId = identifier(entry?.pathId), id = idFor(entry); if (!lessonId || !pathId || !id) return false;
            return once('curriculumTerminal', { id }, () => {
                const lesson = curriculumLesson(lessonId), result = ENTRY_RESULTS.has(entry.result) ? entry.result : 'draw';
                if (!['resignation', 'abandoned'].includes(result)) lesson.sessionsCompleted += 1;
                if (result === 'resignation') lesson.resignations += 1; if (result === 'abandoned') lesson.abandoned += 1;
                lesson.hintsUsed += integer(entry.hintsUsed); lesson.undosUsed += integer(entry.undosUsed); lesson.moveCount += integer(entry.moveCount); lesson.bestMoveCount += integer(entry.bestMoveCount);
                if (['attack', 'defense'].includes(entry.trainingRole) && result !== 'abandoned') lesson.rolesCompleted = [...new Set([...lesson.rolesCompleted, entry.trainingRole])];
                lesson.updatedAt = integer(now());
                if (!lesson.completed && curriculumComplete(lesson, entry)) { lesson.completed = true; lesson.completedAt = lesson.updatedAt; }
                state.curriculum.selectedPathId = pathId; state.curriculum.selectedLessonId = lessonId;
            });
        },
        reset() { assertActive(); state = fresh(); futureVersion = false; Object.values(seen).forEach(set => set.clear()); write(); return clone(state); },
        dispose() { if (disposed) return false; disposed = true; Object.values(seen).forEach(set => set.clear()); return true; }
    };
}
