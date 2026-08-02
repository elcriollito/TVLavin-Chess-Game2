(function installNativeCoachAssistance(root) {
    'use strict';
    const allowed = root.CaissaPlayV2CoachBoundary?.observableEvents || Object.freeze([]);
    const freeze = value => Object.freeze(value);
    function create() {
        let count = 0; let lastEvent = null; let disposed = false;
        return freeze({
            observe(event = {}) {
                if (disposed || !allowed.includes(event.type)) return freeze({ ok: false, reasonCode: 'EVENT_PROHIBITED' });
                count += 1; lastEvent = event.type;
                return freeze({ ok: true, reasonCode: 'EVENT_OBSERVED', message: 'Bounded assistance is available.' });
            },
            inspect: () => freeze({ schemaVersion: '1.0.0', observedEventCount: count, lastEvent,
                moveCommits: 0, hiddenAnswers: 0, trainingMemoryWrites: 0, masteryWrites: 0 }),
            dispose() { disposed = true; lastEvent = null; return true; }
        });
    }
    root.CaissaNativeCoachAssistance = freeze({ schemaVersion: '1.0.0', observableEvents: allowed, create });
})(typeof window !== 'undefined' ? window : globalThis);
