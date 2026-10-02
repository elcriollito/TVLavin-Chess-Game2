// Read-only presentation and one explicitly started engine lifecycle.
export function moveRows(lesson) {
    const rows = [];
    lesson.moves.forEach((move, index) => {
        const fields = lesson.positions[index].split(/\s+/);
        const number = Number(fields[5]), color = fields[1];
        let row = rows.at(-1);
        if (!row || row.number !== number) { row = { number, white: null, black: null }; rows.push(row); }
        row[color === 'w' ? 'white' : 'black'] = index;
    });
    return rows;
}

export function evaluationLabel(info) {
    if (info.mate !== null) return `${info.mate < 0 || Object.is(info.mate, -0) ? '−' : '+'}M${Math.abs(info.mate)} · depth ${info.depth}`;
    return `${info.score >= 0 ? '+' : ''}${info.score.toFixed(2)} · depth ${info.depth}`;
}

export function createStudyAnalysis(factory, { timeoutMs = 15000 } = {}) {
    let generation = 0, current = null, abortSearch = null;

    function cancel() {
        generation++;
        const abort = abortSearch; abortSearch = null; abort?.();
        current?.terminate('mentor-study-cancel'); current = null;
    }

    async function run(positions, depth, onPosition) {
        cancel();
        const token = generation;
        let engine = null;
        try {
            engine = factory(); current = engine;
            if (!engine) throw new Error('Engine unavailable.');
            await engine.start();
            for (let index = 0; index < positions.length && token === generation; index++) {
                const info = await new Promise((resolve, reject) => {
                    let latest = null, settled = false;
                    const finish = (error, result) => {
                        if (settled) return;
                        settled = true; clearTimeout(timer);
                        abortSearch = null; engine.onInfo = null; engine.onError = null;
                        error ? reject(error) : resolve(result);
                    };
                    const timer = setTimeout(() => finish(new Error('This position exceeded the analysis time limit.')), timeoutMs);
                    abortSearch = () => finish(new Error('Analysis cancelled.'));
                    const acceptInfo = value => {
                        // EngineAdapter normalises cp and mate to White's perspective.
                        if (value.multipv !== 1 || /\b(?:lowerbound|upperbound)\b/.test(value.rawLine || '')) return;
                        if (Number.isFinite(value.score) || Number.isFinite(value.mate)) latest = value;
                    };
                    engine.onError = error => finish(error instanceof Error ? error : new Error(String(error)));
                    const onBestMove = bestMove => {
                        const terminal = bestMove === null || bestMove === '0000' || bestMove === '(none)';
                        if (!latest || (!terminal && latest.depth < depth)) finish(new Error('No evaluation reached the selected depth.'));
                        else {
                            // UCI represents a completed mate as "mate 0" without a reliable sign.
                            // At a terminal mate, the side to move has lost; restore White perspective from FEN.
                            const sideToMove = positions[index].split(/\s+/)[1];
                            const mate = terminal && latest.mate === 0
                                ? (sideToMove === 'w' ? -0 : 0)
                                : latest.mate ?? null;
                            finish(null, { score: latest.score, mate, depth: latest.depth });
                        }
                    };
                    if (typeof engine.getBestMoveAttributed === 'function') {
                        engine.getBestMoveAttributed(positions[index], onBestMove, { depth, onInfo: acceptInfo });
                    } else {
                        engine.onInfo = acceptInfo;
                        engine.getBestMove(positions[index], onBestMove, { depth });
                    }
                });
                if (token === generation) onPosition(info, index);
            }
        } finally {
            // An older completion must never tear down a newer run.
            if (current === engine) { current = null; engine?.terminate('mentor-study-complete'); }
        }
    }

    return Object.freeze({ run, cancel, isIdle: () => current === null });
}
