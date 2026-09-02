/**
 * CAISSA normalized GameRecord 1.0.0.
 *
 * Read-only normalization over CaissaPlayCompatibility snapshots. This module
 * never owns lifecycle, result, notation, clocks, UI, or persistence. It does
 * not repair legacy PGN or infer unavailable timestamps/termination causes.
 */
(function installGameRecord(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    if (global.CaissaGameRecord?.schemaVersion === SCHEMA_VERSION) return;

    const MAX_PGN_LENGTH = 1_000_000;
    const MAX_FEN_LENGTH = 200;
    const MAX_MOVES = 10_000;
    const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const STATUSES = Object.freeze(['idle', 'in-progress', 'completed', 'aborted', 'unknown']);
    const RESULTS = Object.freeze(['1-0', '0-1', '1/2-1/2', '*', null]);
    const TERMINATIONS = Object.freeze([
        'checkmate', 'resignation', 'timeout', 'stalemate', 'repetition',
        'insufficient-material', 'fifty-move-rule', 'draw-agreement',
        'engine-failure', 'aborted', 'unknown', null
    ]);
    const DIAGNOSTIC_CODES = Object.freeze([
        'INVALID_RECORD', 'INVALID_RECORD_SHAPE', 'UNSUPPORTED_SCHEMA_VERSION',
        'INVALID_RECORD_ID', 'INVALID_CAPTURED_AT', 'INVALID_STATUS', 'INVALID_FEN',
        'INVALID_RESULT', 'INVALID_MOVES', 'INVALID_SERIALIZED_RECORD',
        'MISSING_FEN', 'MISSING_PGN', 'INVALID_PGN', 'RESULT_UNKNOWN',
        'PGN_RESULT_MISMATCH', 'MOVE_COUNT_MISMATCH', 'TERMINATION_UNKNOWN',
        'CLOCK_DATA_INCOMPLETE', 'LEGACY_STATE_INCONSISTENT', 'UNSUPPORTED_MODE',
        'UNSUPPORTED_SOURCE'
    ]);

    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const exact = (value, keys) => isObject(value) && Object.keys(value).every(key => keys.includes(key))
        && !Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key));

    function hasDangerousKeys(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return false;
        seen.add(value);
        if (Object.keys(value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) return true;
        return Object.values(value).some(item => hasDangerousKeys(item, seen));
    }

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }

    function stable(value) {
        if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
        if (isObject(value))
            return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
        return JSON.stringify(value);
    }

    function fingerprint(value) {
        let hash = 2166136261;
        for (const character of stable(value))
            hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
        return `local-play:fnv1a32-${(hash >>> 0).toString(16).padStart(8, '0')}`;
    }

    function iso(value) {
        const parsed = value instanceof Date ? value : new Date(value);
        return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
    }

    function diagnostic(code, severity, path, message, observedValue) {
        const item = { code, severity, path, message };
        if (observedValue !== undefined &&
            (observedValue === null || ['string', 'number', 'boolean'].includes(typeof observedValue)))
            item.observedValue = typeof observedValue === 'string'
                ? observedValue.slice(0, 160)
                : observedValue;
        return deepFreeze(item);
    }

    function normalizeResult(value) {
        if (value === '½-½' || value === '1/2-1/2') return '1/2-1/2';
        if (value === '1-0' || value === '0-1' || value === '*') return value;
        return null;
    }

    function inspectPgn(pgn) {
        const warnings = [];
        if (pgn === null || pgn === undefined || pgn === '') {
            warnings.push(diagnostic('MISSING_PGN', 'warning', 'notation.pgn', 'Legacy PGN is unavailable.'));
            return { pgn: typeof pgn === 'string' ? pgn : null, resultToken: null, headers: {}, warnings };
        }
        if (typeof pgn !== 'string' || pgn.length > MAX_PGN_LENGTH || pgn.includes('\0')) {
            warnings.push(diagnostic('INVALID_PGN', 'warning', 'notation.pgn', 'Legacy PGN is malformed or exceeds the supported bound.'));
            return { pgn: typeof pgn === 'string' ? pgn.slice(0, MAX_PGN_LENGTH) : null, resultToken: null, headers: {}, warnings };
        }
        const headers = {};
        const headerPattern = /^\[([A-Za-z][A-Za-z0-9_]*)\s+"((?:\\.|[^"\\])*)"\]\s*$/gm;
        let match;
        while ((match = headerPattern.exec(pgn)) !== null) {
            if (!Object.prototype.hasOwnProperty.call(headers, match[1]))
                headers[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\').slice(0, 500);
        }
        const withoutHeaders = pgn.replace(/^\s*\[[^\r\n]*\]\s*$/gm, ' ').trim();
        const tokenMatch = withoutHeaders.match(/(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/);
        const headerToken = normalizeResult(headers.Result);
        return {
            pgn,
            resultToken: tokenMatch ? tokenMatch[1] : headerToken,
            headers,
            warnings
        };
    }

    function completedQuickPlayPgn(pgnValue, snapshot, resultValue, termination, capturedAt) {
        if (typeof pgnValue !== 'string' || snapshot.mode !== 'engine'
            || !Number.isFinite(snapshot.clocks?.timeControlSeconds)
            || !Number.isFinite(snapshot.clocks?.incrementSeconds)
            || !['1-0', '0-1', '1/2-1/2'].includes(resultValue)) return pgnValue;
        const existing = inspectPgn(pgnValue).headers;
        const date = capturedAt.slice(0, 10).replaceAll('-', '.');
        const gamesOpponent = global.CaissaPlayV2IdentityPolicy?.isPlayV2?.()
            ? global.CaissaPlayV2IdentityPolicy.gamesOpponentName() : 'CAISSA Engine';
        const headers = {
            Event: 'CAISSA Quick Play', Site: 'CAISSA Native Play', Date: date,
            White: snapshot.playerColor === 'white' ? 'Player' : gamesOpponent,
            Black: snapshot.playerColor === 'black' ? 'Player' : gamesOpponent,
            Result: resultValue,
            TimeControl: `${snapshot.clocks.timeControlSeconds}+${snapshot.clocks.incrementSeconds}`,
            Termination: termination || 'unknown'
        };
        const added = Object.entries(headers).filter(([name]) => !Object.hasOwn(existing, name))
            .map(([name, value]) => `[${name} "${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`);
        let body = pgnValue.trim();
        if (!/(?:^|\s)(1-0|0-1|1\/2-1\/2|\*)\s*$/.test(body)) body = `${body}${body ? ' ' : ''}${resultValue}`;
        return `${added.join('\n')}${added.length && body ? '\n\n' : ''}${body}`;
    }

    function validateFenValue(fen) {
        if (typeof fen !== 'string' || !fen || fen.length > MAX_FEN_LENGTH || fen.includes('\0')) return false;
        if (typeof global.Chess !== 'function') return /^(\S+ ){5}\S+$/.test(fen);
        try {
            const game = new global.Chess();
            return game.load(fen) !== false;
        } catch (_) {
            return false;
        }
    }

    function normalizeMove(move, index) {
        const source = isObject(move) ? move : {};
        return {
            ply: index + 1,
            color: source.color === 'w' ? 'white' : source.color === 'b' ? 'black'
                : source.color === 'white' || source.color === 'black' ? source.color : null,
            from: typeof source.from === 'string' ? source.from : null,
            to: typeof source.to === 'string' ? source.to : null,
            san: typeof move === 'string' ? move.slice(0, 40)
                : typeof source.san === 'string' ? source.san.slice(0, 40) : null,
            promotion: typeof source.promotion === 'string' ? source.promotion : null,
            flags: typeof source.flags === 'string' ? source.flags : null
        };
    }

    function modeFrom(value) {
        if (value === 'engine') return 'human-vs-engine';
        if (value === 'human') return 'local';
        if (value === 'analysis') return 'analysis';
        if (value === 'eve') return 'engine-vs-engine';
        return 'unknown';
    }

    function terminationFrom(status) {
        const state = String(status?.state || '').toLowerCase();
        const message = String(status?.message || '').toLowerCase();
        if (state === 'checkmate') return 'checkmate';
        if (state === 'stalemate') return 'stalemate';
        if (state === 'timeout') return 'timeout';
        if (state === 'white resigned' || state === 'black resigned') return 'resignation';
        if (state.includes('threefold') || message.includes('threefold')) return 'repetition';
        if (state.includes('insufficient') || message.includes('insufficient')) return 'insufficient-material';
        if (state.includes('fifty') || message.includes('fifty')) return 'fifty-move-rule';
        if (state === 'aborted') return 'aborted';
        return null;
    }

    function deriveStatus(snapshot, resultValue, termination, moves) {
        if (termination === 'aborted') return 'aborted';
        if (snapshot?.game?.active === true) return 'in-progress';
        if (['1-0', '0-1', '1/2-1/2'].includes(resultValue) &&
            (termination !== null || snapshot?.game?.active === false))
            return 'completed';
        if (!moves.length && resultValue === null) return 'idle';
        if (snapshot?.game?.active === false && moves.length) return 'unknown';
        return 'unknown';
    }

    function winnerFrom(resultValue) {
        if (resultValue === '1-0') return 'white';
        if (resultValue === '0-1') return 'black';
        return null;
    }

    function buildFromSnapshot(snapshot, options = {}) {
        if (!isObject(snapshot)) throw new TypeError('compatibility snapshot is required');
        if (!isObject(options)) throw new TypeError('builder options must be an object');
        const capturedAt = iso(options.capturedAt ?? snapshot.capturedAt ?? new Date());
        if (!capturedAt) throw new TypeError('capturedAt must be a valid date');

        const pgnInput = options.pgn !== undefined ? options.pgn : snapshot.position?.pgn;
        const finalFen = options.finalFen !== undefined ? options.finalFen : snapshot.position?.fen;
        const movesInput = Array.isArray(options.moveHistory) ? options.moveHistory
            : Array.isArray(snapshot.position?.moveHistory) ? snapshot.position.moveHistory : [];
        const boundedMoves = movesInput.slice(0, MAX_MOVES);
        const moves = boundedMoves.map(normalizeMove);
        const legacyResult = normalizeResult(options.result !== undefined ? options.result : snapshot.game?.result);
        const termination = options.termination !== undefined
            ? (TERMINATIONS.includes(options.termination) ? options.termination : null)
            : terminationFrom(snapshot.game?.status);
        const resultValue = legacyResult;
        const complete = ['1-0', '0-1', '1/2-1/2'].includes(resultValue)
            && snapshot.game?.active === false;
        const pgn = inspectPgn(complete
            ? completedQuickPlayPgn(pgnInput, snapshot, resultValue, termination, capturedAt)
            : pgnInput);
        const recordStatus = deriveStatus(snapshot, resultValue, termination, moves);
        const mode = modeFrom(snapshot.mode);
        const initialFromHeader = pgn.headers.SetUp === '1' && typeof pgn.headers.FEN === 'string'
            ? pgn.headers.FEN
            : null;
        const initialFen = options.initialFen !== undefined ? options.initialFen
            : initialFromHeader || (finalFen === STANDARD_FEN || (moves.length > 0 && !pgn.headers.FEN) ? STANDARD_FEN : null);
        const mismatch = !!(resultValue && pgn.resultToken && resultValue !== pgn.resultToken)
            || !!(resultValue && !pgn.resultToken && complete);
        const diagnostics = [...pgn.warnings];

        if (!finalFen) diagnostics.push(diagnostic('MISSING_FEN', 'warning', 'position.finalFen', 'Final FEN is unavailable.'));
        else if (!validateFenValue(finalFen))
            diagnostics.push(diagnostic('INVALID_FEN', 'warning', 'position.finalFen', 'Final FEN is invalid.', finalFen));
        if (initialFen && !validateFenValue(initialFen))
            diagnostics.push(diagnostic('INVALID_FEN', 'warning', 'position.initialFen', 'Initial FEN is invalid.', initialFen));
        if (mismatch)
            diagnostics.push(diagnostic('PGN_RESULT_MISMATCH', 'warning', 'notation.pgnResultToken', 'Legacy result and PGN result token differ.', pgn.resultToken));
        if (resultValue === null && recordStatus !== 'idle')
            diagnostics.push(diagnostic('RESULT_UNKNOWN', 'warning', 'result.value', 'Legacy result is unknown.'));
        if (recordStatus === 'completed' && termination === null)
            diagnostics.push(diagnostic('TERMINATION_UNKNOWN', 'warning', 'result.termination', 'Completion termination is unknown.'));
        if (snapshot.position?.moveCount !== undefined && snapshot.position.moveCount !== moves.length)
            diagnostics.push(diagnostic('MOVE_COUNT_MISMATCH', 'warning', 'moves.count', 'Snapshot move count differs from normalized history.', snapshot.position.moveCount));
        if (movesInput.length > MAX_MOVES)
            diagnostics.push(diagnostic('LEGACY_STATE_INCONSISTENT', 'warning', 'moves.history', 'Move history exceeded the supported bound.', movesInput.length));
        if (mode === 'unknown')
            diagnostics.push(diagnostic('UNSUPPORTED_MODE', 'warning', 'mode', 'Legacy mode is unsupported.', snapshot.mode));
        if (snapshot.clocks?.whiteMilliseconds === null || snapshot.clocks?.whiteMilliseconds === undefined ||
            snapshot.clocks?.blackMilliseconds === null || snapshot.clocks?.blackMilliseconds === undefined)
            diagnostics.push(diagnostic('CLOCK_DATA_INCOMPLETE', 'warning', 'timing.finalClocks', 'Legacy clock data is incomplete.'));

        const coachSession = global.CaissaCoachSession?.getSnapshot?.()?.active || null;
        const nativeCoach = global.CaissaNativeCoachPanel?.getActiveSnapshot?.() || null;
        const botSession = global.CaissaBotSession?.getSnapshot?.() || null;
        const botProfile = botSession?.activeProfile || null;
        const botPresentation = botSession?.activePresentation || null;
        const coachActive = !!coachSession || nativeCoach?.status === 'active';
        const recordCore = {
            schemaVersion: SCHEMA_VERSION,
            capturedAt,
            status: recordStatus,
            source: 'local-play',
            mode,
            opponent: {
                type: coachActive ? 'coach' : botProfile || botPresentation ? 'bot' : mode === 'human-vs-engine' ? 'engine' : mode === 'local' ? 'local-human' : null,
                id: coachActive ? 'caissa-native-coach' : botPresentation?.id || botProfile?.id
                    || (typeof snapshot.selectedOpponent === 'string' ? snapshot.selectedOpponent.slice(0, 120) : null),
                name: coachActive ? 'Coach-assisted game' : botPresentation?.name || botProfile?.name
                    || (mode === 'human-vs-engine' && global.CaissaPlayV2IdentityPolicy?.isPlayV2?.()
                        ? global.CaissaPlayV2IdentityPolicy.gamesOpponentName() : null),
                rating: null
            },
            player: {
                color: snapshot.playerColor === 'white' || snapshot.playerColor === 'black' ? snapshot.playerColor : null
            },
            timing: {
                startedAt: null,
                endedAt: null,
                durationMs: null,
                timeControl: {
                    initialSeconds: Number.isFinite(snapshot.clocks?.timeControlSeconds)
                        ? snapshot.clocks.timeControlSeconds : null,
                    incrementSeconds: Number.isFinite(snapshot.clocks?.incrementSeconds)
                        ? snapshot.clocks.incrementSeconds : null
                },
                finalClocks: {
                    whiteMilliseconds: Number.isFinite(snapshot.clocks?.whiteMilliseconds)
                        ? snapshot.clocks.whiteMilliseconds : null,
                    blackMilliseconds: Number.isFinite(snapshot.clocks?.blackMilliseconds)
                        ? snapshot.clocks.blackMilliseconds : null,
                    activeColor: snapshot.clocks?.activeColor === 'white' || snapshot.clocks?.activeColor === 'black'
                        ? snapshot.clocks.activeColor : null,
                    running: snapshot.clocks?.running === true
                }
            },
            position: {
                initialFen: typeof initialFen === 'string' ? initialFen.slice(0, MAX_FEN_LENGTH) : null,
                finalFen: typeof finalFen === 'string' ? finalFen.slice(0, MAX_FEN_LENGTH) : null
            },
            moves: { count: moves.length, history: moves },
            result: {
                value: resultValue,
                termination,
                winner: winnerFrom(resultValue),
                complete,
                source: resultValue === null ? null : 'legacy-game-status'
            },
            notation: {
                pgn: pgn.pgn,
                pgnResultToken: pgn.resultToken,
                hasResultMismatch: mismatch
            },
            evaluationPolicy: {
                mode: snapshot.evaluation?.available ? 'legacy' : 'unknown',
                available: snapshot.evaluation?.available === true
            },
            coach: { enabled: coachActive, profileId: coachSession?.coachId || (coachActive ? 'caissa-native-coach' : null),
                assistanceLevel: coachSession?.assistanceLevel || nativeCoach?.configuration?.level || null },
            mentor: { requested: false, mentorId: null },
            pendingPromotion: snapshot.game?.pendingPromotion
                ? {
                    from: typeof snapshot.game.pendingPromotion.from === 'string' ? snapshot.game.pendingPromotion.from : null,
                    to: typeof snapshot.game.pendingPromotion.to === 'string' ? snapshot.game.pendingPromotion.to : null,
                    context: typeof snapshot.game.pendingPromotion.context === 'string' ? snapshot.game.pendingPromotion.context : null
                }
                : null,
            provenance: {
                compatibilitySchemaVersion: typeof snapshot.schemaVersion === 'string' ? snapshot.schemaVersion : null,
                legacyRuntime: true,
                capturedFromSection: typeof snapshot.section === 'string' ? snapshot.section.slice(0, 80) : null
            },
            diagnostics
        };
        const recordId = typeof options.recordId === 'string' && /^[a-z0-9:._-]{1,160}$/i.test(options.recordId)
            ? options.recordId
            : fingerprint(recordCore);
        return deepFreeze({ schemaVersion: recordCore.schemaVersion, recordId, ...recordCore });
    }

    function buildFromPlay(options = {}) {
        const compatibility = global.CaissaPlayCompatibility;
        if (!compatibility || typeof compatibility.getSnapshot !== 'function')
            throw new Error('Play compatibility boundary is unavailable');
        return buildFromSnapshot(compatibility.getSnapshot(), options);
    }

    const ROOT_KEYS = [
        'schemaVersion', 'recordId', 'capturedAt', 'status', 'source', 'mode', 'opponent',
        'player', 'timing', 'position', 'moves', 'result', 'notation', 'evaluationPolicy',
        'coach', 'mentor', 'pendingPromotion', 'provenance', 'diagnostics'
    ];

    function validate(record) {
        const errors = [];
        const warnings = [];
        const add = (target, code, path, message, observed) =>
            target.push(diagnostic(code, target === errors ? 'error' : 'warning', path, message, observed));
        try {
            if (hasDangerousKeys(record)) {
                add(errors, 'INVALID_RECORD_SHAPE', '$', 'Record contains a forbidden object key.');
                return deepFreeze({ valid: false, errors, warnings, record: null });
            }
            if (!exact(record, ROOT_KEYS) || ROOT_KEYS.some(key => !(key in record))) {
                add(errors, 'INVALID_RECORD_SHAPE', '$', 'Record shape is invalid.');
                return deepFreeze({ valid: false, errors, warnings, record: null });
            }
            if (record.schemaVersion !== SCHEMA_VERSION)
                add(errors, 'UNSUPPORTED_SCHEMA_VERSION', 'schemaVersion', 'Schema version is unsupported.', record.schemaVersion);
            if (typeof record.recordId !== 'string' || !/^[a-z0-9:._-]{1,160}$/i.test(record.recordId))
                add(errors, 'INVALID_RECORD_ID', 'recordId', 'Record ID is invalid.');
            if (iso(record.capturedAt) !== record.capturedAt)
                add(errors, 'INVALID_CAPTURED_AT', 'capturedAt', 'Captured time must be canonical ISO 8601 UTC.', record.capturedAt);
            if (!STATUSES.includes(record.status))
                add(errors, 'INVALID_STATUS', 'status', 'Record status is invalid.', record.status);
            if (!exact(record.position, ['initialFen', 'finalFen']))
                add(errors, 'INVALID_RECORD_SHAPE', 'position', 'Position shape is invalid.');
            else {
                if (record.position.initialFen !== null && !validateFenValue(record.position.initialFen))
                    add(errors, 'INVALID_FEN', 'position.initialFen', 'Initial FEN is invalid.', record.position.initialFen);
                if (record.position.finalFen !== null && !validateFenValue(record.position.finalFen))
                    add(errors, 'INVALID_FEN', 'position.finalFen', 'Final FEN is invalid.', record.position.finalFen);
                if (record.position.finalFen === null)
                    add(warnings, 'MISSING_FEN', 'position.finalFen', 'Final FEN is unavailable.');
            }
            if (!exact(record.moves, ['count', 'history']) || !Number.isSafeInteger(record.moves?.count) ||
                record.moves.count < 0 || !Array.isArray(record.moves.history) ||
                record.moves.count !== record.moves.history.length || record.moves.count > MAX_MOVES)
                add(errors, 'INVALID_MOVES', 'moves', 'Move collection is invalid.');
            if (!exact(record.result, ['value', 'termination', 'winner', 'complete', 'source']) ||
                !RESULTS.includes(record.result?.value) || !TERMINATIONS.includes(record.result?.termination) ||
                typeof record.result?.complete !== 'boolean')
                add(errors, 'INVALID_RESULT', 'result', 'Result shape or value is invalid.');
            if (!exact(record.notation, ['pgn', 'pgnResultToken', 'hasResultMismatch']) ||
                typeof record.notation?.hasResultMismatch !== 'boolean')
                add(errors, 'INVALID_RECORD_SHAPE', 'notation', 'Notation shape is invalid.');
            if (Array.isArray(record.diagnostics)) {
                for (const item of record.diagnostics) {
                    if (item?.severity === 'warning') warnings.push(deepFreeze({
                        code: String(item.code), severity: 'warning', path: String(item.path), message: String(item.message),
                        ...(item.observedValue !== undefined ? { observedValue: item.observedValue } : {})
                    }));
                }
            } else add(errors, 'INVALID_RECORD_SHAPE', 'diagnostics', 'Diagnostics must be an array.');
            return deepFreeze({ valid: errors.length === 0, errors, warnings, record: errors.length ? null : record });
        } catch (_) {
            add(errors, 'INVALID_RECORD', '$', 'Record could not be validated safely.');
            return deepFreeze({ valid: false, errors, warnings, record: null });
        }
    }

    function serialize(record) {
        const validation = validate(record);
        if (!validation.valid)
            return deepFreeze({ ok: false, status: 'invalid-record', value: null, validation });
        try {
            return deepFreeze({ ok: true, status: 'serialized', value: JSON.stringify(record), validation });
        } catch (_) {
            return deepFreeze({ ok: false, status: 'invalid-record', value: null, validation });
        }
    }

    function parse(serialized) {
        if (typeof serialized !== 'string' || serialized.length > 2_000_000)
            return deepFreeze({ ok: false, status: 'invalid-serialized-record', record: null,
                validation: { valid: false, errors: [diagnostic('INVALID_SERIALIZED_RECORD', 'error', '$', 'Serialized record is invalid.')], warnings: [], record: null } });
        let parsed;
        try { parsed = JSON.parse(serialized); }
        catch (_) {
            return deepFreeze({ ok: false, status: 'invalid-json', record: null,
                validation: { valid: false, errors: [diagnostic('INVALID_SERIALIZED_RECORD', 'error', '$', 'Serialized record is not valid JSON.')], warnings: [], record: null } });
        }
        const validation = validate(parsed);
        if (!validation.valid)
            return deepFreeze({ ok: false,
                status: validation.errors.some(item => item.code === 'UNSUPPORTED_SCHEMA_VERSION')
                    ? 'unsupported-schema-version' : 'invalid-record',
                record: null, validation });
        return deepFreeze({ ok: true, status: 'parsed', record: deepFreeze(parsed), validation });
    }

    const api = Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        statuses: STATUSES,
        diagnosticCodes: DIAGNOSTIC_CODES,
        buildFromPlay,
        buildFromSnapshot,
        validate,
        serialize,
        parse,
        getPgnResultToken: pgn => inspectPgn(pgn).resultToken
    });
    global.CaissaGameRecord = api;
})(window);
