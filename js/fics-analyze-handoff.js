(function installFicsAnalyzeHandoff(root) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    if (root.CaissaFICSAnalyzeHandoff?.schemaVersion === SCHEMA_VERSION) return;

    const result = (ok, status, reasonCode = null, value = null) =>
        Object.freeze({ ok, status, reasonCode, value });

    function prepare(snapshot = root.CaissaFICSPresentation?.getSnapshot?.(), client = root.CaissaFICSClient) {
        if (!snapshot?.game?.ended || snapshot.capabilities?.analyze !== true) {
            return result(false, 'unavailable', 'FICS_GAME_NOT_ANALYZABLE');
        }
        if (typeof client?.buildPGN !== 'function') return result(false, 'unavailable', 'PGN_UNAVAILABLE');
        const handoff = root.CaissaAnalyzeHandoff;
        if (typeof handoff?.createTransport !== 'function') {
            return result(false, 'unavailable', 'ANALYZE_HANDOFF_UNAVAILABLE');
        }

        let pgn;
        try { pgn = client.buildPGN(); }
        catch (_) { return result(false, 'invalid', 'PGN_BUILD_FAILED'); }
        if (typeof pgn !== 'string' || !pgn.trim()) return result(false, 'invalid', 'PGN_UNAVAILABLE');

        const partial = snapshot.game.pgn?.mayBePartial === true;
        const transport = handoff.createTransport();
        const created = transport.create({
            intent: 'analyze-game',
            source: 'fics',
            payload: {
                recordId: snapshot.game.gameNumber === null ? null : `fics-game:${snapshot.game.gameNumber}`,
                initialFen: snapshot.game.replay?.initialFen || null,
                finalFen: snapshot.game.currentFen || null,
                pgn,
                selectedPly: snapshot.game.replay?.latestPly ?? snapshot.game.moves.length,
                playerColor: snapshot.game.myColor || null,
                boardOrientation: snapshot.game.orientation || null,
                result: snapshot.game.result?.result || null,
                termination: snapshot.game.result?.terminationReason || null,
                whiteLabel: snapshot.game.identities?.white?.name || null,
                blackLabel: snapshot.game.identities?.black?.name || null,
                recordStatus: partial ? 'partial' : 'complete',
                mode: partial ? 'fics-observed' : 'fics-played'
            },
            provenance: {
                sourceSection: 'fics',
                compatibilitySchemaVersion: snapshot.schemaVersion,
                lifecycleSessionId: null,
                clockSessionId: null
            }
        });
        if (!created.ok) return created;
        const stored = transport.store(created.value);
        return stored.ok ? result(true, 'ready', null, created.value) : stored;
    }

    root.CaissaFICSAnalyzeHandoff = Object.freeze({ schemaVersion: SCHEMA_VERSION, prepare });
})(window);
