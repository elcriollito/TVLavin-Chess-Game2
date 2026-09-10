import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const shell = read('js/fics-layout-shell.js');
const styles = read('css/fics-redesign-shell.css');
const client = read('js/fics-client.js');
const pages = [read('index.html'), read('yahoo-classic.html')];
const builder = read('scripts/build-play-v2.mjs');

test('both legacy FICS pages load the scoped shell after the read-only projection', () => {
    for (const html of pages) {
        assert.equal((html.match(/css\/fics-redesign-shell\.css/g) || []).length, 1);
        assert.equal((html.match(/js\/fics-layout-shell\.js/g) || []).length, 1);
        assert.ok(html.indexOf('fics-presentation-contract.js') < html.indexOf('fics-layout-shell.js'));
    }
});

test('shell declares one board region and one workspace with HEAD BODY FOOT ownership', () => {
    assert.match(shell, /data-fics-shell-region': 'board'/);
    assert.match(shell, /data-fics-shell-region': 'workspace'/);
    for (const region of ['head', 'body', 'foot']) {
        assert.match(shell, new RegExp(`data-fics-workspace-region': '${region}'`));
    }
    assert.match(shell, /workspace\.append\(head, body, foot\)/);
});

test('HEAD contains exactly the approved Tables Players Seek tab model', () => {
    assert.match(shell, /Object\.freeze\(\['tables', 'players', 'seek'\]\)/);
    assert.match(shell, /role: 'tablist'/);
    assert.match(shell, /role: 'tab'/);
    assert.match(shell, /aria-selected/);
    assert.match(shell, /ArrowRight/);
    assert.match(shell, /ArrowLeft/);
});

test('the existing board and functional nodes are reparented without cloning or recreation', () => {
    assert.match(shell, /document\.getElementById\('ficsBoardContainer'\)/);
    assert.match(shell, /boardRegion\.append\(boardSection\)/);
    assert.match(shell, /compatibility\.append\(roomPanel, sidePanel\)/);
    assert.match(shell, /foot\.append\(connection, consoleSection\)/);
    assert.doesNotMatch(shell, /cloneNode|innerHTML|new\s+Chess|Chessboard\s*\(/);
});

test('tab state is presentation-only and derives semantics through CaissaFICSPresentation', () => {
    assert.match(shell, /let selectedLobbyView = null/);
    assert.match(shell, /requestedLobbyView: selectedLobbyView/);
    assert.match(shell, /CaissaFICSPresentation\?\.getViewState/);
    assert.doesNotMatch(shell, /CaissaFICSClient\.(?:liveGame|gameActive|activeTables|seekActions|pendingSeek|connectionState|authenticated)\s*=/);
});

test('Players and primary Game Mode placeholders remain truthful', () => {
    assert.match(shell, /A complete FICS player directory is not available yet\. No player list is shown\./);
    assert.match(shell, /if \(baseView\.gameModeAvailable && !lastGameModeAvailable\) selectedLobbyView = null/);
    assert.match(shell, /mounted\.returnToGame\.hidden = !view\.returnToGameAvailable/);
});

test('one flag and one immediate API restore the original legacy hierarchy', () => {
    assert.match(shell, /CAISSA_FICS_REDESIGN_ENABLED/);
    assert.match(shell, /root\[FLAG\] !== false/);
    assert.match(shell, /current\.gameArea\.append\(current\.roomPanel, current\.boardSection, current\.sidePanel\)/);
    assert.match(shell, /current\.layout\.insertBefore\(current\.connection, current\.gameArea\)/);
    assert.match(shell, /setEnabled/);
});

test('responsive CSS is board-first and resize delegates to the existing board instance', () => {
    assert.match(styles, /grid-template-columns: minmax\(540px, 1\.7fr\) minmax\(330px, 0\.78fr\)/);
    assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(styles, /@media \(max-width: 768px\)/);
    assert.match(styles, /orientation: landscape/);
    assert.doesNotMatch(styles, /\bzoom\s*:/);
    assert.match(shell, /new root\.ResizeObserver\(scheduleBoardResize\)/);
    assert.match(shell, /CaissaFICSClient\?\.board\?\.resize\?\.\(\)/);
    assert.doesNotMatch(shell, /CaissaFICSClient\?\.initBoard|CaissaFICSClient\.initBoard/);
});

test('board login console and protocol ownership remain singular', () => {
    for (const html of pages) {
        for (const id of ['ficsBoardContainer', 'ficsConnectBtn', 'ficsConsole', 'ficsCommandInput']) {
            assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
        }
    }
    assert.equal((client.match(/window\.CaissaFICSClient\s*=\s*CaissaFICSClient/g) || []).length, 1);
    assert.doesNotMatch(shell, /new\s+WebSocket|WebSocket\s*\(/);
});

test('Play v2 strips both RD-002 resources while retaining the unknown-FICS guard', () => {
    assert.match(builder, /fics-\(\?:client\|redesign-shell\)/);
    assert.match(builder, /presentation-contract\|layout-shell/);
    assert.match(builder, /PROHIBITED_PLAY_V2_RESOURCE/);
});
