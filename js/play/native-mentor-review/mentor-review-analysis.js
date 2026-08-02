(function installMentorReviewAnalysis(root) {
    'use strict';
    const DEADLINE_MS = 1000;
    const templates = Object.freeze({
        capture: 'Material changed on this move.',
        check: 'King safety became immediately relevant.',
        position: 'The position changed; compare the piece activity before and after this move.',
        start: 'Review begins from the initial position.'
    });
    function create(options = {}) {
        let generation = 0; let disposed = false; let requests = 0; let stale = 0; let timeouts = 0;
        const schedule = options.schedule || queueMicrotask;
        const setTimer = options.setTimer || root.setTimeout?.bind(root);
        const clearTimer = options.clearTimer || root.clearTimeout?.bind(root);
        return Object.freeze({
            analyze(input = {}) {
                const token = ++generation; requests += 1;
                return new Promise(resolve => {
                    let settled = false; let timer = null;
                    const finish = value => {
                        if (settled) return; settled = true;
                        if (timer !== null) clearTimer?.(timer);
                        resolve(Object.freeze(value));
                    };
                    if (setTimer) timer = setTimer(() => { timeouts += 1; finish({ ok: false, reasonCode: 'ANALYSIS_TIMEOUT' }); }, DEADLINE_MS);
                    schedule(() => {
                        if (disposed || token !== generation) { stale += 1; finish({ ok: false, reasonCode: 'STALE_ANALYSIS' }); return; }
                        const move = input.move || null;
                        const category = !move ? 'start' : /[+#]/.test(move.san || '') ? 'check'
                            : /[ce]/.test(move.flags || '') ? 'capture' : 'position';
                        finish({ ok: true, reasonCode: 'ANALYSIS_READY', value: Object.freeze({
                            recordId: input.recordId, ply: input.ply, category,
                            critical: category === 'capture' || category === 'check', messageKey: category.toUpperCase(),
                            message: templates[category], reviewer: 'CAISSA automated local analysis'
                        }) });
                    });
                });
            },
            cancel() { generation += 1; return true; },
            dispose() { disposed = true; generation += 1; return true; },
            inspect: () => Object.freeze({ schemaVersion: '1.0.0', requests, staleResults: stale, timeouts,
                activePlayWorkers: 0, trainingMemoryWrites: 0, masteryWrites: 0 })
        });
    }
    root.CaissaNativeMentorReviewAnalysis = Object.freeze({ schemaVersion: '1.0.0', deadlineMs: DEADLINE_MS,
        maximumCriticalMoments: 5, templates, create });
})(typeof window !== 'undefined' ? window : globalThis);
