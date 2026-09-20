import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('css/spectator-tv-2.css');
const script = read('js/spectator-tv-section.js');
const ficsClient = read('js/fics-client.js');
const navigation = read('js/caissa-primary-navigation.js');
const routePolicy = read('js/legacy-canonical-section-route-policy.js');
const section = html.match(/<!-- SECTION: Spectator TV -->([\s\S]*?)<!-- SECTION: FICS/)[1];

test('visible identity is Chess TV while the spectator-tv contract remains canonical', () => {
    assert.match(section, /<h2 class="spectator-title">[\s\S]*?Chess TV<\/h2>/);
    assert.match(section, /aria-label="Chess TV controls"/);
    assert.doesNotMatch(section, /aria-label="Spectator TV/);

    const navigationLinks = html.match(/<a href="\/spectator-tv"[^>]*data-nav-key="spectator"[^>]*>[\s\S]*?<\/a>/g) || [];
    assert.equal(navigationLinks.length, 1);
    assert.match(navigationLinks[0], /aria-label="Chess TV"/);
    assert.match(navigationLinks[0], />Chess TV<\/span>/);
    assert.match(navigation, /id: 'spectator', label: 'Chess TV',[^\r\n]*route: '\/spectator-tv'/);
    assert.doesNotMatch(navigation, /route: '\/chess-tv'/);
    assert.match(routePolicy, /'\/spectator-tv':[^\r\n]*title: 'Chess TV \| CAISSA Chess'/);
    assert.doesNotMatch(routePolicy, /'\/chess-tv'/);

    for (const id of ['spectatorSection', 'spectatorStage', 'spectatorWorkspace', 'spectatorBoard']) {
        assert.match(section, new RegExp(`id="${id}"`));
    }
});

test('Spectator TV 2.0 uses one board region and one HEAD BODY FOOT workspace', () => {
    assert.match(section, /id="spectatorStage" class="spectator-stage"/);
    assert.equal((section.match(/class="spectator-board-panel"/g) || []).length, 1);
    assert.equal((section.match(/class="spectator-workspace"/g) || []).length, 1);
    assert.equal((section.match(/spectator-workspace-head/g) || []).length, 1);
    assert.equal((section.match(/spectator-workspace-body/g) || []).length, 1);
    assert.equal((section.match(/spectator-workspace-foot/g) || []).length, 1);
    assert.match(section, /spectator-workspace-head[\s\S]*spectator-workspace-body[\s\S]*spectator-workspace-foot/);
    assert.match(section, /<div class="spectator-workspace-foot">[\s\S]*?<\/div>\s*<\/aside>/);
    assert.doesNotMatch(section, /spectator-browser-panel|spectator-side-panel/);
});

test('workflow exposes exactly Server, Channels, and Watch views', () => {
    assert.equal((section.match(/data-spectator-tab=/g) || []).length, 3);
    assert.equal((section.match(/data-spectator-view=/g) || []).length, 3);
    for (const id of ['server', 'channels', 'watch']) {
        assert.match(section, new RegExp(`data-spectator-tab="${id}"`));
        assert.match(section, new RegExp(`data-spectator-view="${id}"`));
    }
});

test('FICS is the only provider in the redesign scope', () => {
    assert.match(section, /data-spectator-server="fics"/i);
    assert.doesNotMatch(section, /lichess/i);
    assert.equal((section.match(/data-spectator-server=/g) || []).length, 1);
});

test('new shell reuses existing FICS and Spectator owners', () => {
    assert.match(script, /window\.CaissaFICSClient/);
    assert.match(script, /window\.CaissaSpectatorTV/);
    assert.match(script, /window\.CaissaSpectatorTVCatalog/);
    assert.match(script, /switchObservedGame/);
    assert.doesNotMatch(script, /new\s+WebSocket\s*\(/);
    assert.doesNotMatch(script, /new\s+Chess\s*\(/);
});

test('workspace BODY is the scroll owner and desktop is a two-zone grid', () => {
    assert.match(css, /\.spectator-layout\.spectator-v2\s*\{[^}]*height:\s*100dvh/s);
    assert.match(css, /\.spectator-v2 \.spectator-stage\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s+minmax\(360px, 410px\)/s);
    assert.match(css, /\.spectator-v2 \.spectator-stage\s*\{[^}]*align-items:\s*stretch/s);
    assert.match(css, /\.spectator-v2 \.spectator-workspace\s*\{[^}]*overflow:\s*hidden/s);
    assert.match(css, /\.spectator-v2 \.spectator-workspace-body\s*\{[^}]*min-height:\s*0[^}]*overflow-x:\s*hidden[^}]*overflow-y:\s*auto/s);
    assert.doesNotMatch(css, /\.spectator-v2 \.spectator-workspace-(?:head|foot)\s*\{[^}]*overflow-y:\s*(?:auto|scroll)/s);
    assert.doesNotMatch(css, /\.spectator-v2 \.spectator-workspace-foot\s*\{[^}]*position:\s*fixed/s);
    assert.doesNotMatch(css, /zoom\s*:/i);
});

test('Spectator TV reuses the certified FICS board projection and a guarded resize scheduler', () => {
    assert.match(script, /window\.CaissaFICSBoardView\.createFicsBoardView/);
    assert.match(script, /boardView\.presentCanonicalState/);
    assert.match(script, /deriveStyle12BoardMove/);
    assert.match(script, /geometry\.width <= 0 \|\| geometry\.height <= 0/);
    assert.match(script, /boardResizeFrame !== null/);
    assert.doesNotMatch(script, /new\s+(?:window\.)?ResizeObserver/);
});

test('approved board presentation controls are present', () => {
    for (const id of ['spectatorFlipBoardBtn', 'spectatorTheaterBtn', 'spectatorFullscreenBtn', 'spectatorBoardRefreshBtn']) {
        assert.match(section, new RegExp(`id="${id}"`));
        assert.equal((section.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
    }

    const broadcastBar = section.match(/<div class="spectator-broadcast-bar">([\s\S]*?)<\/div>\s*<div id="spectatorViewingState"/)[1];
    assert.match(broadcastBar, /FICS broadcast[\s\S]*spectator-board-tools[\s\S]*id="spectatorGameStatus"/i);
    assert.match(css, /\.spectator-v2 \.spectator-broadcast-bar\s*\{[^}]*grid-template-areas:\s*"provider controls status"/s);
    assert.doesNotMatch(css, /\.spectator-v2 \.spectator-board-tools\s*\{[^}]*position:\s*absolute/s);
});

test('only the authoritative player-bar clocks remain', () => {
    assert.equal((section.match(/class="spectator-player-clock"/g) || []).length, 2);
    assert.doesNotMatch(section, /spectator-clock-row|spectatorWhiteClock|spectatorBlackClock/);
    assert.doesNotMatch(section, /spectator-player-card__clock/);
    assert.doesNotMatch(section, /White\s+(?:\d{1,2}:\d{2}|--:--)\s*\|\s*Black\s+(?:\d{1,2}:\d{2}|--:--)/i);
    assert.doesNotMatch(script, /renderClocks|elements\.whiteClock|elements\.blackClock/);
});

test('Game details is one compact selected-game projection', () => {
    assert.equal((section.match(/data-spectator-detail=/g) || []).length, 12);
    for (const detail of ['opening', 'eco', 'variant', 'rated', 'status', 'time-control', 'move', 'phase', 'result', 'game', 'rating', 'players']) {
        assert.match(section, new RegExp(`data-spectator-detail="${detail}"`));
    }
    assert.doesNotMatch(section, /id="spectatorMetadata"|spectator-player-cards/);
    assert.equal((section.match(/class="spectator-context-row(?:\s[^"']*)?"/g) || []).length, 6);
    assert.match(css, /\.spectator-v2 \.spectator-context-row\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    assert.match(css, /@media \(max-width:\s*520px\)[\s\S]*\.spectator-v2 \.spectator-context-row[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(script, /selectedGame:\s*null/);
    assert.match(script, /selectionGeneration:\s*0/);
    assert.match(script, /isSelectedGameUpdate\(liveGame/);
    assert.doesNotMatch(script, /renderCatalogSummary/);
});

test('FOOT keeps only connection, Back, and the Server continue action', () => {
    const foot = section.match(/<div class="spectator-workspace-foot">([\s\S]*?)<\/div>\s*<\/aside>/)[1];
    assert.match(foot, /id="spectatorConnectionStatus"/);
    assert.match(foot, /id="spectatorWorkspaceBackBtn"/);
    assert.match(foot, /id="spectatorServerContinueBtn"/);
    assert.doesNotMatch(foot, /Refresh|Watch featured|spectator-foot-channels/);
    assert.match(section, /id="spectatorBoardRefreshBtn"/);
    assert.match(script, /className = 'fics-btn fics-btn-secondary spectator-game-watch'/);
    assert.match(script, /Exit table/);
    assert.match(script, /exitObservedGame\(targetStage/);
    assert.match(script, /client\.leaveObservedGame\(unobserveGameId\)/);
    assert.match(ficsClient, /this\.send\(`unobserve \$\{target\}`\)/);
});

test('rapid selection queues the newest game and rejects stale updates by id and generation', () => {
    assert.match(script, /delivery\.code === 'OBSERVE_IN_PROGRESS'/);
    assert.match(script, /this\.queuedGameId = gameId/);
    assert.match(script, /eventGameId !== String\(this\.selectedGame\.gameId\)/);
    assert.match(script, /payload\.selectionGeneration/);
    assert.match(script, /this\.lastRenderedFen = null/);
    assert.match(script, /this\.board\.position\('start', false\)/);
});
