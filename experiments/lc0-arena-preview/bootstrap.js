// The normal Arena stays untouched unless the server confirms this exact
// preview branch and its separate isolated engine origin.
(function () {
    const ID = 'lc0-maia-1100-preview';
    const preview = {
        enabled: false,
        config: null,
        adapter: null,
        pendingPopup: null,
        status(value) {
            for (const node of this.statusNodes || []) node.textContent = value;
        },
        info(value, fen) {
            if (!this.adapter || this.adapter.active?.fen !== fen) return;
            const depth = Number.isFinite(value.depth) ? `depth ${value.depth}` : 'depth pending';
            const nodes = Number.isFinite(value.nodes) ? `, ${value.nodes} nodes` : '';
            for (const node of this.infoNodes || [])
                node.textContent = `Lc0 search: ${depth}${nodes}. Stockfish evaluation remains separate.`;
        },
        waitForPopup(adapter) {
            if (this.adapter !== adapter) throw new Error('LC0_POPUP_OWNER_MISMATCH');
            this.status('Click “Start Lc0 Engine” to open the isolated runtime.');
            return new Promise((resolve, reject) => { this.pendingPopup = { resolve, reject, adapter }; });
        },
        renderControls() {
            if (this.statusNodes?.length) return;
            this.statusNodes = [];
            this.infoNodes = [];
            for (const panelId of ['arenaPanelMatch', 'arenaPanelTournament']) {
                const body = document.getElementById(panelId)?.querySelector('.arena-panel-body');
                if (!body) continue;
                const panel = document.createElement('div');
                panel.className = 'arena-lc0-preview-control';
                panel.style.cssText = 'margin:1rem 0;padding:1rem;border:1px solid currentColor;border-radius:8px';
                const heading = document.createElement('p');
                heading.textContent = 'Experimental Lc0 — Maia 1100 (isolated preview)';
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-secondary';
                button.textContent = 'Start Lc0 Engine';
                button.addEventListener('click', () => {
                    const pending = this.pendingPopup;
                    if (!pending) {
                        this.status('Select Lc0 and start a Match or Tournament game first.');
                        return;
                    }
                    // The popup is created synchronously in the user gesture. The
                    // resulting isolated page has no opener communication channel.
                    const popup = window.open('about:blank', '_blank');
                    if (!popup) {
                        this.status('Popup blocked. Allow popups for this preview and try again.');
                        return;
                    }
                    this.pendingPopup = null;
                    this.status('Opening isolated engine window…');
                    pending.resolve(popup);
                });
                const status = document.createElement('p');
                status.setAttribute('role', 'status');
                status.setAttribute('aria-live', 'polite');
                const info = document.createElement('p');
                info.setAttribute('aria-label', 'Lc0 search information');
                panel.append(heading, button, status, info);
                body.append(panel);
                this.statusNodes.push(status);
                this.infoNodes.push(info);
            }
            this.status('Lc0 available on this protected desktop preview only.');
        },
        async prepare() {
            if (location.pathname !== '/arena-preview') return false;
            try {
                const response = await fetch('/api/eae013', { cache: 'no-store' });
                if (!response.ok) return false;
                const config = await response.json();
                if (config.enabled !== true || config.providerId !== ID ||
                    config.mainOrigin !== location.origin ||
                    !/^https:\/\/[^/]+\.vercel\.app$/.test(config.engineOrigin) ||
                    !/^https:\/\/[^/]+\.vercel\.app$/.test(config.relayOrigin) ||
                    config.engineOrigin === location.origin) return false;
                if (window.matchMedia('(max-width: 1050px)').matches) return false;
                this.config = config;
                this.enabled = true;
                const registered = window.EngineRegistry?.registerArenaPreviewProvider({
                    id: ID, providerId: ID,
                    displayName: 'Lc0 — Maia 1100 (Experimental)',
                    name: 'Lc0 — Maia 1100 (Experimental)',
                    family: 'Lc0', version: window.Eae013Identity.version,
                    engineClass: 'neural', transport: 'isolated-browser-relay',
                    backend: 'CPU/WASM', requiresIsolatedOrigin: true,
                    protocol: 'uci', runtimeType: 'isolated-browser-relay',
                    runtimeId: 'lc0-maia-1100-eae012-relay',
                    workerPath: new URL(config.enginePath ||
                        '/experiments/lc0-preview-relay/engine/index.html', config.engineOrigin).href,
                    wasmPath: '', tier: 'Experimental',
                    options: { depth: 0 },
                    capabilities: { browserCompatible: true, mobileCompatible: false,
                        requiresCrossOriginIsolation: true },
                    resource: { threads: 1, mobileCompatible: false,
                        crossOriginIsolationRequired: true, estimatedWeightClass: 'heavy' },
                    availability: 'available', enabled: true, mobileCompatible: false,
                    notes: 'Preview-only. Separate isolated origin; user gesture required.'
                }, (provider, options) => new window.IsolatedBrowserRuntimeAdapter(provider, options, this));
                if (!registered) throw new Error('LC0_PREVIEW_REGISTRATION_FAILED');
                this.renderControls();
                return true;
            } catch (error) {
                this.enabled = false;
                console.warn('[Arena preview] Lc0 unavailable:', error.message);
                return false;
            }
        }
    };
    window.CaissaArenaPreview = preview;
})();
