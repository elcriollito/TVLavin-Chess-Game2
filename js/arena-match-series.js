(function installArenaMatchSeries(globalScope) {
    'use strict';

    const STATES = Object.freeze({
        IDLE: 'IDLE',
        PREPARING_GAME: 'PREPARING_GAME',
        RUNNING_GAME: 'RUNNING_GAME',
        BETWEEN_GAMES: 'BETWEEN_GAMES',
        PAUSED: 'PAUSED',
        STOPPING: 'STOPPING',
        STOPPED: 'STOPPED',
        COMPLETED: 'COMPLETED',
        ERROR: 'ERROR'
    });

    const ACTIVE_STATES = new Set([
        STATES.PREPARING_GAME,
        STATES.RUNNING_GAME,
        STATES.BETWEEN_GAMES,
        STATES.PAUSED,
        STATES.STOPPING
    ]);

    function createId(prefix) {
        return globalScope.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function cloneValue(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.values(value).forEach(deepFreeze);
        return Object.freeze(value);
    }

    function participantKey(participant, fallback) {
        return String(participant?.id || participant?.providerId || participant?.name || fallback);
    }

    function normalizeParticipant(participant, fallback) {
        return Object.freeze({
            id: participantKey(participant, fallback),
            name: String(participant?.name || participant?.displayName || fallback),
            providerId: String(participant?.providerId || participant?.id || fallback)
        });
    }

    function createScoreEntry(participant) {
        return {
            id: participant.id,
            name: participant.name,
            points: 0,
            wins: 0,
            draws: 0,
            losses: 0
        };
    }

    function validateGameCount(value, { min = 1, max = 100 } = {}) {
        const count = Number(value);
        if (!Number.isInteger(count) || count < min || count > max) {
            throw new RangeError(`Game count must be a whole number from ${min} to ${max}.`);
        }
        return count;
    }

    function fullMovesToPly(value) {
        if (value === null || value === undefined || value === '' || value === 'none') return null;
        const fullMoves = Number(value);
        if (!Number.isInteger(fullMoves) || fullMoves < 1 || fullMoves > 500) {
            throw new RangeError('Move limit must be a whole number from 1 to 500 full moves.');
        }
        return fullMoves * 2;
    }

    function buildSchedule(config) {
        const games = [];
        for (let index = 0; index < config.gameCount; index += 1) {
            const swapped = index % 2 === 1;
            games.push(Object.freeze({
                round: index + 1,
                white: swapped ? config.participantB : config.participantA,
                black: swapped ? config.participantA : config.participantB,
                startingFen: config.startingFen
            }));
        }
        return Object.freeze(games);
    }

    function createConfigSnapshot(input) {
        const gameCount = validateGameCount(input?.gameCount);
        const participantA = normalizeParticipant(input?.participantA, 'Engine A');
        const participantB = normalizeParticipant(input?.participantB, 'Engine B');
        if (participantA.id === participantB.id) {
            throw new Error('Match Series requires two distinct participants.');
        }
        const moveLimitFullMoves = input?.moveLimitFullMoves == null
            ? null : Number(input.moveLimitFullMoves);
        const moveLimitPly = fullMovesToPly(moveLimitFullMoves);
        return deepFreeze(cloneValue({
            title: String(input?.title || `${participantA.name} vs ${participantB.name}`).trim(),
            participantA,
            participantB,
            gameCount,
            moveLimitFullMoves,
            moveLimitPly,
            startingFen: String(input?.startingFen || '').trim(),
            opening: input?.opening || { type: 'standard', selection: null },
            timeControl: input?.timeControl || { mode: 'blitz', preset: '3+2' },
            savePgn: input?.savePgn !== false,
            colorOrder: Object.freeze([participantA.id, participantB.id])
        }));
    }

    class MatchSeriesController {
        constructor({ idFactory = createId, onChange = null } = {}) {
            this.idFactory = idFactory;
            this.onChange = typeof onChange === 'function' ? onChange : null;
            this.generationCounter = 0;
            this.reset();
        }

        reset() {
            this.state = STATES.IDLE;
            this.seriesId = null;
            this.config = null;
            this.schedule = Object.freeze([]);
            this.games = [];
            this.currentGame = null;
            this.score = null;
            this.error = null;
            this.notify('reset');
            return this.snapshot();
        }

        start(input) {
            if (this.isActive()) throw new Error('A Match Series is already active.');
            const config = createConfigSnapshot(input);
            this.seriesId = this.idFactory('series');
            this.config = config;
            this.schedule = buildSchedule(config);
            this.games = [];
            this.currentGame = null;
            this.error = null;
            this.score = {
                [config.participantA.id]: createScoreEntry(config.participantA),
                [config.participantB.id]: createScoreEntry(config.participantB),
                completed: 0,
                remaining: config.gameCount
            };
            this.transition(STATES.PREPARING_GAME, 'series-started');
            return this.prepareGame(0);
        }

        prepareGame(index = this.games.length) {
            if (![STATES.PREPARING_GAME, STATES.BETWEEN_GAMES].includes(this.state)) {
                throw new Error(`Cannot prepare a game while series is ${this.state}.`);
            }
            const scheduled = this.schedule[index];
            if (!scheduled) throw new RangeError('No scheduled game remains.');
            const game = {
                gameId: this.idFactory('game'),
                generation: ++this.generationCounter,
                round: scheduled.round,
                white: scheduled.white,
                black: scheduled.black,
                startingFen: scheduled.startingFen,
                moves: [],
                result: null,
                termination: null,
                startedAt: null,
                endedAt: null
            };
            this.games.push(game);
            this.currentGame = game;
            this.transition(STATES.PREPARING_GAME, 'game-preparing');
            return game;
        }

        markRunning(generation = this.currentGame?.generation) {
            if (!this.accepts(generation) || this.state !== STATES.PREPARING_GAME) return false;
            this.currentGame.startedAt = Date.now();
            this.transition(STATES.RUNNING_GAME, 'game-running');
            return true;
        }

        pause(generation = this.currentGame?.generation) {
            if (!this.accepts(generation) || this.state !== STATES.RUNNING_GAME) return false;
            this.transition(STATES.PAUSED, 'series-paused');
            return true;
        }

        resume(generation = this.currentGame?.generation) {
            if (!this.accepts(generation) || this.state !== STATES.PAUSED) return false;
            this.transition(STATES.RUNNING_GAME, 'series-resumed');
            return true;
        }

        recordMove(generation, move) {
            if (!this.accepts(generation) || ![STATES.RUNNING_GAME, STATES.PAUSED].includes(this.state)) return false;
            this.currentGame.moves.push(deepFreeze(cloneValue(move)));
            return true;
        }

        reachedMoveLimit(plyCount, generation = this.currentGame?.generation) {
            if (!this.accepts(generation) || this.config?.moveLimitPly == null) return false;
            return Number(plyCount) >= this.config.moveLimitPly;
        }

        complete(generation, { result, termination, moves = null } = {}) {
            if (!this.accepts(generation) || ![STATES.RUNNING_GAME, STATES.PAUSED].includes(this.state)) return false;
            if (!['1-0', '0-1', '1/2-1/2', '*'].includes(result)) {
                throw new Error(`Unsupported game result: ${result}`);
            }
            const game = this.currentGame;
            if (Array.isArray(moves)) game.moves = cloneValue(moves);
            game.result = result;
            game.termination = String(termination || 'other-existing-reason');
            game.endedAt = Date.now();
            this.applyScore(game);
            this.score.completed += 1;
            this.score.remaining = Math.max(0, this.config.gameCount - this.score.completed);

            if (this.score.completed >= this.config.gameCount) {
                this.transition(STATES.COMPLETED, 'series-completed');
            } else {
                this.transition(STATES.BETWEEN_GAMES, 'game-completed');
            }
            return true;
        }

        advance() {
            if (this.state !== STATES.BETWEEN_GAMES) return null;
            return this.prepareGame(this.games.length);
        }

        stop({ includeUnfinished = true } = {}) {
            if (!this.isActive()) return false;
            this.transition(STATES.STOPPING, 'series-stopping');
            if (includeUnfinished && this.currentGame && this.currentGame.result === null) {
                this.currentGame.result = '*';
                this.currentGame.termination = 'stopped';
                this.currentGame.endedAt = Date.now();
            }
            this.transition(STATES.STOPPED, 'series-stopped');
            return true;
        }

        fail(message) {
            this.error = String(message || 'Match Series failed.');
            if (this.currentGame && this.currentGame.result === null) {
                this.currentGame.result = '*';
                this.currentGame.termination = 'engine-error';
                this.currentGame.endedAt = Date.now();
            }
            this.transition(STATES.ERROR, 'series-error');
            return true;
        }

        accepts(generation) {
            return Number(generation) === this.currentGame?.generation;
        }

        isActive() {
            return ACTIVE_STATES.has(this.state);
        }

        applyScore(game) {
            const white = this.score[game.white.id];
            const black = this.score[game.black.id];
            if (!white || !black || game.result === '*') return;
            if (game.result === '1-0') {
                white.points += 1;
                white.wins += 1;
                black.losses += 1;
            } else if (game.result === '0-1') {
                black.points += 1;
                black.wins += 1;
                white.losses += 1;
            } else {
                white.points += 0.5;
                black.points += 0.5;
                white.draws += 1;
                black.draws += 1;
            }
        }

        transition(nextState, reason) {
            this.state = nextState;
            this.notify(reason);
        }

        notify(reason) {
            this.onChange?.(this.snapshot(), reason);
        }

        snapshot() {
            return {
                seriesId: this.seriesId,
                state: this.state,
                config: this.config,
                games: cloneValue(this.games || []),
                currentGame: this.currentGame ? cloneValue(this.currentGame) : null,
                score: this.score ? cloneValue(this.score) : null,
                error: this.error
            };
        }
    }

    globalScope.CaissaArenaMatchSeries = Object.freeze({
        STATES,
        MatchSeriesController,
        buildSchedule,
        createConfigSnapshot,
        fullMovesToPly,
        validateGameCount
    });
})(globalThis);
