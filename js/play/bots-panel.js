(function installBotsPanel(global) {
    'use strict';

    const SCHEMA_VERSION = '2.7.0';
    const STATUSES = Object.freeze(['ready', 'planned', 'busy', 'active', 'error', 'unavailable', 'disposed']);
    const TIME_CONTROLS = Object.freeze([
        Object.freeze({ value: 0, label: 'No Timer' }),
        Object.freeze({ value: 60, label: '1+0' }),
        Object.freeze({ value: 180, label: '3+0' }),
        Object.freeze({ value: 300, label: '5+0' }),
        Object.freeze({ value: 600, label: '10+0' })
    ]);
    const COLORS = Object.freeze([
        Object.freeze({ value: 'white', label: 'White', symbol: '♚' }),
        Object.freeze({ value: 'random', label: 'Random', symbol: '?' }),
        Object.freeze({ value: 'black', label: 'Black', symbol: '♚' })
    ]);
    const PIECE_FILES = Object.freeze({ pawn: 'P', bishop: 'B', knight: 'N', rook: 'R', queen: 'Q', king: 'K' });
    let sequence = 0;

    function deepFreeze(value, seen = new WeakSet()) {
        if (!value || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value); Object.values(value).forEach(item => deepFreeze(item, seen));
        return Object.freeze(value);
    }
    function result(ok, status, reasonCode, value = null) {
        return deepFreeze({ ok, status, reasonCode, value });
    }
    function element(tag, className, attrs = {}) {
        const node = global.document.createElement(tag); node.className = className;
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        return node;
    }
    function piecePortrait(category, className) {
        const frame = element('span', className, { 'aria-hidden': 'true' });
        const image = element('img', '', {
            src: `/img/chesspieces/wikipedia/b${PIECE_FILES[category?.piece] || 'P'}.png`, alt: '', loading: 'lazy'
        });
        frame.appendChild(image); return frame;
    }

    class BotsPanel {
        #id = `bots-panel-${++sequence}`; #root = null; #host = null; #disposed = false;
        #selectedId = null; #selectedCategoryId = null; #status = 'ready'; #timeControl = 0; #color = 'white'; #listeners = [];
        #bodyHost = null; #footHost = null; #setupContent = null; #setupFoot = null; #phase = 'setup';
        #postGamePlacement = null;
        #compatibility; #resolveRandomColor; #diagnostics = { selections: 0, starts: 0, rejected: 0 };

        constructor(options = {}) {
            this.#compatibility = options.compatibility || global.CaissaPlayCompatibility;
            this.#resolveRandomColor = typeof options.resolveRandomColor === 'function'
                ? options.resolveRandomColor : () => {
                    const bytes = new Uint8Array(1);
                    if (typeof global.crypto?.getRandomValues !== 'function') return null;
                    global.crypto.getRandomValues(bytes);
                    return bytes[0] % 2 === 0 ? 'white' : 'black';
                };
        }

        mount(options = {}) {
            const host = options.host || options;
            const active = global.CaissaBotCollectionRegistry?.listActive?.() || [];
            const first = active.flatMap(item => item.collection.bots.map(bot => ({ collection: item.collection, bot })))
                .find(item => item.bot.availability === 'qa-only');
            if (this.#disposed || !host?.appendChild || !first)
                return result(false, 'rejected', 'INVALID_HOST');
            this.#host = host;
            this.#selectedId = first.collection.id === 'classic' ? first.bot.id : `${first.collection.id}:${first.bot.id}`;
            this.#selectedCategoryId = first.bot.categoryId;
            this.#root = element('section', 'caissa-bots-panel', {
                'data-caissa-bots-panel': '', 'data-caissa-bots-shell': '',
                'data-bot-shell-phase': 'setup', 'aria-label': 'Play Bots'
            });

            const selected = element('div', 'caissa-bots-panel__selected', { 'data-bot-selected': '' });
            const head = element('header', 'caissa-bots-panel__head', { 'data-caissa-bots-head': '' });
            head.appendChild(selected);
            const body = this.#bodyHost = element('div', 'caissa-bots-panel__body', { 'data-caissa-bots-body': '' });
            const setupContent = this.#setupContent = element('div', 'caissa-bots-panel__setup', {
                'data-bots-phase-content': 'setup'
            });
            const categoryNav = element('div', 'caissa-bots-panel__category-nav', {
                role: 'tablist', 'aria-label': 'Bot strength categories', 'data-bot-category-nav': ''
            });
            for (const category of global.CaissaBotCollections.categories) {
                const tab = element('button', 'caissa-bots-panel__category-tab', {
                    type: 'button', role: 'tab', 'data-bot-category-tab': category.id,
                    'aria-selected': 'false', tabindex: '-1'
                });
                const symbol = element('span', 'caissa-bots-panel__category-tab-piece', { 'aria-hidden': 'true' });
                symbol.textContent = category.symbol;
                const copy = element('span', 'caissa-bots-panel__category-tab-copy');
                const label = element('strong', ''); label.textContent = category.label;
                const range = element('small', '');
                range.textContent = category.min === null ? 'Special styles'
                    : `${category.min}${category.max === null ? '+' : `–${category.max}`}`;
                copy.append(label, range); tab.append(symbol, copy); categoryNav.appendChild(tab);
            }
            const catalog = element('div', 'caissa-bots-panel__catalog', {
                role: 'radiogroup', 'aria-label': 'Choose a CAISSA bot'
            });
            for (const item of active) {
                const collectionGroup = element('section', 'caissa-bots-panel__collection-group', {
                    'data-bot-collection': item.collection.id
                });
                if (active.length > 1) {
                    const collectionTitle = element('h3', 'caissa-bots-panel__collection-title');
                    collectionTitle.textContent = item.collection.title; collectionGroup.appendChild(collectionTitle);
                }
                for (const category of global.CaissaBotCollections.categories) {
                    const bots = item.collection.bots.filter(bot => bot.categoryId === category.id);
                    if (!bots.length && item.collection.id !== 'classic') continue;
                    const groupId = `${this.#id}-${item.collection.id}-${category.id}`;
                    const group = element('section', 'caissa-bots-panel__category', {
                        'data-bot-category': `${item.collection.id}:${category.id}`, 'aria-labelledby': groupId
                    });
                    const heading = element(active.length > 1 ? 'h4' : 'h3', 'caissa-bots-panel__category-title', { id: groupId });
                    const headingPiece = element('span', 'caissa-bots-panel__category-piece', { 'aria-hidden': 'true' });
                    headingPiece.textContent = category.symbol;
                    const headingText = element('span', ''); headingText.textContent = category.label;
                    heading.append(headingPiece, headingText); group.appendChild(heading);
                    if (!bots.length) {
                        const empty = element('p', 'caissa-bots-panel__category-empty');
                        empty.textContent = 'Historical styles coming later.'; group.appendChild(empty);
                    } else {
                        const grid = element('div', 'caissa-bots-panel__bot-grid');
                        bots.forEach(bot => grid.appendChild(this.#botChoice(bot, category, item.collection)));
                        group.appendChild(grid);
                    }
                    collectionGroup.appendChild(group);
                }
                catalog.appendChild(collectionGroup);
            }

            const controls = element('div', 'caissa-bots-panel__controls');
            const time = element('label', 'caissa-bots-panel__time', {
                'data-visual-component': 'time-control-selector'
            });
            const timeLabel = element('span', 'caissa-bots-panel__control-label'); timeLabel.textContent = '◷ Time Control';
            const timeSelect = element('select', '', { 'data-bot-time': '', 'aria-label': 'Time control' });
            TIME_CONTROLS.forEach(item => {
                const option = element('option', '', { value: String(item.value) }); option.textContent = item.label;
                timeSelect.appendChild(option);
            });
            time.append(timeLabel, timeSelect);

            const color = element('fieldset', 'caissa-bots-panel__color');
            const colorLegend = element('legend', 'caissa-bots-panel__control-label'); colorLegend.textContent = 'Play As';
            const colorOptions = element('div', 'caissa-bots-panel__color-options');
            COLORS.forEach(item => {
                const label = element('label', 'caissa-bots-panel__color-choice');
                const input = element('input', '', {
                    type: 'radio', name: `${this.#id}-color`, value: item.value,
                    'data-bot-color': item.value, 'aria-label': item.label
                });
                const symbol = element('span', `caissa-color-token caissa-color-token--${item.value}`, {
                    'aria-hidden': 'true', 'data-color-token': item.value
                }); symbol.textContent = item.symbol;
                label.append(input, symbol); colorOptions.appendChild(label);
            });
            color.append(colorLegend, colorOptions); controls.append(time, color);

            const status = element('div', 'caissa-bots-panel__status', {
                'data-bot-status': '', id: `${this.#id}-status`
            });
            const action = element('button', 'caissa-bots-panel__primary', {
                type: 'button', 'data-bot-primary': '', 'aria-describedby': `${this.#id}-status`
            });
            action.textContent = 'Play';
            const retry = element('button', 'caissa-bots-panel__retry', {
                type: 'button', 'data-bot-retry': '', 'aria-describedby': `${this.#id}-status`
            });
            retry.textContent = 'Retry'; retry.hidden = true;
            setupContent.append(categoryNav, catalog, controls);
            body.appendChild(setupContent);
            const foot = this.#footHost = element('footer', 'caissa-bots-panel__foot', {
                'data-caissa-bots-foot': '', 'aria-label': 'Bot phase actions'
            });
            const setupFoot = this.#setupFoot = element('div', 'caissa-bots-panel__foot-content', {
                'data-bots-foot-content': 'setup'
            });
            setupFoot.append(status, action, retry); foot.appendChild(setupFoot);
            this.#root.append(head, body, foot); host.appendChild(this.#root);
            this.#listen(this.#root, 'change', event => this.#change(event));
            this.#listen(this.#root, 'click', event => {
                const postGameAction = event.target?.closest?.('[data-post-game-action]');
                if (this.#phase === 'game-over' && postGameAction && this.#footHost.contains(postGameAction)) {
                    event.preventDefault();
                    global.CaissaPostGameExperienceInstance?.execute?.(postGameAction.dataset.postGameAction);
                    return;
                }
                const tab = event.target?.closest?.('[data-bot-category-tab]');
                if (tab) this.#activateCategory(tab.dataset.botCategoryTab);
            });
            this.#listen(categoryNav, 'keydown', event => this.#categoryKeydown(event));
            this.#listen(action, 'click', () => this.submit()); this.#listen(retry, 'click', () => this.submit(true));
            this.#render();
            return result(true, 'accepted', 'MOUNTED', this.getSnapshot());
        }

        select(id) {
            const bot = this.#findBot(id);
            if (!bot) { this.#diagnostics.rejected += 1; return result(false, 'rejected', 'INVALID_SELECTION'); }
            this.#selectedId = id; this.#status = bot.availability === 'qa-only' ? 'ready' : 'planned';
            this.#selectedCategoryId = bot.categoryId;
            this.#diagnostics.selections += 1; this.#render();
            return result(true, 'accepted', 'SELECTED', this.getSnapshot());
        }

        async submit(isRetry = false) {
            const bot = this.#selectedBot();
            if (this.#disposed || this.#status === 'busy') return result(false, 'rejected', 'UNAVAILABLE');
            if ((!bot?.engineProfileId && !bot?.strengthProfileId) || bot.availability !== 'qa-only') {
                this.#status = 'planned'; this.#diagnostics.rejected += 1; this.#render();
                return result(false, 'rejected', 'BOT_CALIBRATION_PENDING');
            }
            const selected = global.CaissaBotSession.selectPresentation(this.#selectedId);
            if (!selected.ok) return result(false, 'rejected', 'INVALID_SELECTION');
            const resolvedColor = this.#color === 'random' ? this.#resolveRandomColor() : this.#color;
            if (!['white', 'black'].includes(resolvedColor)) return result(false, 'rejected', 'RANDOM_UNAVAILABLE');
            this.#status = 'busy'; this.#render();
            const options = { mode: 'engine', color: resolvedColor, timeControl: this.#timeControl };
            const readiness = global.CaissaPlayV2BotWorkerReadiness;
            const worker = isRetry ? await readiness?.retry?.(options) : await readiness?.begin?.(options);
            if (!worker?.ok) {
                this.#status = worker?.status === 'unavailable' ? 'unavailable' : 'error';
                this.#diagnostics.rejected += 1; this.#render();
                global.queueMicrotask?.(() => this.#root?.querySelector('[data-bot-retry]:not([hidden])')?.focus());
                return result(false, 'failed', worker?.reasonCode || 'WORKER_UNAVAILABLE');
            }
            const start = () => this.#compatibility.execute('startNewGame', {
                mode: 'engine', color: resolvedColor, timeControl: this.#timeControl
            });
            const command = global.CaissaPlayGameStartAnalytics?.observePanelStart?.({ mode: 'bots',
                startSource: 'primary-cta', timeControlSeconds: this.#timeControl, color: resolvedColor,
                opponentType: 'bot-catalog', assistanceCategory: 'engine-opponent', qaEligible: true,
                productionEligible: false, actionKey: this.#id }, start) ?? start();
            if (!command?.ok) {
                readiness?.teardown?.('initialization-failure'); this.#status = 'error';
                this.#diagnostics.rejected += 1; this.#render(); return result(false, 'failed', 'COMMAND_FAILED');
            }
            readiness?.markPlaying?.(); this.#status = 'active'; this.#diagnostics.starts += 1; this.#render();
            return result(true, 'accepted', 'STARTED', this.getSnapshot());
        }

        show() { if (this.#root) this.#root.hidden = false; return result(true, 'accepted', 'SHOWN'); }
        hide() { if (this.#root) this.#root.hidden = true; return result(true, 'accepted', 'HIDDEN'); }
        present(options = {}) {
            if (!this.#root || this.#disposed) return result(false, 'rejected', 'UNAVAILABLE');
            const phase = ['active-game', 'game-over'].includes(options.phase) ? options.phase : 'setup';
            if (phase !== 'game-over') this.#restorePostGamePlacement();
            this.#phase = phase; this.#root.dataset.botShellPhase = phase;
            this.#setupContent.hidden = phase !== 'setup'; this.#setupFoot.hidden = phase !== 'setup';
            this.#bodyHost.querySelectorAll('[data-bots-phase-content]:not([data-bots-phase-content="setup"])')
                .forEach(node => node.hidden = true);
            this.#footHost.querySelectorAll('[data-bots-foot-content]:not([data-bots-foot-content="setup"])')
                .forEach(node => node.hidden = true);
            if (phase !== 'setup') {
                const content = options.content;
                let foot = options.foot;
                if (phase === 'game-over') foot = this.#rememberPostGamePlacement(content, foot) || foot;
                if (content?.nodeType === 1) {
                    content.setAttribute('data-bots-phase-content', phase); content.hidden = false;
                    if (content.parentNode !== this.#bodyHost) this.#bodyHost.appendChild(content);
                }
                if (foot?.nodeType === 1) {
                    foot.setAttribute('data-bots-foot-content', phase); foot.hidden = false;
                    if (foot.parentNode !== this.#footHost) this.#footHost.appendChild(foot);
                }
            }
            const record = this.#selectedRecord();
            const meta = this.#root.querySelector('.caissa-bots-panel__selected-copy span');
            const category = record?.bot ? global.CaissaBotCollections.category(record.bot.categoryId) : null;
            if (meta && record?.bot && category) meta.textContent = `ELO ${record.bot.targetStrength}`;
            this.show();
            return result(true, 'accepted', 'PHASE_PRESENTED', this.getSnapshot());
        }
        reset() {
            this.#status = this.#selectedBot()?.availability === 'qa-only' ? 'ready' : 'planned'; this.#render();
            return result(true, 'accepted', 'RESET', this.getSnapshot());
        }
        getSnapshot() {
            const record = this.#selectedRecord(); const bot = record?.bot;
            return deepFreeze({ schemaVersion: SCHEMA_VERSION, panelId: this.#id, mounted: !!this.#root,
                status: this.#status, selectedBotId: this.#selectedId,
                selectedCollectionId: record?.collection?.id || null,
                selectedCategoryId: this.#selectedCategoryId,
                selectedEngineProfileId: bot?.engineProfileId || null, selectedTargetStrength: bot?.targetStrength || null,
                selectedStrengthProfileId: bot?.strengthProfileId || null,
                color: this.#color, timeControlSeconds: this.#timeControl, phase: this.#phase,
                architecture: 'head-body-foot', structuralRegionCount: this.#root?.querySelectorAll?.(
                    ':scope > [data-caissa-bots-head], :scope > [data-caissa-bots-body], :scope > [data-caissa-bots-foot]').length || 0,
                primaryAction: { label: 'Play', available: !this.#disposed && bot?.availability === 'qa-only' },
                listenerCount: this.#listeners.length, diagnostics: { ...this.#diagnostics } });
        }
        inspect() { return this.getSnapshot(); }
        dispose() {
            this.#restorePostGamePlacement();
            this.#listeners.splice(0).forEach(({ target, type, handler }) => target.removeEventListener(type, handler));
            this.#root?.remove(); this.#root = null; this.#disposed = true; this.#status = 'disposed';
            return result(true, 'accepted', 'DISPOSED');
        }

        #rememberPostGamePlacement(content, foot) {
            if (this.#postGamePlacement) return this.#postGamePlacement.wrapper;
            if (content?.nodeType !== 1 || foot?.nodeType !== 1) return null;
            const actionOrder = [...foot.querySelectorAll(':scope > [data-post-game-action]')];
            const primary = foot.querySelector('[data-post-game-action="analyze"]');
            const rematch = foot.querySelector('[data-post-game-action="rematch"]');
            const newGame = foot.querySelector('[data-post-game-action="new-game"]');
            const mentor = foot.querySelector('[data-post-game-action="mentor-review"]');
            const pgnActions = ['copy-pgn', 'download-pgn', 'save-game']
                .map(action => foot.querySelector(`[data-post-game-action="${action}"]`)).filter(Boolean);
            const consent = content.querySelector('.caissa-post-game__consent');
            const feedback = content.querySelector('.caissa-post-game__feedback');
            const contentMarker = global.document.createComment('caissa-bots-post-game-content-home');
            const footMarker = global.document.createComment('caissa-bots-post-game-foot-home');
            const primaryMarker = global.document.createComment('caissa-bots-post-game-primary-home');
            const consentMarker = global.document.createComment('caissa-bots-post-game-consent-home');
            const feedbackMarker = global.document.createComment('caissa-bots-post-game-feedback-home');
            content.parentNode?.insertBefore(contentMarker, content);
            foot.parentNode?.insertBefore(footMarker, foot);
            primary?.parentNode?.insertBefore(primaryMarker, primary);
            consent?.parentNode?.insertBefore(consentMarker, consent);
            feedback?.parentNode?.insertBefore(feedbackMarker, feedback);
            const wrapper = element('div', 'caissa-bots-panel__post-game-foot', {
                'data-bots-foot-content': 'game-over'
            });
            const menu = element('details', 'caissa-bots-panel__post-game-menu');
            const menuToggle = element('summary', 'caissa-bots-panel__post-game-menu-toggle', {
                'aria-label': 'PGN actions menu', 'aria-haspopup': 'true', 'aria-expanded': 'false',
                'aria-controls': `${this.#id}-post-game-menu`
            });
            const menuMark = element('span', 'caissa-bots-panel__post-game-menu-mark', { 'aria-hidden': 'true' });
            menuMark.textContent = '•••';
            const menuLabel = element('span', ''); menuLabel.textContent = 'Menu';
            const menuItems = element('div', 'caissa-bots-panel__post-game-menu-items', {
                id: `${this.#id}-post-game-menu`, 'aria-label': 'PGN actions'
            });
            menuToggle.append(menuMark, menuLabel);
            menuItems.append(...pgnActions);
            menu.append(menuToggle, menuItems);
            if (primary) {
                primary.setAttribute('data-bots-primary-post-game-action', '');
                content.querySelector('.caissa-post-game__reason')?.after(primary);
            }
            if (rematch) rematch.hidden = true;
            if (mentor) foot.appendChild(mentor);
            if (newGame) foot.appendChild(newGame);
            foot.appendChild(menu);
            wrapper.appendChild(foot);
            if (consent) menuItems.appendChild(consent);
            if (feedback) menuItems.appendChild(feedback);
            const syncMenuState = () => menuToggle.setAttribute('aria-expanded', String(menu.open));
            const dismissMenu = event => {
                if (menu.open && !menu.contains(event.target)) menu.open = false;
            };
            const closeMenuFromKeyboard = event => {
                if (event.key !== 'Escape' || !menu.open) return;
                event.preventDefault(); menu.open = false; menuToggle.focus();
            };
            menu.addEventListener('toggle', syncMenuState);
            menu.addEventListener('keydown', closeMenuFromKeyboard);
            global.document.addEventListener('pointerdown', dismissMenu, true);
            this.#postGamePlacement = { content, foot, actionOrder, primary, rematch, consent, feedback, wrapper, menu,
                syncMenuState, dismissMenu, closeMenuFromKeyboard,
                contentMarker, footMarker, primaryMarker, consentMarker, feedbackMarker };
            return wrapper;
        }

        #restorePostGamePlacement() {
            const placement = this.#postGamePlacement;
            if (!placement) return;
            this.#postGamePlacement = null;
            placement.menu.removeEventListener('toggle', placement.syncMenuState);
            placement.menu.removeEventListener('keydown', placement.closeMenuFromKeyboard);
            global.document.removeEventListener('pointerdown', placement.dismissMenu, true);
            if (placement.primary) placement.primaryMarker.parentNode?.insertBefore(placement.primary, placement.primaryMarker);
            placement.primaryMarker.remove();
            placement.primary?.removeAttribute('data-bots-primary-post-game-action');
            if (placement.rematch) placement.rematch.hidden = false;
            placement.footMarker.parentNode?.insertBefore(placement.foot, placement.footMarker);
            placement.footMarker.remove();
            if (placement.consent) placement.consentMarker.parentNode?.insertBefore(placement.consent, placement.consentMarker);
            placement.consentMarker.remove();
            if (placement.feedback) placement.feedbackMarker.parentNode?.insertBefore(placement.feedback, placement.feedbackMarker);
            placement.feedbackMarker.remove();
            placement.contentMarker.parentNode?.insertBefore(placement.content, placement.contentMarker);
            placement.contentMarker.remove();
            placement.actionOrder.forEach(action => placement.foot.appendChild(action));
            placement.menu.remove();
            placement.wrapper.remove();
            placement.content.removeAttribute('data-bots-phase-content');
        }

        #botChoice(bot, category, collection) {
            const available = bot.availability === 'qa-only';
            const reference = collection.id === 'classic' ? bot.id : `${collection.id}:${bot.id}`;
            const label = element('label', `caissa-bots-panel__bot${available ? ' is-preview-ready' : ' is-planned'}`, {
                'data-bot-card': reference,
                'data-visual-component': 'profile-card',
                title: `${bot.name} · ${bot.targetStrength} Elo target${available ? ' · Preview ready' : ' · Coming soon'}`
            });
            const input = element('input', '', {
                type: 'radio', name: `${this.#id}-bot`, value: reference, 'data-bot-id': reference,
                'aria-label': `${bot.name}, ${bot.targetStrength} Elo target, ${category.label}${available ? ', preview ready' : ', coming soon'}`
            });
            const piece = piecePortrait(category, 'caissa-bots-panel__bot-piece');
            const name = element('strong', 'caissa-bots-panel__bot-name'); name.textContent = bot.name;
            const meta = element('span', 'caissa-bots-panel__bot-meta');
            meta.textContent = available ? `${bot.targetStrength} Elo target` : `${bot.targetStrength} Elo target · Coming soon`;
            label.append(input, piece, name, meta); return label;
        }
        #selectedRecord() { return global.CaissaBotCollectionRegistry?.resolveBot?.(this.#selectedId) || null; }
        #findBot(id) { return global.CaissaBotCollectionRegistry?.resolveBot?.(id)?.bot || null; }
        #selectedBot() { return this.#selectedRecord()?.bot || null; }
        #change(event) {
            if (event.target?.dataset?.botId) this.select(event.target.dataset.botId);
            if (event.target?.hasAttribute?.('data-bot-color')) this.#color = event.target.value;
            if (event.target?.hasAttribute?.('data-bot-time')) this.#timeControl = Number(event.target.value);
            this.#render();
        }
        #activateCategory(categoryId, focus = false) {
            const category = global.CaissaBotCollections.category(categoryId);
            if (!category) return result(false, 'rejected', 'INVALID_CATEGORY');
            this.#selectedCategoryId = categoryId;
            const first = (global.CaissaBotCollectionRegistry?.listActive?.() || []).flatMap(item =>
                item.collection.bots.filter(bot => bot.categoryId === categoryId)
                    .map(bot => ({ collection: item.collection, bot })))
                .find(item => item.bot.availability === 'qa-only');
            if (first) {
                this.#selectedId = first.collection.id === 'classic' ? first.bot.id : `${first.collection.id}:${first.bot.id}`;
                this.#status = 'ready';
            } else { this.#selectedId = null; this.#status = 'planned'; }
            this.#render();
            if (focus) this.#root?.querySelector(`[data-bot-category-tab="${categoryId}"]`)?.focus();
            return result(true, 'accepted', 'CATEGORY_SELECTED', this.getSnapshot());
        }
        #categoryKeydown(event) {
            const current = event.target?.closest?.('[data-bot-category-tab]');
            if (!current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const tabs = [...this.#root.querySelectorAll('[data-bot-category-tab]')];
            const index = tabs.indexOf(current);
            const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1)
                : tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
            event.preventDefault(); this.#activateCategory(target.dataset.botCategoryTab, true);
        }
        #render() {
            if (!this.#root) return;
            const record = this.#selectedRecord(); const bot = record?.bot;
            const category = bot ? global.CaissaBotCollections.category(bot.categoryId) : null;
            this.#root.querySelectorAll('[data-bot-id]').forEach(input => input.checked = input.value === this.#selectedId);
            this.#root.querySelectorAll('[data-bot-category]').forEach(group =>
                group.hidden = group.dataset.botCategory.split(':').at(-1) !== this.#selectedCategoryId);
            this.#root.querySelectorAll('[data-bot-category-tab]').forEach(tab => {
                const selectedTab = tab.dataset.botCategoryTab === this.#selectedCategoryId;
                tab.setAttribute('aria-selected', String(selectedTab)); tab.tabIndex = selectedTab ? 0 : -1;
            });
            this.#root.querySelectorAll('[data-bot-color]').forEach(input => input.checked = input.value === this.#color);
            const selected = this.#root.querySelector('[data-bot-selected]');
            if (bot && category) {
                const portrait = piecePortrait(category, 'caissa-bots-panel__selected-piece');
                const copy = element('span', 'caissa-bots-panel__selected-copy');
                const name = element('strong', ''); name.textContent = bot.name;
                const meta = element('span', '');
                meta.textContent = `ELO ${bot.targetStrength}`;
                copy.append(name, meta); selected.replaceChildren(portrait, copy);
            } else selected.textContent = 'Choose a bot';
            selected.classList.toggle('is-planned', bot?.availability !== 'qa-only');
            const status = this.#root.querySelector('[data-bot-status]');
            status.textContent = this.#status === 'active' ? `Game started against ${bot?.name}.`
                : this.#status === 'busy' ? `Preparing ${bot?.name}…`
                    : this.#status === 'error' ? 'The bot could not start. Retry once or choose another game.'
                        : this.#status === 'unavailable' ? 'This bot is temporarily unavailable. Your choices are preserved.'
                            : bot?.availability !== 'qa-only' ? `${bot?.name || 'This bot'} is coming soon.` : '';
            const action = this.#root.querySelector('[data-bot-primary]');
            action.disabled = (!bot?.engineProfileId && !bot?.strengthProfileId) || bot.availability !== 'qa-only'
                || ['busy', 'unavailable'].includes(this.#status);
            action.setAttribute('aria-busy', String(this.#status === 'busy'));
            const retry = this.#root.querySelector('[data-bot-retry]');
            retry.hidden = this.#status !== 'error'; retry.disabled = this.#status === 'busy';
        }
        #listen(target, type, handler) {
            target.addEventListener(type, handler); this.#listeners.push({ target, type, handler });
        }
    }

    global.CaissaBotsPanel = Object.freeze({ schemaVersion: SCHEMA_VERSION, snapshotSchemaVersion: SCHEMA_VERSION,
        statuses: STATUSES, timeControls: TIME_CONTROLS, colors: COLORS,
        create: options => new BotsPanel(options) });
})(typeof window !== 'undefined' ? window : globalThis);
