import { createEndgameCurriculum } from '../../js/endgame-trainer/endgame-curriculum.js';
import { createEndgameProgressStore } from '../../js/endgame-trainer/endgame-progress-store.js';
import { createEndgameTrainerRuntime } from '../../js/endgame-trainer/endgame-trainer-runtime.js';

const FIXTURE_ID = 'et10c-rook-active-defense-v1';
const INITIAL_FEN = '8/1R6/2r5/2kp4/8/8/8/7K b - - 0 1';
const USER_MOVES = Object.freeze(['b7b1', 'b1d1', 'd1d5', 'h1h2', 'h2h3', 'h3g2']);
const ENGINE_MOVES = Object.freeze(['c6e6', 'e6g6', 'g6g5', 'c5d5', 'd5e5', 'g5g2']);
const ENGINE_BRANCH = new Map([
    [INITIAL_FEN, 'c6e6'],
    ['8/8/4r3/2kp4/8/8/8/1R5K b - - 2 2', 'e6g6'],
    ['8/8/6r1/2kp4/8/8/8/3R3K b - - 4 3', 'g6g5'],
    ['8/8/8/2kR2r1/8/8/8/7K b - - 0 4', 'c5d5'],
    ['8/8/8/3k2r1/8/8/7K/8 b - - 1 5', 'd5e5'],
    ['8/8/8/4k1r1/8/7K/8/8 b - - 3 6', 'g5g2']
]);

export const ET10C_FIXTURE = Object.freeze({
    id: FIXTURE_ID,
    pathId: 'rook-essentials',
    lessonId: 'rook-active-defense',
    categoryId: 'KRPvKR',
    role: 'defense',
    userColor: 'white',
    strongSide: 'black',
    fen: INITIAL_FEN,
    userMoves: USER_MOVES,
    engineMoves: ENGINE_MOVES,
    expectedLine: Object.freeze(['c6e6', 'b7b1', 'e6g6', 'b1d1', 'g6g5', 'd1d5', 'c5d5', 'h1h2', 'd5e5', 'h2h3', 'g5g2', 'h3g2']),
    expectedMoveCount: 12,
    expectedResult: 'insufficient-material',
    expectedCompletion: Object.freeze({ sessionsCompletedDelta: 1, curriculumCompletedDelta: 1, recentSessionsDelta: 1, duplicateTerminals: 0 })
});

class Classes {
    #values = new Set();
    add(...values) { values.forEach(value => this.#values.add(value)); }
    remove(...values) { values.forEach(value => this.#values.delete(value)); }
    toggle(value, force) { force ? this.add(value) : this.remove(value); }
    contains(value) { return this.#values.has(value); }
    [Symbol.iterator]() { return this.#values[Symbol.iterator](); }
}

class Node {
    constructor(classes = []) { this.classList = new Classes(); this.classList.add(...classes); this.attributes = {}; this.parentNode = null; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    focus() { }
}

class BoardElement extends Node {
    constructor() {
        super(); this.listeners = new Map(); this.squares = [];
        for (const rank of '12345678') for (const file of 'abcdefgh') {
            const square = new Node(['square-55d63', `square-${file}${rank}`]); square.parentNode = this; this.squares.push(square);
        }
    }
    querySelector(selector) { return this.squares.find(node => node.classList.contains(selector.slice(1))) ?? null; }
    querySelectorAll(selector) { return selector === '.square-55d63' ? [...this.squares] : []; }
    addEventListener(type, callback, options = {}) {
        const listeners = this.listeners.get(type) ?? []; listeners.push(callback); this.listeners.set(type, listeners);
        options.signal?.addEventListener('abort', () => this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item !== callback)), { once: true });
    }
}

class DeterministicFixtureEngine {
    constructor() { this.searches = []; this.initializeCalls = 0; this.stopCalls = 0; this.disposeCalls = 0; }
    async initialize() { this.initializeCalls += 1; return true; }
    async requestBestMove({ fen }) {
        const bestMove = ENGINE_BRANCH.get(fen);
        if (!bestMove) throw Object.assign(new Error('fixture-branch-mismatch'), { code: 'fixture-branch-mismatch' });
        this.searches.push({ fen, bestMove });
        return { requestId: this.searches.length, fen, bestMove, lines: [], completed: true };
    }
    async analyzePosition({ fen }) {
        const bestMove = ENGINE_BRANCH.get(fen) ?? USER_MOVES[0];
        return { requestId: this.searches.length + 1, fen, bestMove, lines: [{ multipv: 1, pv: [bestMove] }], completed: true };
    }
    async stop() { this.stopCalls += 1; }
    dispose() { this.disposeCalls += 1; }
}

export function createEt10cMemoryStorage(initial = null) {
    let value = initial;
    return { getItem: () => value, setItem: (_key, next) => { value = next; }, removeItem: () => { value = null; }, raw: () => value };
}

export function createAuthorizedEt10cHarness({ storage = createEt10cMemoryStorage(), now = () => 1700000000000 } = {}) {
    const curriculum = createEndgameCurriculum();
    const lesson = curriculum.getLesson(ET10C_FIXTURE.pathId, ET10C_FIXTURE.lessonId);
    const path = curriculum.getPath(ET10C_FIXTURE.pathId);
    const progressStore = createEndgameProgressStore({ storage, now }); progressStore.load();
    const engine = new DeterministicFixtureEngine();
    const boardElement = new BoardElement();
    const boardLog = { positions: [], orientations: [], destroyed: 0 };
    const owners = new Map();
    const candidateSelector = async () => ({
        ok: true,
        selected: {
            fen: ET10C_FIXTURE.fen,
            positionKey: ET10C_FIXTURE.fen.split(' ').slice(0, 4).join(' '),
            metadata: { categoryId: 'KRPvKR', strongSide: 'black', sideToMove: 'black', trainingRole: 'defense', source: 'integration-fixture', fixtureId: FIXTURE_ID },
            classification: { type: 'rook-pawn-practice', labels: ['active-defense'] },
            scoring: { score: 100, reasons: [] }
        },
        candidatesEvaluated: 1,
        usedFallback: false
    });
    const observe = snapshot => {
        const state = snapshot?.controllerState; if (!state?.sessionId) return;
        const owner = owners.get(state.sessionId) ?? { prepared: false, started: false, terminal: false };
        owners.set(state.sessionId, owner);
        if (!owner.prepared && state.status === 'ready') {
            progressStore.recordPreparedPosition({ id: state.sessionId, category: state.categoryId }); owner.prepared = true;
        }
        if (!owner.started && ['user-turn', 'engine-thinking', 'completed'].includes(state.status)) {
            progressStore.recordSessionStarted({ id: state.sessionId, category: state.categoryId });
            progressStore.recordCurriculumStarted({ id: state.sessionId, pathId: lesson.pathId, lessonId: lesson.id }); owner.started = true;
        }
        if (!owner.terminal && state.status === 'completed') {
            const entry = { id: state.sessionId, category: state.categoryId, pieceCount: 5, userColor: state.userColor,
                result: state.result.gameResult, exerciseOutcome: state.result.exerciseOutcome, completed: true,
                attemptNumber: state.attemptNumber, hintsUsed: state.hintsUsed, undosUsed: state.undosUsed,
                moveCount: state.moveHistory.length, initialFen: state.initialFen, finalFen: state.currentFen,
                mode: 'guided', pathId: lesson.pathId, lessonId: lesson.id, pathTitle: path.title,
                lessonTitle: lesson.title, trainingRole: lesson.trainingRole, completionRule: lesson.completionRule };
            progressStore.recordSessionCompleted(entry); progressStore.recordCurriculumTerminal(entry); owner.terminal = true;
        }
    };
    const runtime = createEndgameTrainerRuntime({
        boardElement,
        createBoard: (_element, _config) => ({
            position: fen => boardLog.positions.push(fen), orientation: color => boardLog.orientations.push(color),
            resize() { }, destroy() { boardLog.destroyed += 1; }
        }),
        boardOptions: { resizeObserver: false },
        candidateSelector,
        createEngineAdapter: () => engine,
        callbacks: { onStateChange: observe }
    }).initialize();
    return Object.freeze({
        fixture: ET10C_FIXTURE, storage, progressStore, curriculum, engine, runtime, boardLog,
        async run() {
            const before = progressStore.getSnapshot();
            await runtime.binding.prepare({ categoryId: 'KRPvKR', userColor: 'white', seed: FIXTURE_ID, candidateCount: 1 });
            await runtime.binding.start();
            for (const move of USER_MOVES) {
                const accepted = await runtime.binding.handleMoveIntent({ from: move.slice(0, 2), to: move.slice(2, 4) });
                if (!accepted) throw new Error(`fixture-user-move-rejected:${move}`);
            }
            return { before, state: runtime.controller.getState(), progress: progressStore.getSnapshot() };
        },
        dispose() { runtime.dispose(); progressStore.dispose(); }
    });
}
