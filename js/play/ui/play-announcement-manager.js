(function installPlayAnnouncementManager(global) {
    'use strict';

    const SCHEMA_VERSION = '1.0.0';
    const MAX_QUEUE = 8;
    const MESSAGES = Object.freeze({
        PLAY_READY: 'Simplified Play is ready.',
        MODE_GAMES: 'Games controls selected.',
        MODE_BOTS: 'Bots controls selected.',
        MODE_COACH: 'Coach controls selected.',
        MODE_PLAYERS: 'Players controls selected.',
        GAME_OVER: 'Game over. Post-game actions are available.',
        MENTOR_SUMMARY_READY: 'Mentor Summary is ready.',
        REPLAY_STARTED: 'Guided Replay started. Make an attempt before revealing the reference.',
        REPLAY_ATTEMPT_RECORDED: 'Replay attempt recorded.',
        REPLAY_REFERENCE_REVEALED: 'Reference move revealed.',
        EVALUATION_LOADING: 'Engine evaluation is loading.',
        EVALUATION_UNAVAILABLE: 'Engine evaluation is unavailable.',
        ACTION_UNAVAILABLE: 'This action is unavailable. Read the adjacent explanation.'
    });
    const queue = [];
    const diagnostics = { announcements: 0, deduplicated: 0, rejected: 0, regions: 0 };
    let root = null;
    let polite = null;
    let assertive = null;
    let lastId = null;
    let disposed = false;

    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    function region(live, role) {
        const node = global.document.createElement('p');
        node.className = 'caissa-play-a11y-live';
        node.setAttribute('role', role);
        node.setAttribute('aria-live', live);
        node.setAttribute('aria-atomic', 'true');
        node.dataset.caissaAnnouncementRegion = live;
        return node;
    }

    function mount(host) {
        if (disposed) return result(false, 'DISPOSED');
        if (root) return result(true, 'ALREADY_MOUNTED');
        if (!host?.appendChild) {
            diagnostics.rejected += 1;
            return result(false, 'INVALID_HOST');
        }
        root = global.document.createElement('div');
        root.className = 'caissa-play-a11y-live-regions';
        root.dataset.caissaAccessibilityLiveRegions = '';
        polite = region('polite', 'status');
        assertive = region('assertive', 'alert');
        root.append(polite, assertive);
        host.appendChild(root);
        diagnostics.regions = 2;
        return result(true, 'MOUNTED');
    }

    function announce(messageId, options = {}) {
        if (disposed || !root) return result(false, disposed ? 'DISPOSED' : 'NOT_MOUNTED');
        if (!Object.hasOwn(MESSAGES, messageId)) {
            diagnostics.rejected += 1;
            return result(false, 'UNKNOWN_ANNOUNCEMENT');
        }
        if (messageId === lastId && options.force !== true) {
            diagnostics.deduplicated += 1;
            return result(true, 'DEDUPLICATED');
        }
        const priority = options.priority === 'assertive' ? 'assertive' : 'polite';
        const target = priority === 'assertive' ? assertive : polite;
        target.textContent = MESSAGES[messageId];
        lastId = messageId;
        queue.push(messageId);
        while (queue.length > MAX_QUEUE) queue.shift();
        diagnostics.announcements += 1;
        return result(true, 'ANNOUNCED', { messageId, priority });
    }

    function clear() {
        if (polite) polite.textContent = '';
        if (assertive) assertive.textContent = '';
        lastId = null;
        queue.length = 0;
        return result(true, 'CLEARED');
    }

    function dispose() {
        if (disposed) return result(true, 'ALREADY_DISPOSED');
        clear();
        root?.remove?.();
        root = null;
        polite = null;
        assertive = null;
        diagnostics.regions = 0;
        disposed = true;
        return result(true, 'DISPOSED');
    }

    global.CaissaPlayAnnouncementManager = freeze({
        schemaVersion: SCHEMA_VERSION,
        messageIds: Object.freeze(Object.keys(MESSAGES)),
        maxQueue: MAX_QUEUE,
        mount,
        announce,
        clear,
        inspect: () => freeze({
            schemaVersion: SCHEMA_VERSION,
            disposed,
            mounted: !!root,
            liveRegionCount: diagnostics.regions,
            queueDepth: queue.length,
            lastMessageId: lastId,
            diagnostics: { ...diagnostics }
        }),
        dispose
    });
})(typeof window !== 'undefined' ? window : globalThis);
