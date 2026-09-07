(function initializeAnalyzeV2Shell(global) {
    'use strict';

    const VIEW_LABELS = Object.freeze({
        analysis: 'Analysis',
        games: 'Games',
        setup: 'Setup Position'
    });

    const shell = {
        root: null,
        tabs: [],
        panels: [],
        activeView: 'analysis',
        resizeFrame: 0,

        init() {
            this.root = document.querySelector('[data-caissa-analyze-v2]');
            if (!this.root || this.root.dataset.analyzeV2Ready === 'true') return false;

            this.tabs = Array.from(this.root.querySelectorAll('[data-analyze-v2-tab]'));
            this.panels = Array.from(this.root.querySelectorAll('[data-analyze-v2-panel]'));
            if (!this.tabs.length || !this.panels.length) return false;

            this.root.dataset.analyzeV2Ready = 'true';
            this.tabs.forEach((tab) => {
                tab.addEventListener('click', () => this.selectView(tab.dataset.analyzeV2Tab));
                tab.addEventListener('keydown', (event) => this.handleTabKeydown(event));
            });
            global.addEventListener('resize', () => this.scheduleBoardResize(), { passive: true });
            global.visualViewport?.addEventListener?.('resize', () => this.scheduleBoardResize(), { passive: true });
            this.bindPlayerLabels();
            this.bindMinimalAnalysisProjection();
            this.selectView('analysis', { focus: false, announce: false });
            return true;
        },

        scheduleBoardResize() {
            global.cancelAnimationFrame?.(this.resizeFrame);
            this.resizeFrame = global.requestAnimationFrame?.(() => {
                this.resizeFrame = 0;
                global.AnalyzeSection?.board?.resize?.();
            }) || 0;
        },

        selectView(view, options = {}) {
            const nextView = VIEW_LABELS[view] ? view : 'analysis';
            const { focus = false, announce = true } = options;
            this.activeView = nextView;

            this.tabs.forEach((tab) => {
                const active = tab.dataset.analyzeV2Tab === nextView;
                tab.classList.toggle('is-active', active);
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
                if (active && focus) tab.focus();
            });

            this.panels.forEach((panel) => {
                const active = panel.dataset.analyzeV2Panel === nextView;
                panel.classList.toggle('is-active', active);
                panel.hidden = !active;
            });

            const title = document.getElementById('analyzeV2WorkspaceTitle');
            if (title) title.textContent = VIEW_LABELS[nextView];

            if (announce) {
                this.root.dispatchEvent(new CustomEvent('caissa:analyze-v2-view-change', {
                    bubbles: true,
                    detail: Object.freeze({ view: nextView })
                }));
            }
            this.scheduleBoardResize();
        },

        handleTabKeydown(event) {
            const currentIndex = this.tabs.indexOf(event.currentTarget);
            if (currentIndex < 0) return;

            let nextIndex = currentIndex;
            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % this.tabs.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = this.tabs.length - 1;
            else return;

            event.preventDefault();
            this.selectView(this.tabs[nextIndex].dataset.analyzeV2Tab, { focus: true });
        },

        bindPlayerLabels() {
            const pairs = [
                ['analyzeBlackPlayer', 'analyzeV2BlackLabel', 'Black'],
                ['analyzeWhitePlayer', 'analyzeV2WhiteLabel', 'White']
            ];

            pairs.forEach(([sourceId, targetId, fallback]) => {
                const source = document.getElementById(sourceId);
                const target = document.getElementById(targetId);
                if (!source || !target) return;

                const sync = () => {
                    const value = source.textContent?.trim();
                    target.textContent = value && value !== '-' ? value : fallback;
                };
                sync();
                new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
            });
        },

        bindMinimalAnalysisProjection() {
            const evidence = document.getElementById('analyzeMoveEvidence');
            const moveList = document.getElementById('analyzeMoveList');
            const engineToggle = document.getElementById('analyzeEngineToggle');
            const render = () => this.renderMinimalAnalysis();

            [evidence, moveList].forEach((source) => {
                if (source) new MutationObserver(render).observe(source, {
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            });
            if (engineToggle) new MutationObserver(render).observe(engineToggle, {
                attributes: true,
                attributeFilter: ['aria-pressed', 'class'],
                childList: true,
                characterData: true,
                subtree: true
            });
            render();
        },

        getEngineCandidates(result) {
            if (!result) return [];
            const provided = result.lines || result.multiPv || result.variations;
            return (Array.isArray(provided) && provided.length ? provided : [result]).slice(0, 3);
        },

        renderMinimalAnalysis() {
            const analyze = global.AnalyzeSection;
            if (!analyze) return;

            const openingLabel = document.getElementById('analyzeV2OpeningLabel');
            const engineMeta = document.getElementById('analyzeV2EngineMeta');
            const engineLines = document.getElementById('analyzeV2EngineLines');
            const opening = analyze.getAnalyzeOpening?.();
            if (openingLabel) openingLabel.textContent = opening?.name || 'Starting Position';

            const result = analyze.liveCurrentResult;
            const engineOn = Boolean(analyze.liveEngineEnabled);
            const depth = Number(result?.depth || 0);
            if (engineMeta) engineMeta.textContent = engineOn && depth
                ? `depth=${depth} | Stockfish`
                : 'Stockfish';
            if (!engineLines) return;

            engineLines.replaceChildren();
            if (!engineOn) return;
            if (!result) {
                const loading = document.createElement('p');
                loading.className = 'caissa-analyze-v2__engine-waiting';
                loading.textContent = 'Analyzing…';
                engineLines.appendChild(loading);
                return;
            }

            const fen = analyze.getGame?.()?.fen?.() || '';
            this.getEngineCandidates(result).forEach((candidate, index) => {
                const pv = Array.isArray(candidate.pv) ? candidate.pv : [];
                const firstMove = candidate.bestMove || pv[0] || '';
                const bestMove = analyze.uciToSan?.(fen, firstMove) || firstMove || '—';
                const row = document.createElement('div');
                row.className = 'caissa-analyze-v2__engine-line';

                const score = document.createElement('strong');
                score.textContent = analyze.formatEvaluation?.(candidate.eval, candidate.mate) || '—';
                const variation = document.createElement('span');
                variation.textContent = index === 0
                    ? `${bestMove} is best${pv.length > 1 ? `  ${pv.slice(1, 7).join(' ')}` : ''}`
                    : (pv.slice(0, 7).join(' ') || bestMove);
                row.append(score, variation);
                engineLines.appendChild(row);
            });
        }
    };

    global.CaissaAnalyzeV2Shell = shell;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => shell.init(), { once: true });
    } else {
        shell.init();
    }
})(window);
