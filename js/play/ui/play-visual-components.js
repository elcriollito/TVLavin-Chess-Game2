(function installPlayVisualComponents(global) {
    'use strict';
    const VERSION = '1.2.0';
    const VARIANTS = Object.freeze(['standard', 'compact', 'mobile-scroll', 'caissa-rail']);
    const STATES = Object.freeze(['default', 'selected', 'disabled', 'loading', 'empty', 'locked', 'coming-later', 'unavailable']);
    const TONES = Object.freeze(['neutral', 'info', 'positive', 'warning', 'danger']);
    const DENSITIES = Object.freeze(['compact', 'standard', 'large']);
    const ACTIONS = new Set(['select-mode', 'select-profile', 'select-time-control', 'toggle-options',
        'primary', 'secondary', 'rematch', 'analyze', 'mentor', 'dismiss']);
    const instances = new WeakMap();
    const diagnostics = { created: 0, updated: 0, disposed: 0, actionsEmitted: 0,
        rejected: 0, listeners: 0, nodes: 0, lastComponent: null };
    let sequence = 0;
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze); Object.freeze(value);
        }
        return value;
    };
    const text = (value, max = 120) => typeof value === 'string' && value.trim()
        && value.trim().length <= max && !/[\u0000-\u001f<>]/.test(value) ? value.trim() : null;
    const variant = value => VARIANTS.includes(value) ? value : 'standard';
    const state = value => STATES.includes(value) ? value : 'default';
    const tone = value => TONES.includes(value) ? value : 'neutral';
    const density = value => DENSITIES.includes(value) ? value : 'standard';
    function element(tag, classes, attrs = {}) {
        const node = global.document.createElement(tag);
        node.className = classes;
        for (const [key, value] of Object.entries(attrs)) if (value != null) node.setAttribute(key, String(value));
        diagnostics.nodes += 1; return node;
    }
    function emit(node, actionId, sourceComponent, sourceId) {
        if (!ACTIONS.has(actionId)) return false;
        node.dispatchEvent(new global.CustomEvent('caissa:play-ui-action', {
            bubbles: true, detail: freeze({ actionId, sourceComponent, sourceId })
        }));
        diagnostics.actionsEmitted += 1; return true;
    }
    function register(root, component, listeners = []) {
        instances.set(root, { component, listeners });
        diagnostics.created += 1; diagnostics.listeners += listeners.length;
        diagnostics.lastComponent = component; return root;
    }
    function createModeTabs(vm = {}) {
        const root = element('nav', `caissa-vc caissa-vc-tabs caissa-vc--${variant(vm.variant)}`, {
            'aria-label': text(vm.ariaLabel, 80) || 'Play modes',
            'data-visual-component': 'mode-tabs', 'data-caissa-expression': 'inscribed-mode-rail'
        });
        const list = element('div', 'caissa-vc-tabs__list', { role: 'tablist' });
        root.appendChild(list);
        const items = Array.isArray(vm.items) ? vm.items.slice(0, 8) : [];
        for (const item of items) {
            const id = text(item?.id, 40), label = text(item?.label, 60);
            if (!id || !label) continue;
            const button = element('button', 'caissa-vc-tab', {
                type: 'button', role: 'tab', 'data-visual-id': id,
                'data-shell-mode': item.shellMode || null,
                'aria-selected': String(item.active === true),
                'aria-disabled': String(item.disabled === true)
            });
            button.textContent = label; button.disabled = item.disabled === true;
            button.tabIndex = item.active === true ? 0 : -1; list.appendChild(button);
        }
        const click = event => {
            const button = event.target.closest('[role="tab"]');
            if (button && !button.disabled) emit(button, 'select-mode', 'mode-tabs', button.dataset.visualId);
        };
        const keydown = event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const tabs = [...root.querySelectorAll('[role="tab"]:not(:disabled)')], current = tabs.indexOf(event.target);
            if (current < 0) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].focus();
            tabs[next].click();
        };
        root.addEventListener('click', click); root.addEventListener('keydown', keydown);
        return register(root, 'mode-tabs', [[root, 'click', click], [root, 'keydown', keydown]]);
    }
    function createRatingBadge(vm = {}) {
        const value = Number.isFinite(vm.value) ? String(Math.round(vm.value))
            : text(vm.range, 30) || (vm.unrated ? 'Unrated' : 'Rating unknown');
        const node = element('span', `caissa-vc caissa-vc-badge caissa-vc-badge--${tone(vm.tone)}`, {
            'data-visual-component': 'rating-badge', 'data-caissa-expression': 'rating-ledger'
        });
        node.textContent = `${vm.approximate ? '≈' : ''}${value}${vm.provisional ? ' provisional' : ''}`
            + (text(vm.provider, 30) ? ` · ${vm.provider}` : '');
        return register(node, 'rating-badge');
    }
    function createCountryFlag(vm = {}) {
        const code = text(vm.code, 3)?.toUpperCase();
        const node = element('span', 'caissa-vc caissa-vc-country', {
            'data-visual-component': 'country-flag',
            'aria-label': text(vm.label, 60) || (code ? `Country ${code}` : 'Country unavailable')
        });
        node.textContent = code || '—'; return register(node, 'country-flag');
    }
    function createProfileCard(vm = {}) {
        const id = text(vm.id, 50) || `profile-${++sequence}`;
        const root = element('article', `caissa-vc caissa-vc-card caissa-vc-card--${density(vm.density)}`, {
            'data-visual-component': 'profile-card', 'data-state': state(vm.state),
            'aria-labelledby': `${id}-title`, 'data-caissa-expression': 'identity-first-profile'
        });
        const title = element('h3', 'caissa-vc-card__title', { id: `${id}-title` });
        title.textContent = text(vm.name, 80) || 'Profile';
        const description = element('p', 'caissa-vc-card__description');
        description.textContent = text(vm.description, 240) || '';
        root.append(title, description);
        if (vm.rating) root.appendChild(createRatingBadge(vm.rating));
        if (vm.country) root.appendChild(createCountryFlag(vm.country));
        if (vm.locked) root.setAttribute('aria-disabled', 'true');
        return register(root, 'profile-card');
    }
    function createTimeControlSelector(vm = {}) {
        const root = element('fieldset', 'caissa-vc caissa-vc-time-controls', {
            'data-visual-component': 'time-control-selector', 'data-caissa-expression': 'score-sheet-controls'
        });
        const legend = element('legend', 'caissa-vc__legend'); legend.textContent = text(vm.label, 60) || 'Time control';
        root.appendChild(legend);
        for (const item of (Array.isArray(vm.items) ? vm.items.slice(0, 12) : [])) {
            const id = text(item.id, 40), labelText = text(item.label, 60); if (!id || !labelText) continue;
            const label = element('label', 'caissa-vc-choice');
            const input = element('input', '', { type: 'radio', name: text(vm.name, 40) || 'time-control',
                value: id, 'data-visual-id': id });
            input.checked = item.selected === true; input.disabled = item.disabled === true;
            label.append(input, global.document.createTextNode(labelText)); root.appendChild(label);
        }
        const change = event => {
            if (event.target.matches('input[type="radio"]'))
                emit(event.target, 'select-time-control', 'time-control-selector', event.target.value);
        };
        root.addEventListener('change', change);
        return register(root, 'time-control-selector', [[root, 'change', change]]);
    }
    function createCollapsibleOptions(vm = {}) {
        const root = element('details', 'caissa-vc caissa-vc-disclosure', {
            'data-visual-component': 'collapsible-options'
        });
        root.open = vm.open === true;
        const summary = element('summary', 'caissa-vc-disclosure__summary');
        summary.setAttribute('aria-expanded', String(root.open));
        summary.textContent = text(vm.label, 80) || 'More options';
        const body = element('div', 'caissa-vc-disclosure__body'); body.textContent = text(vm.description, 240) || '';
        root.append(summary, body);
        const toggle = () => {
            summary.setAttribute('aria-expanded', String(root.open));
            emit(root, 'toggle-options', 'collapsible-options', text(vm.id, 40) || 'options');
        };
        root.addEventListener('toggle', toggle);
        return register(root, 'collapsible-options', [[root, 'toggle', toggle]]);
    }
    function createCtaFooter(vm = {}) {
        const root = element('footer', 'caissa-vc caissa-vc-cta', {
            'data-visual-component': 'cta-footer', 'data-caissa-expression': 'separated-primary-command',
            'aria-label': text(vm.ariaLabel, 80) || 'Actions'
        });
        const listeners = [];
        const actions = Array.isArray(vm.actions) ? vm.actions.slice(0, 5) : [];
        actions.forEach((item, index) => {
            const actionId = ACTIONS.has(item.actionId) ? item.actionId : index === 0 ? 'primary' : 'secondary';
            const button = element('button', `caissa-vc-button ${index === 0 ? 'caissa-vc-button--primary' : ''}`, {
                type: 'button', 'data-action-id': actionId
            });
            button.textContent = text(item.label, 60) || 'Action'; button.disabled = item.disabled === true;
            const reason = text(item.reason, 120);
            if (reason) button.setAttribute('aria-label', `${button.textContent}. ${reason}`);
            const click = () => emit(button, actionId, 'cta-footer', text(item.id, 40) || actionId);
            button.addEventListener('click', click);
            listeners.push([button, 'click', click]); root.appendChild(button);
        });
        return register(root, 'cta-footer', listeners);
    }
    function createGameOverCard(vm = {}) {
        const root = element('section', 'caissa-vc caissa-vc-game-over', {
            'data-visual-component': 'game-over-card', 'data-caissa-expression': 'learning-continuation',
            'aria-label': 'Game over'
        });
        const heading = element('h2', 'caissa-vc-card__title'); heading.textContent = text(vm.title, 80) || 'Game over';
        const result = element('p', 'caissa-vc-game-over__result'); result.textContent = text(vm.result, 120) || 'Result unavailable';
        root.append(heading, result, createCtaFooter({ actions: vm.actions || [] }));
        return register(root, 'game-over-card');
    }
    function stateComponent(component, vm, defaultTitle) {
        const root = element('section', `caissa-vc caissa-vc-state caissa-vc-state--${state(vm.state)}`, {
            'data-visual-component': component,
            'data-caissa-expression': component === 'locked-state' ? 'notched-readiness'
                : component === 'loading-skeleton' ? 'ledger-wash' : 'open-file-state'
        });
        const title = element('h3', 'caissa-vc-state__title'); title.textContent = text(vm.title, 80) || defaultTitle;
        const message = element('p', 'caissa-vc-state__message'); message.textContent = text(vm.message, 240) || '';
        root.append(title, message); return register(root, component);
    }
    const createLoadingSkeleton = vm => stateComponent('loading-skeleton', { ...vm, state: 'loading' }, 'Loading');
    const createEmptyState = vm => stateComponent('empty-state', { ...vm, state: vm?.state || 'empty' }, 'Nothing here yet');
    const createLockedState = vm => stateComponent('locked-state', { ...vm, state: 'locked' }, 'Locked');
    function update(root, vm = {}) {
        if (!instances.has(root)) return freeze({ ok: false, reasonCode: 'UNKNOWN_COMPONENT' });
        const message = root.querySelector?.('.caissa-vc-state__message');
        if (message && text(vm.message, 240)) message.textContent = text(vm.message, 240);
        diagnostics.updated += 1; return freeze({ ok: true, reasonCode: 'UPDATED' });
    }
    function dispose(root) {
        const record = instances.get(root); if (!record) return freeze({ ok: true, reasonCode: 'ALREADY_DISPOSED' });
        for (const [target, type, handler] of record.listeners) target.removeEventListener(type, handler);
        diagnostics.listeners -= record.listeners.length; instances.delete(root); root.remove();
        diagnostics.disposed += 1; return freeze({ ok: true, reasonCode: 'DISPOSED' });
    }
    global.CaissaPlayVisualComponents = freeze({
        schemaVersion: VERSION, componentSchemaVersion: VERSION, variants: VARIANTS,
        states: STATES, tones: TONES, densities: DENSITIES,
        createModeTabs, createProfileCard, createRatingBadge, createCountryFlag,
        createTimeControlSelector, createCollapsibleOptions, createCtaFooter,
        createGameOverCard, createLoadingSkeleton, createEmptyState, createLockedState,
        update, dispose, inspect: () => freeze({ ...diagnostics })
    });
})(typeof window !== 'undefined' ? window : globalThis);
