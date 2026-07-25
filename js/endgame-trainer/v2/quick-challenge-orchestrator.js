import { ChessRulesFacade } from '../chess-rules-facade.js';
import {
    createEndgameSession, formatElapsedTime, scoreQuickChallengeResult
} from './endgame-v2-contracts.js';
import {
    validatePublishedPoolArtifact
} from './curated-pool-validator.js';

const TRANSITIONS = Object.freeze({
    configured: ['loading', 'abandoned'],
    loading: ['ready', 'recovering', 'unavailable', 'error', 'abandoned'],
    ready: ['active', 'abandoned'],
    active: ['evaluating', 'feedback', 'abandoned'],
    evaluating: ['feedback', 'recovering', 'error', 'abandoned'],
    feedback: ['loading-next', 'completed', 'abandoned'],
    'loading-next': ['active', 'recovering', 'completed', 'unavailable', 'error', 'abandoned'],
    recovering: ['loading-next', 'active', 'unavailable', 'error', 'abandoned'],
    unavailable: ['loading-next', 'completed', 'abandoned'],
    error: ['recovering', 'abandoned'],
    completed: [],
    abandoned: []
});

let sessionSequence = 0;

export class QuickChallengeOrchestrator {
    #items;
    #onChange;
    #now;
    #loadItem;
    #state;
    #startedAt = null;
    #itemStartedAt = null;
    #locked = false;
    #generation = 0;

    constructor({ pool, items, onChange = () => {}, now = () => performance.now(), loadItem = async () => true, sessionId } = {}) {
        const poolValidation = validatePublishedPoolArtifact(pool, {
            poolId: pool?.poolId,
            poolVersion: pool?.poolVersion,
            contentFingerprint: pool?.contentFingerprint
        });
        if (!poolValidation.valid || !Array.isArray(items) || items.length !== 5 ||
            items.some((item) => !pool.positionIds.includes(item.positionId)))
            throw new TypeError('Quick Challenge curated pool contract is invalid.');
        this.#items = items;
        this.#onChange = onChange;
        this.#now = now;
        this.#loadItem = loadItem;
        const timestamp = this.#now();
        const session = createEndgameSession({
            sessionId: sessionId || `qc-${Math.floor(timestamp)}-${++sessionSequence}`,
            sourceId: pool.contentFingerprint,
            sourceVersion: '1.0.0',
            poolId: pool.poolId,
            poolVersion: pool.poolVersion,
            now: timestamp
        });
        this.#state = this.#snapshot({
            ...session, phase: 'configured', index: -1, item: null, score: 0,
            hintUsed: false, hintLevel: 0, feedback: '', elapsedMs: 0, itemElapsedMs: 0, results: []
        });
    }

    getState() { return this.#state; }

    async start() {
        if (this.#state.phase !== 'configured' || this.#locked) return false;
        this.#startedAt = this.#now();
        this.#transition('loading', { startedAt: this.#startedAt });
        return this.#activateNext(0, 'active', true);
    }

    revealHint() {
        if (this.#state.phase !== 'active' || this.#state.hintLevel >= 2) return false;
        if (this.#state.hintLevel === 1) {
            this.#finishItem({ kind: 'revealed', correct: false, playedSan: null, resultingFen: null });
            return true;
        }
        this.#commit({
            hintUsed: true, hintLevel: 1, hintState: {
                ...this.#state.hintState, usedThisItem: true
            }, feedback: this.#state.item.hintStages[0].text
        });
        return true;
    }

    submitMove(intent) {
        if (this.#state.phase !== 'active' || this.#locked) return false;
        this.#locked = true;
        try {
            const lan = `${intent?.from || ''}${intent?.to || ''}${intent?.promotion || ''}`;
            const rules = ChessRulesFacade.fromFen(this.#state.item.fen);
            const played = rules.move({ from: intent.from, to: intent.to, promotion: intent.promotion || undefined });
            this.#transition('evaluating');
            const acceptedMoves = new Set([
                this.#state.item.expectedLan,
                ...this.#state.item.acceptedAlternatives.map((move) => move.lan)
            ]);
            const correct = acceptedMoves.has(lan);
            this.#finishItem({
                kind: correct ? 'correct' : 'incorrect', correct,
                playedSan: played.san, resultingFen: rules.fen()
            });
            return true;
        } catch {
            if (this.#state.phase === 'evaluating') this.#transition('recovering', { feedback: 'Evaluation could not be completed. Your score and streak were not changed.' });
            return false;
        } finally {
            this.#locked = false;
        }
    }

    skip() {
        if (this.#state.phase !== 'active' || this.#locked) return false;
        this.#finishItem({ kind: 'skipped', correct: false, playedSan: null, resultingFen: null });
        return true;
    }

    async continue() {
        if (!['feedback', 'unavailable'].includes(this.#state.phase) || this.#locked) return false;
        if (this.#state.index + 1 >= this.#items.length) {
            this.#complete();
            return true;
        }
        this.#transition('loading-next');
        return this.#activateNext(this.#state.index + 1, 'active');
    }

    async retry() {
        if (!['recovering', 'error'].includes(this.#state.phase) || this.#locked) return false;
        this.#transition('loading-next');
        return this.#activateNext(Math.max(0, this.#state.index), 'active');
    }

    abandon() {
        if (['completed', 'abandoned'].includes(this.#state.phase)) return false;
        this.#generation += 1;
        this.#transition('abandoned', { endedAt: this.#now(), item: null, feedback: 'Quick Challenge ended.' });
        return true;
    }

    tick() {
        if (this.#state.phase !== 'active') return this.#state.itemElapsedMs;
        const itemElapsedMs = Math.max(0, this.#now() - this.#itemStartedAt);
        const elapsedMs = Math.max(0, this.#now() - this.#startedAt);
        this.#commit({
            elapsedMs, itemElapsedMs,
            timerState: { ...this.#state.timerState, elapsedMs, itemElapsedMs }
        }, false);
        return itemElapsedMs;
    }

    async #activateNext(index, targetState, initial = false) {
        this.#locked = true;
        const generation = ++this.#generation;
        const item = this.#items[index];
        try {
            const loaded = await this.#loadItem(item, Object.freeze({ generation, sessionId: this.#state.sessionId }));
            if (generation !== this.#generation || ['abandoned', 'completed'].includes(this.#state.phase)) return false;
            if (loaded === false) {
                this.#recordUnavailable(index, item);
                return false;
            }
            this.#itemStartedAt = this.#now();
            if (initial) this.#transition('ready', { index, currentItemIndex: index, item });
            this.#transition(targetState, {
                index, currentItemIndex: index, item, hintUsed: false, hintLevel: 0, feedback: '',
                itemElapsedMs: 0, hintState: { ...this.#state.hintState, usedThisItem: false }
            });
            return true;
        } catch {
            if (generation !== this.#generation) return false;
            this.#transition('recovering', {
                index, currentItemIndex: index, item,
                feedback: 'This position could not be loaded. Retry or continue safely.'
            });
            return false;
        } finally {
            this.#locked = false;
        }
    }

    #recordUnavailable(index, item) {
        const result = Object.freeze({
            itemId: item.positionId, kind: 'unavailable', correct: false, hintUsed: false,
            points: 0, elapsedMs: 0, elapsedLabel: '0:00', playedSan: null, resultingFen: null
        });
        this.#transition('unavailable', {
            index, currentItemIndex: index, item, unavailableItems: this.#state.unavailableItems + 1,
            feedback: 'This position is unavailable. It did not affect your score or streak.',
            results: [...this.#state.results, result]
        });
    }

    #finishItem({ kind, correct, playedSan, resultingFen }) {
        if (this.#state.phase === 'active') this.#transition('evaluating');
        const itemElapsedMs = Math.max(0, this.#now() - this.#itemStartedAt);
        const elapsedMs = Math.max(0, this.#now() - this.#startedAt);
        const points = scoreQuickChallengeResult({ correct, hintUsed: this.#state.hintUsed });
        const independent = correct && !this.#state.hintUsed;
        const currentStreak = independent ? this.#state.currentStreak + 1 : 0;
        const result = Object.freeze({
            itemId: this.#state.item.positionId, kind, correct, hintUsed: this.#state.hintUsed,
            points, elapsedMs: itemElapsedMs, elapsedLabel: formatElapsedTime(itemElapsedMs),
            playedSan, resultingFen
        });
        const feedback = correct
            ? `${this.#state.hintUsed ? 'Solved with help' : 'Correct'}: ${playedSan}.`
            : kind === 'skipped' ? `Skipped. The authored move is ${this.#state.item.expectedSan}.`
                : kind === 'revealed' ? `Answer revealed: ${this.#state.item.expectedSan}. This item earns no independent points.`
                : `The authored move is ${this.#state.item.expectedSan}.`;
        this.#transition('feedback', {
            score: this.#state.score + points,
            scoreState: { ...this.#state.scoreState, points: this.#state.score + points },
            currentStreak, bestStreak: Math.max(this.#state.bestStreak, currentStreak),
            completedItems: this.#state.completedItems + (correct ? 1 : 0),
            failedItems: this.#state.failedItems + (!correct && !['skipped', 'revealed'].includes(kind) ? 1 : 0),
            skippedItems: this.#state.skippedItems + (kind === 'skipped' ? 1 : 0),
            hintState: {
                ...this.#state.hintState,
                assistedItems: this.#state.hintState.assistedItems + (correct && this.#state.hintUsed ? 1 : 0)
            },
            elapsedMs, itemElapsedMs, timerState: { ...this.#state.timerState, elapsedMs, itemElapsedMs },
            feedback, results: [...this.#state.results, result]
        });
    }

    #complete() {
        const endedAt = this.#now();
        const elapsedMs = Math.max(0, endedAt - this.#startedAt);
        this.#transition('completed', {
            endedAt, item: null, elapsedMs,
            timerState: { ...this.#state.timerState, elapsedMs },
            feedback: 'Quick Challenge complete.'
        });
    }

    #transition(next, patch = {}) {
        const allowed = TRANSITIONS[this.#state.phase] || [];
        if (!allowed.includes(next)) return false;
        this.#commit({ ...patch, phase: next, status: next });
        return true;
    }

    #commit(patch, announce = true) {
        this.#state = this.#snapshot({ ...this.#state, ...patch });
        if (announce) this.#onChange(this.#state);
    }

    #snapshot(value) {
        return Object.freeze({
            ...value,
            scoreState: Object.freeze({ ...value.scoreState }),
            timerState: Object.freeze({ ...value.timerState }),
            hintState: Object.freeze({ ...value.hintState }),
            results: Object.freeze([...(value.results || [])])
        });
    }
}
