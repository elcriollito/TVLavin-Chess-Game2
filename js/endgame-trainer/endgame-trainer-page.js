import { createEndgameTrainerRuntime } from './endgame-trainer-runtime.js';
import { createEndgameProgressStore, ENDGAME_PROGRESS_STORAGE_KEY } from './endgame-progress-store.js';
import { createEndgameCurriculum } from './endgame-curriculum.js';
import { ESSENTIAL_CANON_PILOT, createPilotSession } from './essential-canon-pilot.js';
import { setIdempotentText } from './endgame-feedback-renderer.js';
import { ENDGAME_COACHING_MESSAGES, GENERAL_COACHING_MESSAGES } from './endgame-coaching-messages.js';
import { loadGuidedStudyRequest, parseGuidedStudyRequest } from '../endgame-library/guided-study-entry.js';
import { createGuidedStudyEventSession } from '../learning/guided-study-event-session.js';
import { createLocalLearningStore, LOCAL_LEARNING_STORAGE_KEY } from '../learning/local-learning-store.js';
import { deriveUnitReviewExplanation } from '../learning/review-explanations.js';

const CATEGORIES = ['KQK', 'KRK', 'KPK', 'KPKP', 'KRPvKR'];
const RANDOM_CATEGORIES = ['KQK', 'KRK', 'KPK', 'KPKP'];
const STRENGTH = { beginner: { depth: 5, skillLevel: 2 }, intermediate: { depth: 8, skillLevel: 8 }, advanced: { depth: 12, skillLevel: 14 }, strong: { depth: 15, skillLevel: 20 } };
const PUBLIC_ERRORS = { 'candidate-selection-failed': 'No suitable position was found.', 'engine-not-ready': 'The chess engine could not start.', 'engine-search-timeout': 'The engine took too long.', 'engine-load-failed': 'The chess engine could not load.', 'engine-move-failed': 'The engine could not complete its move.', 'invalid-move': 'That move is not legal.', 'invalid-options': 'Check the selected settings.', 'board-initialization-failed': 'The board could not start.', 'session-disposed': 'The session has ended.' };
const RESULT_LABELS = { checkmate: 'Checkmate', resignation: 'Resignation', stalemate: 'Stalemate', draw: 'Draw', abandoned: 'Abandoned' };
let mounted = null;
let pageSequence = 0;
const copy = value => structuredClone(value);
const text = setIdempotentText;
const resultLabel = value => RESULT_LABELS[value] ?? value;
export function resolveGuidedWorkspaceState({ trainingMode = 'free', activeLesson = null, pilotSession = null } = {}) {
    if (trainingMode !== 'guided') return 'setup';
    if (pilotSession) return 'guided-pilot';
    if (activeLesson) return 'guided-lesson';
    return 'guided-catalog';
}
const publicPage = page => copy({ mounted: page.mounted, navOpen: page.navOpen, runtimeAttached: page.runtimeAttached, operation: page.operation, hint: page.hint, error: page.error, disposed: page.disposed, diagnosticState: page.diagnosticState, controllerState: page.controllerState, progress: page.progressSnapshot, trainingMode: page.trainingMode, workspaceState: page.workspaceState, selectedPathId: page.selectedPathId, activeLesson: page.activeLesson, pilotMode: page.pilotMode, libraryStudy: page.libraryStudy, curriculumProgress: page.curriculumProgress, recentExpanded: page.recentExpanded, recentResult: page.recentResult, recentCategory: page.recentCategory, syncFeedback: page.syncFeedback, progressDiagnostic: page.diagnosticEnabled ? page.progressStore.getDiagnosticSnapshot() : undefined });
const CATEGORY_LABELS = { KQK: 'Queen vs King', KRK: 'Rook vs King', KPK: 'Pawn vs King', KPKP: 'Pawn vs Pawn', KRPvKR: 'Rook and Pawn vs Rook' };
const durationLabel = value => { const seconds = Math.max(0, Math.round((value ?? 0) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; };

function renderPilot(root, page, runtime) {
    const host = root.querySelector('[data-pilot-lessons]'), doc = root.ownerDocument;
    if (host && !host.childElementCount) for (const lesson of ESSENTIAL_CANON_PILOT.lessons) {
        const card = doc.createElement('article'), title = doc.createElement('h4'), copyNode = doc.createElement('p'), learn = doc.createElement('button'), recall = doc.createElement('button');
        title.textContent = lesson.publicTitle; copyNode.textContent = lesson.learningObjective;
        learn.type = recall.type = 'button'; learn.dataset.pilotLesson = recall.dataset.pilotLesson = lesson.lessonId; learn.dataset.pilotMode = 'learn'; recall.dataset.pilotMode = 'recall'; learn.textContent = 'Start Learn'; recall.textContent = 'Start Recall';
        card.append(title, copyNode, learn, recall); host.append(card);
    }
    const panel = root.querySelector('[data-pilot-player]'), session = page.pilotSession;
    if (panel) panel.hidden = page.workspaceState !== 'guided-pilot';
    if (!session) return;
    const state = session.getSnapshot(), lesson = state.lesson, current = state.current;
    text(root.querySelector('[data-pilot-mode]'), `${page.pilotMode === 'learn' ? 'Learn' : 'Recall'} · no engine`);
    text(root.querySelector('[data-pilot-title]'), lesson.publicTitle); text(root.querySelector('[data-pilot-objective]'), lesson.learningObjective);
    text(root.querySelector('[data-pilot-step]'), page.pilotMode === 'learn' ? `Checkpoint ${state.index + 1} of 4: ${current.title}` : `Card ${state.index + 1} of 2`);
    text(root.querySelector('[data-pilot-copy]'), page.pilotMode === 'learn' ? current.explanation : current.prompt);
    const position = ESSENTIAL_CANON_PILOT.positions.find(item => item.positionId === (page.pilotMode === 'learn' ? lesson.positionIds[0] : current.positionId));
    text(root.querySelector('[data-pilot-accessibility]'), `${position.accessibilityDescription} Orientation: ${position.orientation}. ${current.accessibilityText ?? ''}`);
    const positionKey = `${position.positionId}:${position.version}`;
    if (page.pilotRenderedPositionKey !== positionKey) { runtime?.boardView?.setPosition(position.fen); runtime?.boardView?.setOrientation(position.orientation); page.pilotRenderedPositionKey = positionKey; }
    runtime?.boardView?.setInteractive(false);
    root.querySelector('[data-empty-board-overlay]')?.setAttribute('hidden', ''); root.querySelector('[data-board]')?.setAttribute('aria-label', position.accessibilityDescription);
    const answers = root.querySelector('[data-pilot-answers]'), prompt = page.pilotMode === 'learn' ? current.prompt : { text: current.prompt, options: current.answerOptions };
    if (answers) answers.hidden = !prompt; text(root.querySelector('[data-pilot-prompt]'), prompt?.text); const options = root.querySelector('[data-pilot-options]'); options?.replaceChildren();
    for (const value of prompt?.options ?? []) { const button = doc.createElement('button'); button.type = 'button'; button.dataset.pilotAnswer = value; button.textContent = value; options?.append(button); }
    const previous = root.querySelector('[data-pilot-action="previous"]'), next = root.querySelector('[data-pilot-action="next"]'), replay = root.querySelector('[data-pilot-action="replay"]');
    if (previous) previous.disabled = page.pilotMode !== 'learn' || state.index === 0; if (next) next.disabled = state.completed; if (replay) replay.hidden = !state.completed;
}

function renderCurriculum(root, page) {
    const snapshot = page.progressSnapshot ?? page.progressStore.getSnapshot(), progress = page.curriculum.getProgress(snapshot), doc = root.ownerDocument;
    page.workspaceState = resolveGuidedWorkspaceState(page);
    const curriculumPanel = root.querySelector('[data-curriculum-navigator]'), setupWorkspace = root.querySelector('[data-setup-workspace]');
    if (curriculumPanel) curriculumPanel.hidden = page.workspaceState !== 'guided-catalog'; if (setupWorkspace) setupWorkspace.hidden = page.workspaceState !== 'setup';
    const recommendation = page.curriculum.getRecommendedLesson(snapshot); text(root.querySelector('[data-guided-recommendation]'), recommendation?.title ?? 'Choose a learning path.');
    const paths = root.querySelector('[data-guided-paths]'); paths?.replaceChildren();
    for (const item of page.curriculum.getPaths()) {
        const card = doc.createElement('article'), title = doc.createElement('h3'), description = doc.createElement('p'), meta = doc.createElement('p'), bar = doc.createElement('div'), button = doc.createElement('button'), value = progress.paths[item.id];
        card.className = 'endgame-trainer-page__path-card'; title.textContent = item.title; description.textContent = item.shortDescription; meta.textContent = `${value.completed} of ${value.total} lessons completed`;
        bar.className = 'endgame-trainer-page__progressbar'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', `${item.title} progress`); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(value.percent)); const fill = doc.createElement('span'); fill.style.setProperty('--progress', `${value.percent}%`); bar.append(fill);
        button.type = 'button'; button.dataset.guidedPath = item.id; button.textContent = page.selectedPathId === item.id ? 'View lessons' : value.completed ? 'Continue' : 'View lessons'; card.append(title, description, meta, bar, button); paths?.append(card);
    }
    const selected = page.curriculum.getPath(page.selectedPathId), detail = root.querySelector('[data-guided-path-detail]'); if (detail) detail.hidden = page.workspaceState !== 'guided-catalog' || !selected;
    if (selected) {
        text(root.querySelector('[data-path-title]'), selected.title); text(root.querySelector('[data-path-description]'), selected.shortDescription); const value = progress.paths[selected.id]; text(root.querySelector('[data-path-progress]'), `${value.percent}% complete`);
        const list = root.querySelector('[data-guided-lessons]'); list?.replaceChildren();
        for (const item of selected.lessons) {
            const record = snapshot.curriculum.lessons[item.id], status = record?.completed ? 'Completed' : record?.sessionsStarted ? 'In progress' : 'Not started', li = doc.createElement('li'), heading = doc.createElement('h4'), copyNode = doc.createElement('p'), meta = doc.createElement('p'), objective = doc.createElement('p'), button = doc.createElement('button');
            heading.textContent = `${item.order}. ${item.title}`; copyNode.textContent = item.shortDescription; meta.textContent = `${status} · ${item.difficulty} · ${CATEGORY_LABELS[item.category]} · ${item.trainingRole}`; objective.textContent = item.objective; button.type = 'button'; button.dataset.guidedLesson = item.id; button.dataset.guidedPath = selected.id; button.textContent = record?.sessionsStarted ? 'Continue lesson' : 'Start Lesson'; li.dataset.lessonStatus = status.toLowerCase().replace(' ', '-'); li.append(heading, copyNode, meta, objective, button); list?.append(li);
        }
    }
    const active = page.activeLesson, panel = root.querySelector('[data-active-lesson]'); if (panel) panel.hidden = page.workspaceState !== 'guided-lesson';
    if (active) {
        const record = snapshot.curriculum.lessons[active.id] ?? {}, coaching = ENDGAME_COACHING_MESSAGES[active.theme]; text(root.querySelector('[data-active-path]'), active.pathTitle); text(root.querySelector('[data-active-title]'), active.title); text(root.querySelector('[data-active-objective]'), active.objective); text(root.querySelector('[data-active-instruction]'), active.shortDescription); text(root.querySelector('[data-active-principle]'), coaching?.principle ?? GENERAL_COACHING_MESSAGES.principle); text(root.querySelector('[data-active-progress]'), `Session ${Math.min((record.sessionsStarted ?? 0) + 1, active.targetSessions)} of ${active.targetSessions}`);
        const previous = page.curriculum.getPreviousLesson(active.pathId, active.id), next = page.curriculum.getNextLesson(active.pathId, active.id), previousButton = root.querySelector('[data-guided-previous]'), nextButton = root.querySelector('[data-guided-next]'); if (previousButton) previousButton.disabled = !previous; if (nextButton) nextButton.disabled = !next || !record.completed;
    }
    renderPilot(root, page, page.runtime);
}

function renderProgress(root, page) {
    const snapshot = page.progressStore.getSnapshot(), doc = root.ownerDocument;
    if (!doc?.createElement) { page.progressSnapshot = snapshot; return; }
    const metrics = root.querySelector('[data-progress-metrics]'); metrics?.replaceChildren();
    const memory = page.progressStore.getTrainingSummary?.() ?? { overall: {}, weakness: {}, themes: {} };
    for (const [label, value] of [['Sessions', snapshot.totals.sessionsStarted], ['Completed', snapshot.totals.sessionsCompleted], ['Accuracy', `${memory.overall.accuracy ?? 0}%`], ['Current streak', memory.overall.currentStreak ?? 0], ['Hints', snapshot.totals.hintsUsed], ['Needs practice', memory.weakness.mostDifficultTheme ?? 'Not enough data']]) {
        const item = doc.createElement('div'), name = doc.createElement('span'), strong = doc.createElement('strong'); item.className = 'endgame-trainer-page__metric'; name.textContent = label; strong.textContent = String(value); item.append(name, strong); metrics?.append(item);
    }
    const categories = root.querySelector('[data-category-breakdown]'); categories?.replaceChildren();
    for (const id of CATEGORIES) { const item = doc.createElement('li'), title = doc.createElement('strong'); title.textContent = CATEGORY_LABELS[id]; item.append(title); for (const [label, value] of [['sessions', snapshot.categories[id].sessionsStarted], ['completed', snapshot.categories[id].sessionsCompleted], ['checkmates', snapshot.categories[id].checkmates]]) { const span = doc.createElement('span'); span.textContent = `${value} ${label}`; item.append(span); } categories?.append(item); }
    const allRecent = snapshot.recentSessions.slice().reverse();
    const resultMatches = entry => page.recentResult === 'all' || page.recentResult === 'draw' ? page.recentResult === 'all' || ['draw', 'stalemate'].includes(entry.result) : entry.result === page.recentResult;
    const filtered = allRecent.filter(entry => resultMatches(entry) && (page.recentCategory === 'all' || entry.category === page.recentCategory));
    const items = page.recentExpanded ? filtered : filtered.slice(0, 5);
    const recent = root.querySelector('[data-recent-sessions]'); recent?.replaceChildren();
    if (!items.length) { const li = doc.createElement('li'); li.textContent = allRecent.length ? 'No sessions match these filters.' : 'No recent sessions yet.'; recent?.append(li); }
    for (const entry of items) { const li = doc.createElement('li'), badge = doc.createElement('span'), title = doc.createElement('strong'), detail = doc.createElement('small'); badge.className = 'endgame-trainer-page__result-badge'; badge.textContent = entry.mode === 'guided' ? `Guided · ${resultLabel(entry.result)}` : `Free Practice · ${resultLabel(entry.result)}`; title.textContent = entry.mode === 'guided' && entry.lessonTitle ? `${entry.lessonTitle} · ${entry.userColor === 'black' ? 'Black' : 'White'}` : `${CATEGORY_LABELS[entry.category]} · ${entry.userColor === 'black' ? 'Black' : 'White'}`; detail.textContent = `${entry.moveCount} moves · ${durationLabel(entry.durationMs)} · ${entry.endedAt ? new Date(entry.endedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Recently'}`; li.append(badge, title, detail); recent?.append(li); }
    const filteredMode = page.recentResult !== 'all' || page.recentCategory !== 'all';
    const caption = !allRecent.length ? '' : !filtered.length ? 'No sessions match these filters.' : filteredMode ? `Showing ${filtered.length} matching session${filtered.length === 1 ? '' : 's'}.` : page.recentExpanded ? `Showing all ${filtered.length} stored sessions.` : `Showing the latest ${Math.min(5, filtered.length)} session${Math.min(5, filtered.length) === 1 ? '' : 's'}.`;
    text(root.querySelector('[data-recent-caption]'), caption);
    const toggle = root.querySelector('[data-recent-toggle]'); if (toggle) { toggle.hidden = filtered.length <= 5; toggle.textContent = page.recentExpanded ? 'Show less' : 'Show more'; toggle.setAttribute('aria-expanded', String(page.recentExpanded)); }
    text(root.querySelector('[data-persistence-warning]'), snapshot.persistence.available ? '' : 'Progress could not be saved in this browser.');
    text(root.querySelector('[data-sync-feedback]'), page.syncFeedback || '');
    const progressNav = root.querySelector('[data-progress-nav]'); if (progressNav) progressNav.hidden = snapshot.totals.sessionsStarted === 0 && !['completed', 'resigned'].includes(page.controllerState?.status);
    const curriculumProgress = page.curriculum.getProgress(snapshot), selectedPath = page.curriculum.getPath(snapshot.curriculum.selectedPathId), selectedLesson = selectedPath ? page.curriculum.getLesson(selectedPath.id, snapshot.curriculum.selectedLessonId) : null;
    page.curriculumProgress = curriculumProgress;
    text(root.querySelector('[data-guided-completed]'), `${curriculumProgress.lessonsCompleted} of ${curriculumProgress.totalLessons}`);
    text(root.querySelector('[data-guided-percent]'), `${Math.round(curriculumProgress.lessonsCompleted * 100 / curriculumProgress.totalLessons)}%`);
    text(root.querySelector('[data-guided-active-path]'), selectedPath?.title ?? 'Not selected'); text(root.querySelector('[data-guided-current-lesson]'), selectedLesson?.title ?? 'Not selected'); text(root.querySelector('[data-guided-sessions]'), snapshot.curriculum.guidedSessions);
    page.progressSnapshot = snapshot;
    renderCurriculum(root, page);
}

const STUDY_ERRORS = Object.freeze({
    'invalid-unit-id': 'The study link contains an invalid unit identifier.',
    'release-mismatch': 'This study link does not match the supported library release.',
    'unit-not-found': 'This study unit is not part of the pinned library release.',
    'unit-not-eligible': 'Guided study is not available for this concept yet.',
    'release-unavailable': 'The pinned library release could not be loaded.',
    'position-unavailable': 'The released instructional position could not be displayed safely.'
});

async function initializeLibraryStudy({ root, page, runtime, search, fetchImpl }) {
    const request = parseGuidedStudyRequest(search);
    if (!request) return;
    page.libraryStudy = { status: 'loading', unitId: request.unitId ?? null, releaseId: request.releaseId ?? null };
    root.classList.add('is-library-study');
    const panel = root.querySelector('[data-library-study]');
    if (panel) panel.hidden = false;
    for (const selector of ['[data-setup-workspace]', '[data-curriculum-navigator]', '[data-active-lesson]', '[data-pilot-player]']) {
        const element = root.querySelector(selector); if (element) element.hidden = true;
    }
    runtime?.boardView?.setInteractive(false);
    const result = await loadGuidedStudyRequest(search, { fetchImpl });
    if (page.disposed) return;
    if (result.status !== 'ready') {
        page.libraryStudy = { status: 'error', code: result.code, unitId: request.unitId ?? null, releaseId: request.releaseId ?? null };
        const error = root.querySelector('[data-library-study-error]'); if (error) error.hidden = false;
        text(root.querySelector('[data-library-study-error-message]'), STUDY_ERRORS[result.code] || 'This study unit could not be opened.');
        text(root.querySelector('[data-library-study-title]'), 'Study unavailable');
        return;
    }
    const model = result.model;
    const reviewFrom = new URLSearchParams(search).get('reviewFrom');
    const reviewContext = root.querySelector('[data-learning-review-context]');
    if (reviewContext) reviewContext.hidden = !reviewFrom;
    const learningContext = {
        releaseId: model.releaseId,
        unitIds: [model.unitId],
        positionIds: model.positions.map(position => position.id),
        learningObjectIds: model.learningObjectIds,
        assessmentItemIds: model.assessmentItemIds
    };
    page.learningStore.setContext(learningContext);
    const storeLoad = page.learningStore.load();
    const eventSessionFactory = page.learningEventSessionFactory ?? createGuidedStudyEventSession;
    page.learningEventSession = eventSessionFactory({
        releaseId: model.releaseId,
        unitId: model.unitId,
        positionIds: model.positions.map(position => position.id),
        learningObjectIds: model.learningObjectIds,
        assessmentItemIds: model.assessmentItemIds,
        sessionId: `study-${page.progressScopeId}`,
        now: page.now,
        idFactory: page.learningEventIdFactory
    });
    if (storeLoad.ok) page.learningEventSession.applyConsent(page.learningStore.getSummary().consent);
    let currentReview = null;
    const renderReview = (message = '') => {
        const panel = root.querySelector('[data-learning-review]');
        const records = page.learningStore.getLearningRecords();
        const dismissal = records.reviewDismissals[`${model.releaseId}:${model.unitId}`] ?? null;
        currentReview = deriveUnitReviewExplanation({
            unit: model.reviewUnit, releaseId: model.releaseId,
            evidence: records.evidence, events: records.events, dismissal
        });
        if (panel) panel.hidden = !currentReview;
        if (!currentReview) return;
        const dismissed = currentReview.status === 'dismissed';
        text(root.querySelector('[data-learning-review-title]'), dismissed ? 'Review dismissed for now' : currentReview.title);
        text(root.querySelector('[data-learning-review-explanation]'), dismissed ? 'The suggestion is hidden until new qualifying evidence appears.' : currentReview.explanation);
        text(root.querySelector('[data-learning-review-reason]'), dismissed ? '' : currentReview.whyReviewMayHelp);
        text(root.querySelector('[data-learning-review-target]'), dismissed ? '' : currentReview.targetRelationshipReason);
        text(root.querySelector('[data-learning-review-evidence]'),
            `${currentReview.supportingEvidenceIds.length} supporting evidence record${currentReview.supportingEvidenceIds.length === 1 ? '' : 's'} · hint guidance: ${currentReview.hintDependence.join(', ') || 'none'} · latest ${new Date(currentReview.mostRecentEvidenceAt).toLocaleString()}.`);
        text(root.querySelector('[data-learning-review-status]'), message);
        const reviewNow = root.querySelector('[data-learning-review-now]');
        if (reviewNow) {
            reviewNow.hidden = dismissed;
            reviewNow.textContent = currentReview.primaryAction;
            reviewNow.href = `/endgame-trainer?studyUnit=${encodeURIComponent(currentReview.targetUnitId)}&release=${encodeURIComponent(model.releaseId)}&reviewFrom=${encodeURIComponent(model.unitId)}`;
        }
        const dismiss = root.querySelector('[data-learning-review-dismiss]'); if (dismiss) dismiss.hidden = dismissed;
        const restore = root.querySelector('[data-learning-review-restore]'); if (restore) restore.hidden = !dismissed;
        const clear = root.querySelector('[data-learning-review-clear]'); if (clear) clear.hidden = dismissed;
    };
    const renderLearningPreview = (message = '') => {
        const snapshot = page.learningEventSession.snapshot();
        const stored = page.learningStore.getSummary();
        const storedProgress = stored.progressByUnit[`${model.releaseId}:${model.unitId}`];
        page.learningPreview = snapshot;
        const enabled = snapshot.consent.state === 'local-progress-enabled';
        const declined = snapshot.consent.state === 'declined';
        const diagnostic = page.learningStore.getDiagnosticState();
        text(root.querySelector('[data-learning-consent-status]'), message || (!['empty', 'loaded', 'migrated', 'committed'].includes(diagnostic.code)
            ? 'Saved learning data cannot be read safely. Guided Study still works; clear the learning store to recover.'
            : enabled ? 'Saved locally on this device. There is no cloud sync.'
                : declined ? 'Progress saving is disabled. Guided Study remains fully available.'
                    : 'Current session only. No learning activity is being saved.'));
        const progress = storedProgress ?? snapshot.progress;
        text(root.querySelector('[data-learning-progress-summary]'),
            `${progress.state.replace('-', ' ')} · ${progress.positionsExplored} positions explored · ${progress.learningObjectsAttempted} practice objects · ${progress.assessmentEvidenceCount} assessment evidence${progress.mostRecentActivityAt ? ` · last studied ${new Date(progress.mostRecentActivityAt).toLocaleString()}` : ''}. ${storedProgress ? 'Saved locally.' : 'Current session only.'}`);
        const hasRecords = stored.totals.units > 0 || stored.totals.events > 0 || stored.totals.evidence > 0;
        const visibility = {
            '[data-learning-consent-disable]': enabled, '[data-learning-clear-unit]': hasRecords,
            '[data-learning-clear-all]': hasRecords, '[data-learning-disable-clear]': enabled || hasRecords,
            '[data-learning-export]': hasRecords, '[data-learning-import]': enabled
        };
        for (const [selector, visible] of Object.entries(visibility)) {
            const control = root.querySelector(selector); if (control) control.hidden = !visible;
        }
        const recovery = root.querySelector('[data-learning-recovery-clear]'); if (recovery) recovery.hidden = diagnostic.code === 'empty' || diagnostic.code === 'loaded' || diagnostic.code === 'committed' || diagnostic.code === 'migrated';
        renderReview();
    };
    const emitLearningEvent = (type, detail) => {
        const event = page.learningEventSession.emit(type, detail);
        if (event.persistenceEligible) {
            const saved = page.learningStore.appendInteractionEvent(event);
            renderLearningPreview(saved.ok ? '' : 'This activity remains in the current session because local saving was unavailable.');
        } else renderLearningPreview();
    };
    emitLearningEvent('study-session-started');
    emitLearningEvent('unit-opened');
    emitLearningEvent('explanation-viewed');
    page.libraryStudy = { status: 'ready', unitId: model.unitId, releaseId: model.releaseId, positionIndex: 0, promptIndex: 0 };
    text(root.querySelector('[data-library-study-title]'), model.title);
    text(root.querySelector('[data-library-study-objective]'), model.objective);
    text(root.querySelector('[data-library-study-explanation]'), model.explanation);
    const ready = root.querySelector('[data-library-study-ready]'); if (ready) ready.hidden = false;
    const returnLink = root.querySelector('[data-library-study-return]'); if (returnLink) returnLink.href = model.returnHref;
    const positionSelect = root.querySelector('[data-library-study-position]');
    positionSelect?.replaceChildren();
    model.positions.forEach((position, index) => {
        const option = root.ownerDocument.createElement('option');
        option.value = String(index); option.textContent = `Position ${index + 1}: ${String(position.role || 'study').replaceAll('-', ' ')}`;
        positionSelect?.append(option);
    });
    const showPosition = index => {
        const position = model.positions[index]; if (!position) return;
        try {
            if (!runtime?.boardView?.setPosition) throw new Error('Board unavailable');
            page.libraryStudy.positionIndex = index;
            runtime.boardView.setPosition(position.fen);
            runtime.boardView.setOrientation(position.sideToMove === 'black' ? 'black' : 'white');
            runtime.boardView.setInteractive(false);
            const purpose = position.principalIdeas?.map(idea => idea.purpose).filter(Boolean).join(' ');
            text(root.querySelector('[data-library-study-position-purpose]'), purpose || 'Use this position to study the lesson objective.');
            const overlay = root.querySelector('[data-empty-board-overlay]'); if (overlay) overlay.hidden = true;
            const board = root.querySelector('[data-board]'); board?.setAttribute('aria-label', `${model.title}. ${position.sideToMove} to move. Read-only guided study position.`);
            emitLearningEvent('position-selected', { positionId: position.id });
        } catch {
            page.libraryStudy = { ...page.libraryStudy, status: 'error', code: 'position-unavailable' };
            if (ready) ready.hidden = true;
            const error = root.querySelector('[data-library-study-error]'); if (error) error.hidden = false;
            text(root.querySelector('[data-library-study-error-message]'), STUDY_ERRORS['position-unavailable']);
        }
    };
    const showPrompt = index => {
        const bounded = Math.max(0, Math.min(model.prompts.length - 1, index));
        page.libraryStudy.promptIndex = bounded;
        text(root.querySelector('[data-library-study-step]'), `Prompt ${bounded + 1} of ${model.prompts.length}`);
        text(root.querySelector('[data-library-study-prompt]'), model.prompts[bounded]);
        const previous = root.querySelector('[data-library-study-previous]'), next = root.querySelector('[data-library-study-next]');
        if (previous) previous.disabled = bounded === 0;
        if (next) next.disabled = bounded === model.prompts.length - 1;
    };
    positionSelect?.addEventListener('change', event => showPosition(Number(event.target.value)), { signal: page.signal });
    const advancePrompt = direction => {
        showPrompt(page.libraryStudy.promptIndex + direction);
        emitLearningEvent('coaching-prompt-advanced', { promptStage: page.libraryStudy.promptIndex, hintLevel: 'none' });
    };
    root.querySelector('[data-library-study-previous]')?.addEventListener('click', () => advancePrompt(-1), { signal: page.signal });
    root.querySelector('[data-library-study-next]')?.addEventListener('click', () => advancePrompt(1), { signal: page.signal });
    root.querySelector('[data-learning-consent-enable]')?.addEventListener('click', () => {
        const saved = page.learningStore.setConsent('local-progress-enabled');
        if (saved.ok) { page.learningEventSession.applyConsent(page.learningStore.getSummary().consent); emitLearningEvent('unit-opened'); }
        else renderLearningPreview('Local progress could not be enabled. No study activity was saved.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-consent-decline]')?.addEventListener('click', () => {
        const saved = page.learningStore.setConsent('declined');
        if (saved.ok) page.learningEventSession.applyConsent(page.learningStore.getSummary().consent);
        renderLearningPreview();
    }, { signal: page.signal });
    root.querySelector('[data-learning-consent-disable]')?.addEventListener('click', () => {
        const saved = page.learningStore.disableSaving();
        if (saved.ok) page.learningEventSession.applyConsent(page.learningStore.getSummary().consent);
        renderLearningPreview(saved.ok ? 'Progress saving is disabled. Existing records remain on this device.' : 'Progress saving could not be changed safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-clear-unit]')?.addEventListener('click', () => {
        if (!page.window.confirm?.('Clear saved learning progress for this unit?')) return;
        const cleared = page.learningStore.clearUnit(model.releaseId, model.unitId);
        renderLearningPreview(cleared.ok ? 'Saved progress for this unit was cleared.' : 'Saved progress could not be cleared safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-clear-all]')?.addEventListener('click', () => {
        if (!page.window.confirm?.('Clear all local learning progress and keep saving enabled?')) return;
        const cleared = page.learningStore.clearAll();
        renderLearningPreview(cleared.ok ? 'All local learning progress was cleared. Saving remains enabled.' : 'Local learning progress could not be cleared safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-disable-clear]')?.addEventListener('click', () => {
        if (!page.window.confirm?.('Disable progress saving and clear all local learning records?')) return;
        const cleared = page.learningStore.disableAndClear();
        if (cleared.ok) page.learningEventSession.applyConsent(page.learningStore.getSummary().consent);
        renderLearningPreview(cleared.ok ? 'Progress saving was disabled and all local learning records were cleared.' : 'Local learning progress could not be changed safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-recovery-clear]')?.addEventListener('click', () => {
        if (!page.window.confirm?.('Clear the unreadable local learning store? This cannot be undone.')) return;
        const cleared = page.learningStore.clearUnreadableStore();
        renderLearningPreview(cleared.ok ? 'The unreadable local learning store was cleared.' : 'The unreadable local learning store could not be cleared.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-export]')?.addEventListener('click', () => {
        const exported = page.learningStore.exportData(); if (!exported.ok) return void renderLearningPreview('Local learning data could not be exported safely.');
        const blob = new Blob([exported.json], { type: 'application/json' }), url = URL.createObjectURL(blob), link = root.ownerDocument.createElement('a');
        link.href = url; link.download = 'caissa-learning-progress.json'; link.click(); URL.revokeObjectURL(url);
        renderLearningPreview('Local learning data exported.');
    }, { signal: page.signal });
    const learningFile = root.querySelector('[data-learning-import-file]');
    root.querySelector('[data-learning-import]')?.addEventListener('click', () => learningFile?.click(), { signal: page.signal });
    learningFile?.addEventListener('change', async () => {
        const file = learningFile.files?.[0]; if (!file) return;
        const json = await file.text(), preview = page.learningStore.previewImport(json); learningFile.value = '';
        if (!preview.ok) return void renderLearningPreview('The selected CAISSA learning file is not valid.');
        if (!page.window.confirm?.(`Import and merge ${preview.summary.totals.units} learning unit record(s)? Consent will not be changed.`)) return;
        const merged = page.learningStore.mergeImport(json);
        renderLearningPreview(merged.ok ? 'Local learning data imported and merged.' : 'Local learning data could not be imported safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-review-dismiss]')?.addEventListener('click', () => {
        if (!currentReview) return;
        const dismissed = page.learningStore.dismissReview(currentReview);
        renderReview(dismissed.ok ? 'Review dismissed. The supporting evidence remains saved locally.' : 'The review could not be dismissed safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-review-restore]')?.addEventListener('click', () => {
        const restored = page.learningStore.restoreDismissedReview(model.releaseId, model.unitId);
        renderReview(restored.ok ? 'Review suggestion restored.' : 'The review could not be restored safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-review-clear]')?.addEventListener('click', () => {
        if (!currentReview || !page.window.confirm?.('Clear only the local evidence supporting this review?')) return;
        const cleared = page.learningStore.clearReviewEvidence(currentReview);
        renderLearningPreview(cleared.ok ? 'Supporting evidence was cleared and local progress was recalculated.' : 'Supporting evidence could not be cleared safely.');
    }, { signal: page.signal });
    root.querySelector('[data-learning-review-why]')?.addEventListener('click', event => {
        const details = root.querySelector('[data-learning-review-details]'), expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
        event.currentTarget.setAttribute('aria-expanded', String(!expanded)); if (details) details.hidden = expanded;
    }, { signal: page.signal });
    root.querySelector('[data-learning-consent-more]')?.addEventListener('click', event => {
        const details = root.querySelector('[data-learning-consent-details]'), expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
        event.currentTarget.setAttribute('aria-expanded', String(!expanded)); if (details) details.hidden = expanded;
    }, { signal: page.signal });
    root.querySelector('[data-library-study-return]')?.addEventListener('click', () => {
        emitLearningEvent('return-to-library'); emitLearningEvent('study-session-ended');
    }, { signal: page.signal });
    page.window?.addEventListener?.('pagehide', () => {
        if (page.learningEventSession) emitLearningEvent('study-session-ended');
    }, { signal: page.signal });
    page.window?.addEventListener?.('storage', event => {
        if (event.key !== LOCAL_LEARNING_STORAGE_KEY || !page.learningStore.isStorageArea(event.storageArea)) return;
        const refreshed = page.learningStore.refreshFromStorage();
        if (refreshed.ok) page.learningEventSession.applyConsent(page.learningStore.getSummary().consent);
        renderLearningPreview(refreshed.ok ? 'Local learning progress changed in another tab.' : 'Learning data changed in another tab but cannot be read safely.');
    }, { signal: page.signal });
    showPosition(0); showPrompt(0);
    renderLearningPreview();
    root.querySelector('[data-library-study-title]')?.focus?.();
}

function sessionEntry(state, owner, now) { return { id: owner.progressId, category: state.categoryId, pieceCount: state.initialFen?.split(' ')[0].replace(/[1-8/]/g, '').length ?? 0, userColor: state.userColor, attemptNumber: state.attemptNumber, hintsUsed: state.hintsUsed, undosUsed: state.undosUsed, moveCount: state.moveHistory?.length ?? 0, preparedAt: owner.preparedAt, endedAt: now, durationMs: owner.startedAt ? Math.max(0, now - owner.startedAt) : 0, initialFen: state.initialFen, finalFen: state.currentFen, mode: owner.lesson ? 'guided' : 'free', pathId: owner.lesson?.pathId, lessonId: owner.lesson?.id, pathTitle: owner.lesson?.pathTitle, lessonTitle: owner.lesson?.title }; }
function trainingEntry(state, owner, now, outcome) { return { id: owner.progressId, lessonId: owner.lesson.id, theme: owner.lesson.theme, outcome, hintsUsed: state.hintsUsed, attempts: state.attemptNumber, durationMs: owner.startedAt ? Math.max(0, now - owner.startedAt) : 0, finalResult: state.result?.gameResult ?? outcome, classifications: owner.classifications, timestamp: now }; }
function localProgress(page, operation) { const changed = operation(); if (changed) page.syncFeedback = ''; return changed; }
function reconcileProgress(root, page, state) {
    if (!page.progressStore || page.disposed) return;
    const now = page.now(), previous = page.progressOwner;
    if (previous && state.sessionId && previous.id !== state.sessionId && previous.started && !previous.terminal) { const entry = sessionEntry(previous.state, previous, now); localProgress(page, () => page.progressStore.recordSessionAbandoned(entry)); if (previous.lesson) { localProgress(page, () => page.progressStore.recordCurriculumTerminal({ ...entry, result: 'abandoned', pathId: previous.lesson.pathId, lessonId: previous.lesson.id, trainingRole: previous.lesson.trainingRole, completionRule: previous.lesson.completionRule })); localProgress(page, () => page.progressStore.recordTrainingSession?.(trainingEntry(previous.state, previous, now, 'abandoned')) ?? false); } previous.terminal = true; }
    if (!state.sessionId) { renderProgress(root, page); return; }
    let owner = page.progressOwners.get(state.sessionId); if (!owner) { owner = { id: state.sessionId, progressId: `${page.progressScopeId}:${state.sessionId}`, preparedAt: now, startedAt: null, prepared: false, started: false, terminal: false, state, lesson: page.trainingMode === 'guided' ? copy(page.activeLesson) : null, coachedMoves: 0, classifications: {} }; page.progressOwners.set(state.sessionId, owner); }
    owner.state = state; page.progressOwner = owner;
    const coachedMoves = state.moveHistory?.filter(move => move.actor === 'user').length ?? 0; if (coachedMoves > owner.coachedMoves && state.coaching?.classification) { owner.classifications[state.coaching.classification] = (owner.classifications[state.coaching.classification] ?? 0) + coachedMoves - owner.coachedMoves; owner.coachedMoves = coachedMoves; }
    if (!owner.prepared && state.status !== 'preparing') { localProgress(page, () => page.progressStore.recordPreparedPosition({ id: owner.progressId, category: state.categoryId })); owner.prepared = true; }
    if (!owner.started && ['user-turn', 'engine-thinking', 'completed', 'resigned'].includes(state.status)) { owner.startedAt = now; localProgress(page, () => page.progressStore.recordSessionStarted({ id: owner.progressId, category: state.categoryId })); if (owner.lesson) localProgress(page, () => page.progressStore.recordCurriculumStarted({ id: owner.progressId, pathId: owner.lesson.pathId, lessonId: owner.lesson.id })); owner.started = true; }
    if (!owner.terminal && state.status === 'completed') { const entry = { ...sessionEntry(state, owner, now), result: state.result?.gameResult, exerciseOutcome: state.result?.exerciseOutcome }; localProgress(page, () => page.progressStore.recordSessionCompleted(entry)); if (owner.lesson) { localProgress(page, () => page.progressStore.recordCurriculumTerminal({ ...entry, pathId: owner.lesson.pathId, lessonId: owner.lesson.id, trainingRole: owner.lesson.trainingRole, completionRule: owner.lesson.completionRule })); localProgress(page, () => page.progressStore.recordTrainingSession?.(trainingEntry(state, owner, now, state.result?.exerciseOutcome === 'completed' ? 'solved' : 'failed')) ?? false); } owner.terminal = true; }
    if (!owner.terminal && state.status === 'resigned') { const entry = sessionEntry(state, owner, now); localProgress(page, () => page.progressStore.recordSessionResigned(entry)); if (owner.lesson) { localProgress(page, () => page.progressStore.recordCurriculumTerminal({ ...entry, result: 'resignation', pathId: owner.lesson.pathId, lessonId: owner.lesson.id, trainingRole: owner.lesson.trainingRole, completionRule: owner.lesson.completionRule })); localProgress(page, () => page.progressStore.recordTrainingSession?.(trainingEntry(state, owner, now, 'failed')) ?? false); } owner.terminal = true; }
    renderProgress(root, page);
}

function renderSummary(root, page, state) {
    const panel = root.querySelector('[data-session-summary]'); if (!panel) return; const visible = ['completed', 'resigned'].includes(state.status); panel.hidden = !visible; if (!visible) return;
    const list = root.querySelector('[data-summary-facts]'), doc = root.ownerDocument; list.replaceChildren(); const owner = page.progressOwners.get(state.sessionId), values = [['Result', resultLabel(state.result?.gameResult)], ['Category', CATEGORY_LABELS[state.categoryId]], ['Side', state.userColor === 'black' ? 'Black' : 'White'], ['Moves', state.moveHistory?.length ?? 0], ['Attempts', state.attemptNumber], ['Hints', state.hintsUsed], ['Undos', state.undosUsed], ['Duration', durationLabel(owner?.startedAt ? page.now() - owner.startedAt : 0)]];
    for (const [label, value] of values) { const div = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd'); dt.textContent = label; dd.textContent = String(value ?? '—'); div.append(dt, dd); list.append(div); }
}

function promotion(root, signal) {
    const dialog = root.querySelector('[data-promotion]'); let settle = null; let returnFocus = null;
    const cancel = () => settle?.(null);
    const resolve = () => new Promise(done => { let closed = false; returnFocus = root.ownerDocument.activeElement; if (returnFocus === root.ownerDocument.body) returnFocus = root.querySelector('[data-board]'); settle = value => { if (closed) return; closed = true; settle = null; dialog.close(); returnFocus?.focus?.(); returnFocus = null; done(value); }; dialog.showModal(); dialog.querySelector('[data-promotion-piece="q"]')?.focus(); });
    dialog?.addEventListener('click', event => { const value = event.target?.dataset?.promotionPiece; if (value !== undefined) settle?.(value || null); }, { signal });
    dialog?.addEventListener('cancel', event => { event.preventDefault(); cancel(); }, { signal });
    return { resolve, cancel };
}

function renderHistory(root, moves = []) {
    const list = root.querySelector('[data-history]'); if (!list) return;
    list.replaceChildren(); const doc = root.ownerDocument;
    if (!moves.length) {
        const li = doc.createElement('li'), title = doc.createElement('strong'), detail = doc.createElement('span');
        title.textContent = 'No moves yet.'; detail.textContent = 'Moves will appear here once the session starts.';
        li.append(title, detail); list.append(li); return;
    }
    for (const entry of moves) { const li = doc.createElement('li'); li.textContent = `${entry.actor}: ${entry.move?.san || entry.move?.lan || 'move'}`; list.append(li); }
    list.lastElementChild?.scrollIntoView?.({ block: 'nearest' });
}

function update(root, page, snapshot) {
    const state = snapshot?.controllerState ?? page.controllerState ?? { status: 'idle', moveHistory: [] };
    reconcileProgress(root, page, state);
    page.controllerState = copy(state); page.operation = snapshot?.loading ?? null; if (snapshot && Object.hasOwn(snapshot, 'hint')) page.hint = snapshot.hint;
    const status = page.disposed ? 'disposed'
        : page.operation ? 'preparing'
        : state.engineThinking || state.status === 'engine-thinking' ? 'engine-thinking'
        : state.status === 'idle' ? 'empty'
        : ['ready', 'user-turn', 'completed', 'resigned', 'error'].includes(state.status) ? state.status
        : 'ready';
    root.dataset.state = status;
    for (const name of ['empty', 'preparing', 'ready', 'user-turn', 'engine-thinking', 'completed', 'resigned', 'error', 'disposed']) {
        root.classList.toggle(`is-${name}`, name === status);
    }
    root.querySelector('[data-diagnostic-state]')?.setAttribute('aria-busy', String(Boolean(page.operation || state.engineThinking)));
    const completedCopy = state.coaching?.classification === 'SUCCESS' ? state.coaching.message : state.result?.gameResult ? `Result: ${resultLabel(state.result.gameResult)}.` : 'Review the final position and start another attempt.';
    const statusCopy = {
        empty: ['Ready to train', 'Prepare a focused endgame position to begin.'],
        preparing: ['Preparing your position', 'Building a focused endgame for this session.'],
        ready: ['Position ready', 'Review the board, then start the session.'],
        'user-turn': ['Your turn', 'Find the best move in the position.'],
        'engine-thinking': ['Stockfish is thinking', 'The board is temporarily locked.'],
        completed: ['Endgame completed', completedCopy],
        resigned: ['Session resigned', 'Prepare a new position when you are ready.'],
        error: ['Unable to continue', 'Review the message and prepare another position.'],
        disposed: ['Trainer closed', 'This training session is no longer active.']
    }[status];
    text(root.querySelector('[data-status-title]'), statusCopy[0]); text(root.querySelector('[data-status-copy]'), statusCopy[1]);
    text(root.querySelector('[data-start-helper]'), status === 'empty' || status === 'error' ? 'Prepare a position first.' : status === 'ready' ? 'The position is ready to start.' : 'Session in progress.');
    const field = name => root.querySelector(`[data-field="${name}"]`);
    text(field('objective'), state.objective); text(field('turn'), state.sideToMove ? `${state.sideToMove[0].toUpperCase()}${state.sideToMove.slice(1)} to move` : '—');
    text(field('status'), state.status === 'user-turn' ? 'Your turn' : state.status); text(field('attempt'), state.attemptNumber); text(field('hints'), state.hintsUsed ?? 0); text(field('undos'), state.undosUsed ?? 0);
    text(field('engine'), state.engineThinking ? 'Thinking' : page.disposed ? 'Disposed' : state.sessionId ? 'Ready' : 'Not initialized'); text(field('result'), resultLabel(state.result?.gameResult)); text(field('score'), state.score);
    text(root.querySelector('[data-hint-output]'), page.hint?.message ?? '');
    text(root.querySelector('[data-page-message]'), state.coaching?.message ?? (status === 'user-turn' ? 'Find a move that preserves the lesson idea.' : statusCopy[status]?.[1] ?? ''));
    renderHistory(root, state.moveHistory);
    const emptyOverlay = root.querySelector('[data-empty-board-overlay]'); if (emptyOverlay) emptyOverlay.hidden = Boolean(state.currentFen);
    const overlay = root.querySelector('[data-board-overlay]'); if (overlay) overlay.hidden = status !== 'engine-thinking';
    const enabled = page.disposed ? {} : { prepare: ['idle', 'error'].includes(state.status) && !page.operation, start: state.status === 'ready' && !page.operation, hint: state.status === 'user-turn' && !page.operation, undo: state.status === 'user-turn' && state.moveHistory?.length > 0 && !page.operation, restart: Boolean(state.sessionId), new: Boolean(state.sessionId), resign: Boolean(state.sessionId) && !['completed', 'resigned', 'error'].includes(state.status), flip: true };
    const start = root.querySelector('[data-action="start"]'); if (start) start.textContent = state.status === 'ready' ? '▶ Start Training' : ['user-turn', 'engine-thinking'].includes(state.status) ? 'Training in progress' : '▶ Start Training';
    for (const button of root.querySelectorAll('[data-action]')) button.disabled = !enabled[button.dataset.action];
    renderSummary(root, page, state);
}

export function mountEndgameTrainerPage(options = {}) {
    const doc = options.document ?? globalThis.document, win = options.window ?? globalThis.window;
    const root = options.root ?? doc?.querySelector?.('[data-endgame-trainer-page]');
    if (!root?.querySelector || !doc || !win) throw new TypeError('invalid-root');
    if (mounted?.root === root) return publicPage(mounted.page);
    if (mounted) unmountEndgameTrainerPage();
    const abort = new AbortController(), signal = abort.signal, promo = promotion(root, signal), board = root.querySelector('[data-board]');
    const params = new URLSearchParams(win.location?.search ?? '');
    const diagnosticEnabled = params.get('diagnostic') === '1', diagnosticState = diagnosticEnabled && ['empty', 'loading', 'error', 'completed'].includes(params.get('diagnosticState')) ? params.get('diagnosticState') : null;
    const progressStoreFactory = options.progressStoreFactory ?? createEndgameProgressStore, progressStore = progressStoreFactory({ storage: options.storage, now: options.now }); progressStore.load(); const loadedProgress = progressStore.getSnapshot();
    const curriculum = options.curriculum ?? createEndgameCurriculum();
    const progressScopeId = options.progressScopeId ?? globalThis.crypto?.randomUUID?.() ?? `tab-${++pageSequence}-${(options.now ?? Date.now)()}`;
    const learningStorage = options.learningStorage ?? options.storage;
    const learningStoreFactory = options.learningStoreFactory ?? createLocalLearningStore;
    const learningStore = learningStoreFactory({ storage: learningStorage, now: options.now });
    const page = { mounted: true, navOpen: false, runtimeAttached: false, operation: null, hint: null, error: null, disposed: false, signal, diagnosticEnabled, diagnosticState, controllerState: null, seedSequence: 0, progressStore, progressOwners: new Map(), progressOwner: null, progressSnapshot: loadedProgress, progressScopeId, curriculum, curriculumProgress: curriculum.getProgress(loadedProgress), trainingMode: 'free', workspaceState: 'setup', selectedPathId: loadedProgress.curriculum?.selectedPathId ?? null, activeLesson: null, pendingLesson: null, pilotSession: null, pilotMode: null, pilotRenderedPositionKey: null, libraryStudy: null, learningEventSession: null, learningPreview: null, learningEventSessionFactory: options.learningEventSessionFactory, learningEventIdFactory: options.learningEventIdFactory, learningStore, learningStorage, window: win, recentExpanded: false, recentResult: 'all', recentCategory: 'all', syncFeedback: '', now: options.now ?? Date.now };
    const runtimeFactory = options.runtimeFactory ?? createEndgameTrainerRuntime;
    let runtime = null;
    if (board) { runtime = runtimeFactory({ boardElement: board, promotionResolver: promo.resolve, callbacks: { onStateChange: snap => update(root, page, snap), onAnnouncement: value => text(root.querySelector('[data-announcement]'), value), onError: error => { if (error.code !== 'stale-operation') { page.error = { code: error.code }; text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[error.code] || 'The trainer encountered an error.'); } } } }).initialize(); page.runtimeAttached = true; page.runtime = runtime; }
    const nav = root.querySelector('[data-mobile-nav]'), toggle = root.querySelector('[data-mobile-nav-toggle]');
    root.querySelectorAll('[data-nav-key]').forEach(item => { const active = item.dataset.navKey === 'endgame-trainer'; item.classList.toggle('is-active', active); active ? item.setAttribute('aria-current', 'page') : item.removeAttribute('aria-current'); });
    const closeNav = focus => { page.navOpen = false; root.classList.remove('is-nav-open'); toggle?.setAttribute('aria-expanded', 'false'); if (focus) toggle?.focus?.(); };
    toggle?.addEventListener('click', () => { page.navOpen = !page.navOpen; root.classList.toggle('is-nav-open', page.navOpen); toggle.setAttribute('aria-expanded', String(page.navOpen)); }, { signal });
    doc.addEventListener('keydown', e => { if (e.key === 'Escape' && page.navOpen) closeNav(true); }, { signal }); doc.addEventListener('click', e => { if (page.navOpen && !nav?.contains(e.target) && !toggle?.contains(e.target)) closeNav(); }, { signal });
    win.addEventListener?.('resize', () => { if (page.navOpen && win.innerWidth > 768) closeNav(); }, { signal });
    const abandon = () => { const owner = page.progressOwner; if (owner?.started && !owner.terminal) { const now = page.now(), entry = sessionEntry(owner.state, owner, now); localProgress(page, () => page.progressStore.recordSessionAbandoned(entry)); if (owner.lesson) { localProgress(page, () => page.progressStore.recordCurriculumTerminal({ ...entry, result: 'abandoned', pathId: owner.lesson.pathId, lessonId: owner.lesson.id, trainingRole: owner.lesson.trainingRole, completionRule: owner.lesson.completionRule })); localProgress(page, () => page.progressStore.recordTrainingSession?.(trainingEntry(owner.state, owner, now, 'abandoned')) ?? false); } owner.terminal = true; renderProgress(root, page); } };
    win.addEventListener?.('pagehide', abandon, { signal });
    const resetDialog = root.querySelector('[data-reset-dialog]'), resetButton = root.querySelector('[data-reset-progress]'); let resetReturnFocus = null;
    resetButton?.addEventListener('click', () => { resetReturnFocus = resetButton; resetDialog.showModal(); root.querySelector('[data-reset-cancel]')?.focus(); }, { signal });
    const closeReset = () => { resetDialog?.close(); resetReturnFocus?.focus?.(); resetReturnFocus = null; };
    root.querySelector('[data-reset-cancel]')?.addEventListener('click', closeReset, { signal });
    resetDialog?.addEventListener('cancel', event => { event.preventDefault(); closeReset(); }, { signal });
    root.querySelector('[data-reset-confirm]')?.addEventListener('click', () => { page.progressStore.reset(); page.recentExpanded = false; page.recentResult = 'all'; page.recentCategory = 'all'; page.syncFeedback = ''; const result = root.querySelector('[data-recent-result]'), categoryFilter = root.querySelector('[data-recent-category]'); if (result) result.value = 'all'; if (categoryFilter) categoryFilter.value = 'all'; renderProgress(root, page); text(root.querySelector('[data-progress-announcement]'), 'Local progress reset.'); closeReset(); }, { signal });
    const memoryFile = root.querySelector('[data-training-memory-file]');
    root.querySelector('[data-export-training-memory]')?.addEventListener('click', () => { const blob = new Blob([page.progressStore.exportTrainingMemory()], { type: 'application/json' }), url = URL.createObjectURL(blob), link = root.ownerDocument.createElement('a'); link.href = url; link.download = 'caissa-endgame-training-memory.json'; link.click(); URL.revokeObjectURL(url); text(root.querySelector('[data-progress-announcement]'), 'Training memory exported.'); }, { signal });
    root.querySelector('[data-import-training-memory]')?.addEventListener('click', () => memoryFile?.click(), { signal });
    memoryFile?.addEventListener('change', async () => { const file = memoryFile.files?.[0]; if (!file) return; const result = page.progressStore.importTrainingMemory(await file.text()); memoryFile.value = ''; if (result.ok) { renderProgress(root, page); text(root.querySelector('[data-progress-announcement]'), 'Training memory imported.'); } else text(root.querySelector('[data-progress-announcement]'), 'The selected training memory file is not valid.'); }, { signal });
    root.querySelector('[data-recent-toggle]')?.addEventListener('click', () => { page.recentExpanded = !page.recentExpanded; renderProgress(root, page); }, { signal });
    root.querySelector('[data-recent-result]')?.addEventListener('change', event => { page.recentResult = event.target.value; page.recentExpanded = false; renderProgress(root, page); }, { signal });
    root.querySelector('[data-recent-category]')?.addEventListener('change', event => { page.recentCategory = event.target.value; page.recentExpanded = false; renderProgress(root, page); }, { signal });
    root.querySelector('[data-view-progress]')?.addEventListener('click', () => { const heading = root.querySelector('#progress-title'), reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; heading?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); heading?.focus?.({ preventScroll: true }); }, { signal });
    win.addEventListener?.('storage', event => { if (event.key !== ENDGAME_PROGRESS_STORAGE_KEY || !page.progressStore.isStorageArea(event.storageArea)) return; const refreshed = page.progressStore.refreshFromStorage(); page.syncFeedback = event.newValue === null || refreshed.totals.sessionsStarted === 0 && refreshed.recentSessions.length === 0 ? 'Training progress was reset in another tab.' : 'Training progress updated from another tab.'; renderProgress(root, page); }, { signal });
    const switchDialog = root.querySelector('[data-guided-switch-dialog]'); let switchReturnFocus = null;
    const closeSwitch = () => { if (switchDialog?.open) switchDialog.close(); switchReturnFocus?.focus?.(); switchReturnFocus = null; page.pendingLesson = null; };
    const lessonDetails = (pathId, lessonId) => { const path = page.curriculum.getPath(pathId), lesson = page.curriculum.getLesson(pathId, lessonId); return path && lesson ? { ...lesson, pathTitle: path.title } : null; };
    const runLesson = async (pathId, lessonId) => {
        const lesson = lessonDetails(pathId, lessonId), resolved = page.curriculum.resolveTrainingOptions(pathId, lessonId); if (!lesson || !resolved || !runtime) return false;
        page.pilotSession?.dispose(); page.pilotSession = null; page.pilotMode = null; page.pilotRenderedPositionKey = null; runtime.boardView?.setInteractive(true);
        page.trainingMode = 'guided'; page.selectedPathId = pathId; page.activeLesson = lesson; page.progressStore.selectCurriculumLesson(pathId, lessonId); renderProgress(root, page);
        const options = { ...resolved, seed: `caissa-guided-${lessonId}-${Date.now()}-${++page.seedSequence}`, engineOptions: STRENGTH[root.querySelector('[data-setup="strength"]')?.value] };
        const active = page.controllerState?.sessionId && !['idle', 'completed', 'resigned', 'error'].includes(page.controllerState.status);
        try { if (active) await runtime.binding.newPosition(options); else await runtime.binding.prepare(options); update(root, page, runtime.binding.getState()); return true; }
        catch (error) { page.error = { code: error?.code || 'operation-failed' }; text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[page.error.code] || 'The trainer encountered an error.'); return false; }
    };
    const requestLesson = (pathId, lessonId, trigger) => {
        const active = page.controllerState?.sessionId && ['user-turn', 'engine-thinking'].includes(page.controllerState.status);
        if (!active) return void runLesson(pathId, lessonId);
        page.pendingLesson = { pathId, lessonId }; switchReturnFocus = trigger ?? root.ownerDocument.activeElement; switchDialog?.showModal(); root.querySelector('[data-guided-switch-cancel]')?.focus();
    };
    root.querySelector('[data-training-mode]')?.addEventListener('change', event => { page.trainingMode = event.target.value === 'guided' ? 'guided' : 'free'; if (page.trainingMode === 'free' && !['completed', 'resigned', 'idle', 'error'].includes(page.controllerState?.status)) { event.target.value = 'guided'; page.trainingMode = 'guided'; text(root.querySelector('[data-page-message]'), 'Finish the active lesson before returning to Free Practice.'); } if (page.trainingMode === 'free' && page.pilotSession) { page.pilotSession.dispose(); page.pilotSession = null; page.pilotMode = null; page.pilotRenderedPositionKey = null; runtime?.boardView?.setInteractive(true); } renderProgress(root, page); }, { signal });
    root.querySelector('[data-curriculum-navigator]')?.addEventListener('click', event => { const lessonId = event.target?.dataset?.guidedLesson, pathId = event.target?.dataset?.guidedPath; if (lessonId && pathId) requestLesson(pathId, lessonId, event.target); else if (pathId) { page.selectedPathId = pathId; page.progressStore.selectCurriculumLesson(pathId, page.curriculum.getPath(pathId)?.lessons[0]?.id); renderProgress(root, page); root.querySelector('#path-detail-title')?.focus?.(); } }, { signal });
    root.querySelector('[data-guided-recommended]')?.addEventListener('click', event => { const lesson = page.curriculum.getRecommendedLesson(page.progressStore.getSnapshot()); requestLesson(lesson.pathId, lesson.id, event.target); }, { signal });
    root.querySelector('[data-guided-previous]')?.addEventListener('click', event => { const lesson = page.activeLesson && page.curriculum.getPreviousLesson(page.activeLesson.pathId, page.activeLesson.id); if (lesson) requestLesson(lesson.pathId, lesson.id, event.target); }, { signal });
    root.querySelector('[data-guided-next]')?.addEventListener('click', event => { const lesson = page.activeLesson && page.curriculum.getNextLesson(page.activeLesson.pathId, page.activeLesson.id); if (lesson) requestLesson(lesson.pathId, lesson.id, event.target); }, { signal });
    root.querySelector('[data-guided-restart]')?.addEventListener('click', async () => { if (!runtime || !page.activeLesson) return; try { await runtime.binding.restart(); } catch (error) { if (error?.code !== 'stale-operation') text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[error?.code] || 'The lesson could not restart.'); } }, { signal });
    const bindDisclosure = (toggleSelector, bodySelector) => root.querySelector(toggleSelector)?.addEventListener('click', event => { const body = root.querySelector(bodySelector), expanded = event.currentTarget.getAttribute('aria-expanded') === 'true'; event.currentTarget.setAttribute('aria-expanded', String(!expanded)); event.currentTarget.textContent = expanded ? 'Expand' : 'Collapse'; if (body) body.hidden = expanded; }, { signal });
    bindDisclosure('[data-companion-toggle]', '[data-companion-body]');
    bindDisclosure('[data-navigator-toggle]', '[data-navigator-body]');
    bindDisclosure('[data-pilot-toggle]', '[data-pilot-body]');
    root.querySelector('[data-session-toggle]')?.addEventListener('click', event => { const body = root.querySelector('[data-session-panel-body]'), expanded = event.currentTarget.getAttribute('aria-expanded') === 'true'; event.currentTarget.setAttribute('aria-expanded', String(!expanded)); event.currentTarget.textContent = expanded ? 'Expand' : 'Collapse'; if (body) body.hidden = expanded; }, { signal });
    const leaveStandardLesson = targetMode => { const allowed = targetMode === 'guided' ? ['ready', 'completed', 'resigned', 'error'] : ['completed', 'resigned', 'error']; if (!allowed.includes(page.controllerState?.status)) { text(root.querySelector('[data-page-message]'), 'Complete or resign the active session before leaving this lesson.'); return false; } page.activeLesson = null; page.trainingMode = targetMode; const mode = root.querySelector('[data-training-mode]'); if (mode) mode.value = targetMode; renderProgress(root, page); return true; };
    root.querySelector('[data-guided-catalog]')?.addEventListener('click', () => leaveStandardLesson('guided'), { signal });
    root.querySelector('[data-guided-exit]')?.addEventListener('click', () => leaveStandardLesson('free'), { signal });
    root.querySelector('[data-guided-return-setup]')?.addEventListener('click', () => { page.trainingMode = 'free'; const mode = root.querySelector('[data-training-mode]'); if (mode) mode.value = 'free'; renderProgress(root, page); }, { signal });
    root.querySelector('[data-guided-switch-cancel]')?.addEventListener('click', closeSwitch, { signal }); switchDialog?.addEventListener('cancel', event => { event.preventDefault(); closeSwitch(); }, { signal });
    root.querySelector('[data-guided-switch-confirm]')?.addEventListener('click', async () => { const pending = page.pendingLesson; if (switchDialog?.open) switchDialog.close(); page.pendingLesson = null; if (pending) await runLesson(pending.pathId, pending.lessonId); switchReturnFocus = null; }, { signal });
    const pilotEvent = event => {
        page.progressStore.recordPilotEvent?.({ ...event, at: page.now() });
        if (['learn-completed', 'recall-completed'].includes(event.event)) {
            const history = page.progressStore.getSnapshot().curriculum?.pilotEvents ?? [], lessonEvents = history.filter(item => item.lessonId === event.lessonId).map(item => item.event);
            if (lessonEvents.includes('learn-completed') && lessonEvents.includes('recall-completed')) page.progressStore.recordPilotEvent?.({ event: 'lesson-completed', key: `${event.lessonId}:et11b4-v1`, lessonId: event.lessonId, at: page.now() });
        }
        page.progressSnapshot = page.progressStore.getSnapshot();
    };
    const pilotHandler = event => {
        const lessonId = event.target?.dataset?.pilotLesson, mode = event.target?.dataset?.pilotMode;
        if (lessonId && mode) {
            if (page.controllerState?.sessionId && ['user-turn', 'engine-thinking'].includes(page.controllerState.status)) { text(root.querySelector('[data-page-message]'), 'Finish or resign the active practice session before starting this lesson.'); return; }
            page.trainingMode = 'guided'; page.activeLesson = null; page.pilotMode = mode; page.pilotSession?.dispose();
            page.pilotSession = createPilotSession({ lessonId, mode, sessionId: `${page.progressScopeId}-${lessonId}-${mode}-${++page.seedSequence}`, emit: pilotEvent });
            page.pilotSession.start(); renderProgress(root, page); root.querySelector('[data-pilot-title]')?.focus(); return;
        }
        const answer = event.target?.dataset?.pilotAnswer, action = event.target?.dataset?.pilotAction;
        if (!page.pilotSession) return;
        if (answer) { const result = page.pilotSession.answer(answer); text(root.querySelector('[data-pilot-feedback]'), result.feedback); if (result.correct) root.querySelector('[data-pilot-action="next"]')?.focus(); }
        else if (action === 'next') page.pilotSession.next(); else if (action === 'previous') page.pilotSession.previous(); else if (action === 'restart' || action === 'replay') page.pilotSession.restart();
        else if (action === 'exit') { page.pilotSession.dispose(); page.pilotSession = null; page.pilotMode = null; page.pilotRenderedPositionKey = null; const state = runtime?.binding.getState(); if (state?.currentFen) runtime?.boardView?.setPosition(state.currentFen); if (state?.orientation) runtime?.boardView?.setOrientation(state.orientation); runtime?.boardView?.setInteractive(true); renderProgress(root, page); update(root, page, state); return; }
        renderPilot(root, page, runtime);
    };
    root.querySelector('[data-essential-pilot]')?.addEventListener('click', pilotHandler, { signal });
    root.querySelector('[data-pilot-player]')?.addEventListener('click', pilotHandler, { signal });
    const act = (name, fn, invalidates = false) => root.querySelector(`[data-action="${name}"]`)?.addEventListener('click', async () => { if (invalidates) promo.cancel(); page.error = null; try { await fn(); } catch (error) { if (error?.code !== 'stale-operation') { page.error = { code: error?.code || 'operation-failed' }; text(root.querySelector('[data-error-message]'), PUBLIC_ERRORS[page.error.code] || 'The trainer encountered an error.'); } } finally { if (runtime) update(root, page, runtime.binding.getState()); } }, { signal });
    const nextSeed = () => `caissa-product-${Date.now()}-${++page.seedSequence}`;
    const category = seed => {
        const pieces = root.querySelector('[data-setup="pieces"]')?.value;
        const selected = root.querySelector('[data-setup="category"]')?.value;
        const compatible = pieces === '3' ? ['KQK', 'KRK', 'KPK'] : pieces === '4' ? ['KPKP'] : pieces === '5' ? ['KRPvKR'] : RANDOM_CATEGORIES;
        if (selected !== 'random' && compatible.includes(selected)) return selected;
        let hash = 0; for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        return compatible[hash % compatible.length];
    };
    const piecesSelect = root.querySelector('[data-setup="pieces"]'), categorySelect = root.querySelector('[data-setup="category"]');
    const syncSetup = source => {
        if (!piecesSelect || !categorySelect) return;
        if (source === 'category' && categorySelect.value === 'KRPvKR') piecesSelect.value = '5';
        const compatible = piecesSelect.value === '3' ? ['KQK', 'KRK', 'KPK', 'random'] : piecesSelect.value === '4' ? ['KPKP'] : piecesSelect.value === '5' ? ['KRPvKR'] : [...RANDOM_CATEGORIES, 'random'];
        for (const option of categorySelect.options) option.disabled = !compatible.includes(option.value);
        if (!compatible.includes(categorySelect.value)) categorySelect.value = piecesSelect.value === '5' ? 'KRPvKR' : compatible[0];
    };
    piecesSelect?.addEventListener('change', () => syncSetup('pieces'), { signal });
    categorySelect?.addEventListener('change', () => syncSetup('category'), { signal });
    syncSetup('mount');
    act('prepare', () => { const seed = nextSeed(); return runtime.binding.prepare({ categoryId: category(seed), userColor: 'white', betaWhiteOnly: true, seed, candidateCount: 24, generatorOptions: { strongSide: 'white', sideToMove: 'white' }, engineOptions: STRENGTH[root.querySelector('[data-setup="strength"]')?.value] }); });
    act('start', () => runtime.binding.start()); act('hint', () => runtime.binding.requestHint()); act('undo', () => runtime.binding.undo(), true); act('restart', () => runtime.binding.restart(), true); act('new', () => runtime.binding.newPosition({ seed: nextSeed() }), true); act('resign', () => runtime.binding.resign(), true); act('flip', () => runtime.binding.flip());
    mounted = { root, page, runtime, abort, promo, closeNav, abandon, resetDialog }; update(root, page, runtime?.binding.getState()); if (diagnosticState) root.dataset.state = diagnosticState;
    void initializeLibraryStudy({ root, page, runtime, search: win.location?.search ?? '', fetchImpl: options.fetchImpl ?? win.fetch?.bind(win) });
    return publicPage(page);
}

export function unmountEndgameTrainerPage() { if (!mounted) return false; mounted.abandon(); mounted.page.pilotSession?.dispose(); mounted.page.disposed = true; update(mounted.root, mounted.page, mounted.runtime?.binding.getState()); mounted.promo.cancel(); if (mounted.resetDialog?.open) mounted.resetDialog.close(); mounted.abort.abort(); mounted.closeNav(); mounted.runtime?.dispose(); mounted.page.progressStore.dispose(); mounted.page.runtimeAttached = false; mounted.page.mounted = false; mounted = null; return true; }
export function getEndgameTrainerPageState() { return mounted ? publicPage(mounted.page) : { mounted: false, navOpen: false, runtimeAttached: false, operation: null, hint: null, error: null, disposed: true, controllerState: null, progress: null }; }
if (globalThis.document) { const start = () => mountEndgameTrainerPage(); document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start, { once: true }) : start(); globalThis.addEventListener?.('pagehide', () => unmountEndgameTrainerPage(), { once: true }); }
