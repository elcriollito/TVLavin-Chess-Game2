import { resolveEndgameTrainerRoute } from './v2/endgame-trainer-route.js';
import {
    applyLegacyEndgameTrainerPresentation,
    renderEndgameTrainerLoadError,
    revealEndgameTrainerPresentation,
} from './endgame-trainer-presentation.js';

function loadScriptOnce(src, ready) {
    if (ready()) return Promise.resolve();
    const pathname = new URL(src, globalThis.location?.href || 'https://www.caissa-chess.org').pathname;
    const existing = [...document.scripts].find(script => new URL(script.src, globalThis.location.href).pathname === pathname);
    return new Promise((resolve, reject) => {
        const script = existing || document.createElement('script');
        const loaded = () => ready() ? resolve() : reject(new Error(`Dependency unavailable: ${pathname}`));
        script.addEventListener('load', loaded, { once: true });
        script.addEventListener('error', reject, { once: true });
        if (!existing) {
            script.src = src;
            document.head.append(script);
        } else if (ready()) resolve();
    });
}

function loadStylesheetOnce(href) {
    const pathname = new URL(href, globalThis.location?.href || 'https://www.caissa-chess.org').pathname;
    const existing = [...document.styleSheets].find(sheet => new URL(sheet.href, globalThis.location.href).pathname === pathname);
    if (existing) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', reject, { once: true });
        document.head.append(link);
    });
}

async function loadLegacyBoardVendor() {
    await Promise.all([
        loadStylesheetOnce('/assets/css/chessboard-1.0.0.min.css'),
        loadScriptOnce('/assets/vendor/jquery/jquery-3.6.0.min.js', () => Boolean(globalThis.jQuery)),
    ]);
    await loadScriptOnce('/assets/vendor/chessboard.js/chessboard-1.0.0.min.js', () => Boolean(globalThis.Chessboard));
}

async function start() {
    const route = resolveEndgameTrainerRoute(globalThis.location?.search ?? '');
    if (route.mode === 'technical-unavailable') {
        renderEndgameTrainerLoadError();
        return;
    }
    if (route.mode !== 'legacy' && route.mode !== 'guided-legacy') {
        const root = document.querySelector('[data-endgame-trainer-page]');
        const drawer = globalThis.CaissaPrimaryNavigation?.createDrawerController?.({
            host: root,
            nav: root?.querySelector('[data-mobile-nav]'),
            toggle: root?.querySelector('[data-mobile-nav-toggle]'),
            backdrop: root?.querySelector('.caissa-trainer-backdrop'),
            mobileQuery: '(max-width: 900px)',
            openClass: 'is-nav-open',
            bodyOpenClass: 'caissa-trainer-nav-open',
        });
        if (route.mode === 'public-v2') {
            const { mountEndgamePuzzleDatabasePage, unmountEndgamePuzzleDatabasePage } = await import('./puzzle-database/endgame-puzzle-page.js');
            try {
                mountEndgamePuzzleDatabasePage();
                revealEndgameTrainerPresentation('v2');
            } catch {
                drawer?.destroy();
                renderEndgameTrainerLoadError();
                return;
            }
            globalThis.addEventListener?.('pagehide', () => {
                drawer?.destroy();
                unmountEndgamePuzzleDatabasePage();
            }, { once: true });
            return;
        }
        try {
            await loadLegacyBoardVendor();
            const { mountEndgameTrainerV2Page, unmountEndgameTrainerV2Page } = await import('./v2/endgame-trainer-v2-page.js');
            await mountEndgameTrainerV2Page({ route });
            revealEndgameTrainerPresentation('v2');
            globalThis.addEventListener?.('pagehide', () => {
                drawer?.destroy();
                unmountEndgameTrainerV2Page();
            }, { once: true });
        } catch {
            drawer?.destroy();
            renderEndgameTrainerLoadError();
        }
        return;
    }
    applyLegacyEndgameTrainerPresentation();
    try {
        await loadLegacyBoardVendor();
        const { mountEndgameTrainerPage, unmountEndgameTrainerPage } = await import('./endgame-trainer-page.js');
        await mountEndgameTrainerPage();
        revealEndgameTrainerPresentation('legacy');
        globalThis.addEventListener?.('pagehide', () => unmountEndgameTrainerPage(), { once: true });
    } catch {
        renderEndgameTrainerLoadError();
    }
}

if (globalThis.document) {
    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', () => { void start(); }, { once: true })
        : void start();
}
