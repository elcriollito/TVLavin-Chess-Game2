(function installNativeCoachAssistance(root) {
    'use strict';
    const policy = root.CaissaPlayV2CoachAssistancePolicy;
    const keyFor = category => ({ 'king-safety': 'KING_SAFETY', 'forcing-moves': 'FORCING_MOVES', 'vulnerable-piece': 'VULNERABLE_PIECE',
        'opponent-threat': 'OPPONENT_THREAT', 'low-time': 'LOW_TIME', 'material-change': 'MATERIAL_CHANGE' })[category];
    const rank = { low: 0, medium: 1, high: 2 }; const freeze = value => Object.freeze(value);
    function create(options = {}) {
        const now = typeof options.now === 'function' ? options.now : Date.now;
        let config = { ...root.CaissaNativeCoachConfiguration.defaults }; let generation = 1; let disposed = false; let terminal = false;
        let lastAt = -Infinity; let lastCategory = null; let messages = 0; let active = null; const turns = new Set();
        const metrics = { observedEventCount: 0, suppressed: 0, staleMessages: 0, duplicateMessages: 0, terminalMessages: 0 };
        const reject = reasonCode => { metrics.suppressed += 1; return freeze({ ok: false, reasonCode }); };
        const observe = raw => {
            const sanitized = root.CaissaNativeCoachAssistanceSanitizer.sanitize(raw);
            if (!sanitized.ok) return reject(sanitized.reasonCode); const event = sanitized.value; metrics.observedEventCount += 1;
            if (disposed || event.generation !== generation) { metrics.staleMessages += 1; return reject('STALE_ASSISTANCE'); }
            if (event.terminal || event.type === 'terminal-state') { terminal = true; active = null; return reject('TERMINAL_SUPPRESSED'); }
            if (terminal) { metrics.terminalMessages += 1; return reject('TERMINAL_SUPPRESSED'); }
            if (!event.requested || config.timing !== 'on-request') return reject('TIMING_SUPPRESSED');
            if (event.promotionPending) return reject('PROMOTION_SUPPRESSED'); if (event.opponentWorking) return reject('OPPONENT_WORK_SUPPRESSED');
            const level = policy.levels[config.level]; if (!level.permittedCategories.includes(event.category)) return reject('CATEGORY_SUPPRESSED');
            if (rank[event.confidence] < rank[level.confidenceThreshold] || (event.openingPly < 4 && event.confidence !== 'high')) return reject('CONFIDENCE_SUPPRESSED');
            if (turns.has(event.turnId)) return reject('TURN_LIMIT'); if (event.category === lastCategory) { metrics.duplicateMessages += 1; return reject('DUPLICATE_CATEGORY'); }
            if (now() - lastAt < level.cooldownMs) return reject('COOLDOWN'); if (messages >= level.maximumPerGame) return reject('GAME_LIMIT');
            const presentation = freeze({ category: event.category, severity: event.severity, confidence: event.confidence, timing: event.timing, messageKey: event.messageKey,
                message: policy.messages[event.messageKey] });
            messages += 1; turns.add(event.turnId); lastAt = now(); lastCategory = event.category; active = presentation;
            return freeze({ ok: true, reasonCode: 'ASSISTANCE_PRESENTED', presentation });
        };
        return freeze({ observe, configure(value) { if (!root.CaissaNativeCoachConfiguration.validate(value).valid) return false; config = { ...value }; return true; },
            requestHelp(context = {}) { const category = config.focus === 'time-awareness' && !context.lowTime ? 'opponent-threat' : policy.focuses[config.focus];
                return observe({ eventId: context.eventId, generation, turnId: context.turnId, type: 'user-turn', category, severity: context.lowTime ? 'high' : 'medium',
                    confidence: 'high', timing: 'on-request', messageKey: keyFor(category), requested: true, promotionPending: context.promotionPending,
                    opponentWorking: context.opponentWorking, terminal: context.terminal, openingPly: context.openingPly, lowTime: context.lowTime }); },
            dismiss() { active = null; return true; }, teardown() { generation += 1; terminal = false; active = null; turns.clear(); lastCategory = null; return generation; },
            inspect: () => freeze({ schemaVersion: '1.0.0', generation, messages, active, moveCommits: 0, bestMovePvDisclosures: 0, hiddenAnswers: 0,
                staleMessages: metrics.staleMessages, duplicateMessages: metrics.duplicateMessages, terminalMessages: metrics.terminalMessages,
                trainingMemoryWrites: 0, masteryWrites: 0, observedEventCount: metrics.observedEventCount, suppressed: metrics.suppressed }),
            dispose() { disposed = true; active = null; generation += 1; return true; } });
    }
    root.CaissaNativeCoachAssistance = freeze({ schemaVersion: '1.0.0', observableEvents: policy.observableEvents, create });
})(typeof window !== 'undefined' ? window : globalThis);
