(function () {
    'use strict';

    const ID = 'lc0-maia-1100-preview';
    const PREFERENCE_KEY = 'caissa.arena.experimental.lc0.v1';
    const SOURCE_MANIFEST = '648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d';
    const DEPLOYMENT_MANIFEST = '648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d';
    const ADAPTER_URL = '/experiments/lc0-arena-preview/isolated-browser-runtime-adapter.js?v=rc1-daf3404';

    const rollout = {
        enabled: false,
        eligible: false,
        config: null,
        adapter: null,
        pendingPopup: null,
        prepared: false,
        panelViewed: false,
        statusNodes: [],
        infoNodes: [],

        status(value) {
            const raw = String(value || '');
            const message = raw.startsWith('Connecting') ? 'Starting Lc0…'
                : raw.startsWith('Claiming') ? 'Loading engine…'
                    : raw.startsWith('Verifying Maia') ? 'Loading Maia 1100…'
                        : raw.startsWith('Lc0 unavailable:')
                            ? 'Lc0 could not initialize. No engine substitution was made.'
                        : raw;
            for (const node of this.statusNodes) node.textContent = message;
        },

        info(value, fen) {
            if (!this.adapter || this.adapter.active?.fen !== fen) return;
            const depth = Number.isFinite(value.depth) ? `depth ${value.depth}` : 'depth pending';
            const nodes = Number.isFinite(value.nodes) ? `, ${value.nodes} nodes` : '';
            for (const node of this.infoNodes)
                node.textContent = `Lc0 search: ${depth}${nodes}. Stockfish evaluation remains separate.`;
        },

        capability() {
            const ua = String(navigator.userAgent || '');
            const brands = navigator.userAgentData?.brands?.map(item => item.brand) || [];
            const supportedBrand = brands.length
                ? brands.some(brand => /Google Chrome|Microsoft Edge/i.test(brand))
                : /(?:Chrome|Edg)\//.test(ua) && !/(?:Firefox|FxiOS|OPR|SamsungBrowser|CriOS)\//.test(ua);
            const mobile = navigator.userAgentData?.mobile === true ||
                /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
            const primitives = typeof WebAssembly === 'object' && typeof fetch === 'function' &&
                typeof ReadableStream === 'function' && typeof crypto?.randomUUID === 'function' &&
                typeof window.open === 'function';
            return Object.freeze({ supported: supportedBrand && !mobile && primitives,
                browser: supportedBrand, mobile, primitives });
        },

        async token() {
            const ready = window.CAISSA_AUTH?.whenReady?.();
            if (ready && typeof ready.then === 'function') {
                await Promise.race([ready, new Promise(resolve => setTimeout(resolve, 1_500))]);
            }
            if (!window.CAISSA_AUTH?.isSignedIn ||
                typeof window.CAISSA_AUTH?.getToken !== 'function') return null;
            try { return await window.CAISSA_AUTH.getToken(); }
            catch { return null; }
        },

        async request(path = '/api/eae016', options = {}) {
            const token = await this.token();
            const headers = { ...(options.headers || {}) };
            if (token) headers.Authorization = `Bearer ${token}`;
            const response = await fetch(path, { cache: 'no-store', credentials: 'same-origin',
                ...options, headers });
            const type = String(response.headers.get('content-type') || '');
            const body = type.includes('application/json') ? await response.json() : null;
            if (!response.ok) {
                const error = new Error(body?.error || 'LC0_ROLLOUT_UNAVAILABLE');
                error.status = response.status;
                throw error;
            }
            return body;
        },

        metric(event, latencyMs = null) {
            const body = { event };
            if (Number.isFinite(latencyMs)) body.latencyMs = latencyMs;
            this.request('/api/eae016', { method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body) }).catch(() => {});
        },

        reasonMessage(reason) {
            if (reason === 'AUTH_REQUIRED') return 'Sign in to check Experimental Lc0 availability.';
            if (reason === 'RUNTIME_UNAVAILABLE' || reason === 'INTEGRITY_UNAVAILABLE')
                return 'Lc0 is temporarily unavailable. Stockfish engines remain available.';
            if (reason === 'RELEASE_DRAINING')
                return 'Lc0 is temporarily unavailable while current sessions finish.';
            return 'Lc0 Experimental is not available for this rollout cohort.';
        },

        preference() {
            try { return localStorage.getItem(PREFERENCE_KEY) === 'enabled'; }
            catch { return false; }
        },

        setPreference(enabled) {
            try {
                if (enabled) localStorage.setItem(PREFERENCE_KEY, 'enabled');
                else localStorage.removeItem(PREFERENCE_KEY);
            } catch {}
        },

        cacheElements() {
            this.shell = document.getElementById('arenaExperimentalEngines');
            this.toggle = document.getElementById('arenaExperimentalToggle');
            this.panel = document.getElementById('arenaExperimentalPanel');
            this.enableButton = document.getElementById('arenaLc0Enable');
            this.disableButton = document.getElementById('arenaLc0Disable');
            this.runtimeButton = document.getElementById('arenaLc0StartRuntime');
            this.statusNodes = [document.getElementById('arenaLc0Status')].filter(Boolean);
            this.infoNodes = [document.getElementById('arenaLc0Info')].filter(Boolean);
            this.modal = document.getElementById('arenaLc0ConsentModal');
            this.modalCancel = document.getElementById('arenaLc0ConsentCancel');
            this.modalConfirm = document.getElementById('arenaLc0ConsentConfirm');
        },

        bind() {
            this.toggle?.addEventListener('click', () => this.openPanel(this.panel?.hidden !== false));
            this.enableButton?.addEventListener('click', () => this.openConsent());
            this.disableButton?.addEventListener('click', () => this.disable());
            this.runtimeButton?.addEventListener('click', () => this.openRuntimeWindow());
            this.modalCancel?.addEventListener('click', () => this.closeConsent());
            this.modalConfirm?.addEventListener('click', () => this.confirmConsent());
            this.modal?.addEventListener('click', event => {
                if (event.target === this.modal) this.closeConsent();
            });
        },

        openPanel(open) {
            if (!this.panel || !this.toggle) return;
            this.panel.hidden = !open;
            this.toggle.setAttribute('aria-expanded', String(open));
            if (open && !this.panelViewed) {
                this.panelViewed = true;
                this.metric('opt_in_viewed');
            }
        },

        openConsent() {
            if (!this.modal) return;
            this.modal.hidden = false;
            this.modal.classList.add('show');
            this.modal.setAttribute('aria-hidden', 'false');
            this.modalConfirm?.focus();
        },

        closeConsent() {
            if (!this.modal) return;
            this.modal.classList.remove('show');
            this.modal.hidden = true;
            this.modal.setAttribute('aria-hidden', 'true');
            this.enableButton?.focus();
        },

        async loadAdapter() {
            if (typeof window.IsolatedBrowserRuntimeAdapter === 'function') return true;
            const existing = document.getElementById('arenaLc0AdapterScript');
            if (existing) return await new Promise((resolve, reject) => {
                existing.addEventListener('load', () => resolve(true), { once: true });
                existing.addEventListener('error', reject, { once: true });
            });
            return await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.id = 'arenaLc0AdapterScript';
                script.src = ADAPTER_URL;
                script.async = true;
                script.onload = () => resolve(true);
                script.onerror = () => reject(new Error('LC0_ADAPTER_LOAD_FAILED'));
                document.head.appendChild(script);
            });
        },

        provider() {
            return {
                id: ID, providerId: ID,
                displayName: 'Lc0 — Maia 1100', name: 'Lc0 — Maia 1100',
                family: 'Lc0', version: window.Eae013Identity?.version || '0.33-dev',
                engineClass: 'neural', transport: 'isolated-browser-relay',
                backend: 'CPU/WASM', requiresIsolatedOrigin: true,
                protocol: 'uci', runtimeType: 'isolated-browser-relay',
                runtimeId: 'lc0-maia-1100-eae012-relay',
                workerPath: new URL(this.config.enginePath || '/', this.config.engineOrigin).href,
                wasmPath: '', tier: 'Experimental', badge: 'Experimental',
                options: { depth: 0 },
                capabilities: { browserCompatible: true, mobileCompatible: false,
                    requiresCrossOriginIsolation: true },
                resource: { threads: 1, mobileCompatible: false,
                    crossOriginIsolationRequired: true, estimatedWeightClass: 'heavy' },
                availability: 'available', enabled: true, mobileCompatible: false,
                notes: 'Experimental opt-in. Dedicated isolated runtime; user gesture required.'
            };
        },

        instrumentAdapter(adapter) {
            if (!adapter || adapter.__eae016Instrumented) return adapter;
            Object.defineProperty(adapter, '__eae016Instrumented', { value: true });
            let reportedStopSamples = adapter.metrics.stopMs.length;
            let cleanupReported = false;
            let cleanupFailureReported = false;
            let transportFailureReported = false;
            const stop = adapter.stop.bind(adapter);
            adapter.stop = async (...args) => {
                const result = await stop(...args);
                while (reportedStopSamples < adapter.metrics.stopMs.length) {
                    this.metric('lc0_stop_completed', adapter.metrics.stopMs[reportedStopSamples]);
                    reportedStopSamples += 1;
                }
                return result;
            };
            const terminate = adapter.terminate.bind(adapter);
            adapter.terminate = async (...args) => {
                const began = performance.now();
                try {
                    const result = await terminate(...args);
                    if (!cleanupReported) {
                        cleanupReported = true;
                        this.metric('lc0_cleanup_completed', adapter.metrics.cleanupMs ??
                            performance.now() - began);
                    }
                    return result;
                } catch (error) {
                    if (!cleanupFailureReported) {
                        cleanupFailureReported = true;
                        this.metric('lc0_cleanup_failed', performance.now() - began);
                    }
                    throw error;
                }
            };
            const fail = adapter.fail.bind(adapter);
            adapter.fail = error => {
                if (!transportFailureReported &&
                    String(error?.code || error?.message || '').includes('TRANSPORT')) {
                    transportFailureReported = true;
                    this.metric('lc0_transport_failed');
                }
                return fail(error);
            };
            return adapter;
        },

        async register() {
            if (this.enabled) return true;
            await this.loadAdapter();
            this.enabled = true;
            const registered = window.EngineRegistry?.registerArenaPreviewProvider(
                this.provider(),
                (provider, options) => {
                    const adapter = this.instrumentAdapter(
                        new window.IsolatedBrowserRuntimeAdapter(provider, options, this));
                    this.adapter = adapter;
                    return adapter;
                });
            if (!registered) {
                this.enabled = false;
                throw new Error('LC0_ROLLOUT_REGISTRATION_FAILED');
            }
            this.metric('lc0_selector_visible');
            this.status('Enabled. Select Lc0 — Maia 1100 for one participant.');
            this.render();
            this.refreshArena();
            return true;
        },

        async confirmConsent() {
            this.modalConfirm.disabled = true;
            this.status('Enabling Experimental Lc0…');
            try {
                this.setPreference(true);
                await this.register();
                this.metric('opt_in_enabled');
                this.closeConsent();
            } catch {
                this.setPreference(false);
                this.status('Lc0 is temporarily unavailable. Stockfish engines remain available.');
            } finally {
                this.modalConfirm.disabled = false;
            }
        },

        disable() {
            const state = window.CaissaArena?.state?.matchState;
            if (state === 'running' || state === 'paused') {
                this.status('Stop the current game before disabling Experimental Lc0.');
                return false;
            }
            this.setPreference(false);
            this.enabled = false;
            this.adapter = null;
            window.EngineRegistry?.unregisterArenaPreviewProvider?.(ID);
            this.metric('opt_in_disabled');
            this.status('Experimental Lc0 is disabled on this device.');
            this.render();
            this.refreshArena();
            return true;
        },

        refreshArena() {
            const arena = window.CaissaArena;
            if (!arena?.ensureEngineRegistry) return;
            arena.ensureEngineRegistry();
            arena.renderEngineSelectors();
            arena.renderTournamentEngineList();
            arena.updateTournamentUI();
        },

        waitForPopup(adapter) {
            if (this.adapter !== adapter) throw new Error('LC0_POPUP_OWNER_MISMATCH');
            this.openPanel(true);
            this.runtimeButton.hidden = false;
            this.runtimeButton.disabled = false;
            this.status('Lc0 needs permission to open its dedicated engine runtime window.');
            return new Promise((resolve, reject) => {
                this.pendingPopup = { resolve, reject, adapter };
            });
        },

        openRuntimeWindow() {
            const pending = this.pendingPopup;
            if (!pending) {
                this.status('Select Lc0 and start a Match or Tournament game first.');
                return;
            }
            const popup = window.open('about:blank', '_blank');
            if (!popup) {
                this.metric('lc0_popup_blocked');
                this.status('Allow the Lc0 engine window and try again.');
                return;
            }
            this.pendingPopup = null;
            this.runtimeButton.hidden = true;
            this.status('Starting Lc0…');
            pending.resolve(popup);
        },

        render() {
            if (!this.shell) return;
            this.shell.hidden = !this.eligible;
            if (!this.eligible) return;
            if (this.enableButton) this.enableButton.hidden = this.enabled;
            if (this.disableButton) this.disableButton.hidden = !this.enabled;
            if (this.runtimeButton && !this.pendingPopup) this.runtimeButton.hidden = true;
        },

        async prepare() {
            if (this.prepared || location.pathname !== '/arena') return false;
            this.prepared = true;
            this.cacheElements();
            this.bind();
            try {
                const config = await this.request();
                this.config = config;
                const capability = this.capability();
                if (config.releaseStage === 'DISABLED' || config.mode !== 'ENABLED') return false;
                if (!config.eligible) {
                    this.status(this.reasonMessage(config.reason));
                    return false;
                }
                if (!capability.supported) {
                    this.metric('lc0_unsupported_browser');
                    this.status('Lc0 Experimental is currently available on desktop Chrome and Edge.');
                    return false;
                }
                const provenanceValid = config.providerId === ID &&
                    config.mainOrigin === location.origin &&
                    config.sourceManifestSha256 === SOURCE_MANIFEST &&
                    config.manifestSha256 === DEPLOYMENT_MANIFEST &&
                    config.runtimeHealthy === true && config.relayHealthy === true &&
                    /^https:\/\/[^/]+$/.test(config.engineOrigin || '') &&
                    /^https:\/\/[^/]+$/.test(config.relayOrigin || '') &&
                    config.engineOrigin !== location.origin && config.relayOrigin !== location.origin;
                if (!provenanceValid) {
                    this.status('Lc0 is temporarily unavailable. Stockfish engines remain available.');
                    return false;
                }
                this.eligible = true;
                this.render();
                this.status('Available by explicit opt-in.');
                if (this.preference()) await this.register();
                return true;
            } catch {
                this.eligible = false;
                this.render();
                return false;
            }
        }
    };

    window.CaissaArenaRollout = rollout;
    // The certified Arena and adapter use this stable coordinator name.
    window.CaissaArenaPreview = rollout;
})();
