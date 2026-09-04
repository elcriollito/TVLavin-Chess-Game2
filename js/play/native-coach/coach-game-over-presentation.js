(function installCoachGameOverPresentation(root) {
    'use strict';

    const SCHEMA_VERSION = '1.1.0';
    const OWNER = 'post-game-core';
    const CATEGORY_ORDER = Object.freeze(['blunder', 'mistake', 'inaccuracy', 'best', 'precise', 'good', 'book']);
    const CATEGORY_LABELS = Object.freeze({
        book: 'Book', best: 'Best', precise: 'Precise', good: 'Good',
        inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder'
    });
    let mounted = null;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const result = (ok, reasonCode, value = null) => freeze({ ok, reasonCode, value });
    const element = (tag, className, attributes = {}) => {
        const node = root.document.createElement(tag); node.className = className;
        Object.entries(attributes).forEach(([name, value]) => node.setAttribute(name, value)); return node;
    };

    function summarize(annotations) {
        const counts = new Map();
        if (Array.isArray(annotations)) annotations.forEach(annotation => {
            const key = annotation?.key;
            if (Object.hasOwn(CATEGORY_LABELS, key)) counts.set(key, (counts.get(key) || 0) + 1);
        });
        return freeze(CATEGORY_ORDER.filter(key => counts.has(key)).slice(0, 3)
            .map(key => ({ key, label: CATEGORY_LABELS[key], count: counts.get(key) })));
    }

    function titleFor(record, description) {
        if (description?.title !== 'You Lost') return description?.title || 'Game Over';
        const player = record?.player?.color; const winner = record?.result?.winner;
        return ['white', 'black'].includes(player) && ['white', 'black'].includes(winner) && player !== winner
            ? 'Coach Won' : description.title;
    }

    function messageFor(title, categories) {
        const count = key => categories.find(item => item.key === key)?.count || 0;
        const strong = count('best') + count('precise') + count('good');
        const corrections = count('inaccuracy') + count('mistake') + count('blunder');
        if (title === 'You Won' && strong >= 2)
            return "You found several strong moves. Let's review the key moments.";
        if (title === 'You Won') return "Well played. Let's revisit the moments that shaped the game.";
        if (title === 'Draw') return "A balanced result with useful moments to revisit. Let's review it together.";
        if (corrections > 0) return "This game gives us useful moments to review. Let's take a look together.";
        return "There are useful moments in this game. Let's take a look together.";
    }

    function createModel(input = {}) {
        const record = input.record; const description = input.description;
        if (input.owner !== OWNER || input.sourceMode !== 'coach' || record?.result?.complete !== true)
            return result(false, 'INVALID_COACH_GAME_OVER_CONTEXT');
        const categories = summarize(input.annotations);
        const title = titleFor(record, description);
        return result(true, 'COACH_GAME_OVER_MODEL_CREATED', {
            schemaVersion: SCHEMA_VERSION, title, reason: description?.reason || 'Reason Unavailable',
            message: messageFor(title, categories), categories
        });
    }

    function render(input) {
        const modelResult = createModel(input); if (!modelResult.ok) return modelResult;
        const model = modelResult.value; const state = mounted;
        state.title.textContent = model.title;
        state.reason.textContent = model.reason;
        state.preview.replaceChildren();
        model.categories.forEach(category => {
            const item = element('div', 'caissa-coach-game-over__quality');
            const term = element('dt', 'caissa-coach-game-over__quality-label'); term.textContent = category.label;
            const value = element('dd', 'caissa-coach-game-over__quality-count'); value.textContent = String(category.count);
            item.append(term, value); state.preview.appendChild(item);
        });
        state.preview.hidden = model.categories.length === 0;
        state.model = model;
        root.CaissaNativeCoachPanel?.present?.({ phase: 'game-over', content: state.section, message: model.message });
        return result(true, 'COACH_GAME_OVER_RENDERED', getSnapshot());
    }

    function mount(input = {}) {
        const section = input.section; const model = createModel(input);
        if (!model.ok || !section?.querySelector || !section?.classList) return model;
        if (mounted && mounted.section !== section) return result(false, 'ANOTHER_COACH_GAME_OVER_MOUNTED');
        if (!mounted) {
            const title = section.querySelector('[data-post-game-result]');
            const reason = section.querySelector('[data-post-game-reason]');
            const summary = section.querySelector('[data-post-game-summary]');
            const actions = [...section.querySelectorAll('[data-post-game-action]')];
            if (!title || !reason || !summary || !actions.length) return result(false, 'INVALID_POST_GAME_HOST');
            const eyebrow = element('p', 'caissa-coach-game-over__eyebrow'); eyebrow.textContent = 'GAME RESULT';
            const preview = element('dl', 'caissa-coach-game-over__qualities', {
                'data-coach-game-over-qualities': '', 'aria-label': 'Move quality preview'
            });
            section.insertBefore(eyebrow, title); section.insertBefore(preview, summary);
            const actionStates = actions.map(node => ({ node, hidden: node.hidden, text: node.textContent }));
            actions.forEach(node => {
                const action = node.dataset.postGameAction;
                node.hidden = !['analyze', 'new-game'].includes(action);
                if (action === 'analyze') node.textContent = 'Review Game';
            });
            const concealed = [summary, section.querySelector('.caissa-post-game__consent'),
                section.querySelector('[data-post-game-feedback]')].filter(Boolean)
                .map(node => ({ node, hidden: node.hidden }));
            concealed.forEach(item => { item.node.hidden = true; });
            section.classList.add('caissa-coach-game-over-context');
            section.dataset.caissaGameOverContext = 'coach';
            root.document.body?.classList?.add('caissa-coach-game-over-active');
            mounted = { section, title, reason, eyebrow, preview, actionStates, concealed, model: null };
        }
        return render(input);
    }

    function unmount(input = {}) {
        if (!mounted) return result(true, 'ALREADY_UNMOUNTED');
        if (input.section && input.section !== mounted.section) return result(false, 'POST_GAME_HOST_MISMATCH');
        mounted.actionStates.forEach(item => { item.node.hidden = item.hidden; item.node.textContent = item.text; });
        mounted.concealed.forEach(item => { item.node.hidden = item.hidden; });
        mounted.eyebrow.remove(); mounted.preview.remove();
        mounted.section.classList.remove('caissa-coach-game-over-context');
        delete mounted.section.dataset.caissaGameOverContext;
        root.document.body?.classList?.remove('caissa-coach-game-over-active');
        mounted = null;
        return result(true, 'COACH_GAME_OVER_UNMOUNTED');
    }

    function getSnapshot() {
        return freeze({ schemaVersion: SCHEMA_VERSION, mounted: !!mounted, owner: mounted ? OWNER : null,
            sourceMode: mounted ? 'coach' : null, categoryCount: mounted?.model?.categories?.length || 0,
            categories: mounted?.model?.categories || [] });
    }

    root.CaissaCoachGameOverPresentation = freeze({
        schemaVersion: SCHEMA_VERSION, owner: OWNER, supportedCategories: CATEGORY_ORDER,
        createModel, mount, unmount, getSnapshot
    });
})(typeof window !== 'undefined' ? window : globalThis);
