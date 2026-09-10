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

test('HEAD contains the approved lobby tabs plus one contextual Game tab', () => {
    assert.match(shell, /Object\.freeze\(\[\.\.\.LOBBY_VIEWS, 'game'\]\)/);
    assert.match(shell, /role: 'tablist'/);
    assert.match(shell, /role: 'tab'/);
    assert.match(shell, /aria-selected/);
    assert.match(shell, /ArrowRight/);
    assert.match(shell, /ArrowLeft/);
});

test('the existing board and functional nodes are reparented without cloning or recreation', () => {
    assert.match(shell, /document\.getElementById\('ficsBoardContainer'\)/);
    assert.match(shell, /boardRegion\.append\(boardSection\)/);
    assert.doesNotMatch(shell, /body\.append\([^\n]*(?:roomPanel|sidePanel|compatibility)/);
    assert.match(shell, /connection\.hidden = true/);
    assert.match(shell, /foot\.append\(consoleSection\)/);
    assert.doesNotMatch(shell, /cloneNode|innerHTML|new\s+Chess|Chessboard\s*\(/);
});

test('tab state is presentation-only and derives semantics through CaissaFICSPresentation', () => {
    assert.match(shell, /let selectedLobbyView = null/);
    assert.match(shell, /requestedLobbyView: selectedLobbyView/);
    assert.match(shell, /CaissaFICSPresentation\?\.getViewState/);
    assert.doesNotMatch(shell, /CaissaFICSClient\.(?:liveGame|gameActive|activeTables|seekActions|pendingSeek|connectionState|authenticated)\s*=/);
});

test('Players renders the frozen directory projection and contextual Game renders from the projection', () => {
    assert.match(shell, /const directory = snapshot\.players/);
    assert.match(shell, /Search players/);
    assert.match(shell, /Connected FICS players/);
    assert.match(shell, /if \(baseView\.gameModeAvailable && !lastGameModeAvailable\) selectedLobbyView = null/);
    assert.match(shell, /tab\.hidden = tabView === 'game' && !view\.gameModeAvailable/);
    assert.match(shell, /if \(view\.activeTab === 'game'\) dynamic\.append\(renderGame\(snapshot\)\)/);
    assert.doesNotMatch(shell, /Return to active FICS game|returnToGameButton|← Game/);
    assert.match(shell, /snapshot\.game\.moves/);
    assert.match(shell, /move number|fics-rd4-move-number/i);
});

test('Game Mode actions use only narrow canonical client methods and omit unapproved controls', () => {
    for (const method of ['resign', 'offerDraw', 'leaveObservedGame', 'downloadPGN']) {
        assert.match(shell, new RegExp(`CaissaFICSClient\\?\\.${method}\\?\\.`));
    }
    assert.match(shell, /Confirm Resign/);
    assert.match(shell, /serverAcknowledged: false|FICS confirmation is pending/);
    const gameRenderer = shell.slice(shell.indexOf('function renderGame'), shell.indexOf('function renderBody'));
    assert.doesNotMatch(gameRenderer, /\.send\s*\(|new\s+WebSocket|\babort\b|>Menu</i);
});

test('Game Mode has an internal notation scroller and presentation-only ended-game return', () => {
    assert.match(styles, /\.fics-rd4-move-scroll\s*\{[^}]*overflow-y:\s*auto/s);
    assert.match(styles, /scrollbar-gutter:\s*stable/);
    assert.match(shell, /Return to Lobby/);
    assert.match(shell, /dismissEndedGame\(snapshot\.game\)/);
    assert.match(shell, /dismissedEndedGameKey = gameKey\(game\)/);
    assert.match(shell, /replay\.followingLive && signature !== lastGameMoveSignature/);
});

test('replay cursor is presentation-only, uses canonical captured FENs, and gates live board input', () => {
    assert.match(shell, /let replayCursor = null/);
    assert.match(shell, /snapshot\.game\.moves\?\.\[ply - 1\]\?\.fen/);
    assert.match(shell, /snapshot\.game\.replay\?\.initialFen/);
    assert.match(shell, /currentPly/);
    assert.match(shell, /latestPly/);
    assert.match(shell, /isReviewingHistory/);
    assert.match(shell, /board\.position\(replay\.fen, false\)/);
    assert.match(client, /isReviewingHistoricalPosition\(\)/);
    assert.match(client, /if \(this\.isReviewingHistoricalPosition\(\)\) return false/);
    assert.doesNotMatch(shell, /new\s+Chess|Chessboard\s*\(/);
});

test('Game Over Analyze uses the approved handoff boundary without embedding an engine', () => {
    assert.match(shell, /CaissaFICSAnalyzeHandoff\?\.prepare/);
    assert.match(shell, /navigateToSection\?\.\('analyze'/);
    assert.match(shell, /handoffToken: prepared\.value\.token/);
    assert.doesNotMatch(shell, /new\s+Worker|Stockfish|sessionStorage|localStorage/);
});

test('Tables body renders only the read-only presentation snapshot and uses the canonical observe method', () => {
    assert.match(shell, /snapshot\.lobby\.activeTables/);
    assert.match(shell, /Recently reported games from a capped FICS feed; this is not a complete server directory\./);
    assert.match(shell, /CaissaFICSClient\?\.switchObservedGame\?\.\(number\)/);
    assert.match(shell, /Observe table/);
    assert.doesNotMatch(shell, /CaissaFICSClient\?\.(?:activeTables|liveGame|gameActive|pendingObservation)\s*=/);
    assert.equal((client.match(/this\.send\(`observe \$\{target\}`\)/g) || []).length, 2);
    assert.doesNotMatch(client, /renderActiveTables[\s\S]*?addEventListener\('click', \(\) => \{[\s\S]*?this\.send\(`observe/);
});

test('Seek body exposes the approved labeled fields and requests the canonical seek API', () => {
    for (const label of ['Time (minutes)', 'Increment (seconds)', 'Game', 'Play as', 'Create Table']) {
        assert.match(shell, new RegExp(label.replace(/[()]/g, '\\$&')));
    }
    assert.match(shell, /\['unrated', 'Casual'\], \['rated', 'Rated'\]/);
    assert.match(shell, /\['white', 'White'\], \['random', 'Random'\], \['black', 'Black'\]/);
    assert.match(shell, /CaissaFICSClient\?\.requestSeek\?\./);
    assert.match(shell, /CaissaFICSClient\?\.cancelSeek\?\./);
    assert.doesNotMatch(shell, /CaissaFICSClient\?\.pendingSeek\s*=/);
    assert.match(client, /seekBlitz1\?\.addEventListener\('click', \(\) => this\.seek\(1, 0\)\)/);
    assert.match(client, /createOpenTableSeek\(tableNumber\)[\s\S]*?return this\.requestSeek\(/);
    assert.match(client, /seek\(time, inc\)[\s\S]*?return this\.requestSeek\(/);
});

test('dynamic bodies retain truthful pending delivery and directory-only Players language', () => {
    assert.match(shell, /server acknowledgement is not available/);
    assert.match(shell, /Cancel requested/);
    assert.match(shell, /The last seek action was not delivered/);
    assert.match(shell, /No players loaded\./);
    assert.match(shell, /Unable to refresh player directory\./);
    assert.doesNotMatch(shell, /specific-player|match command/);
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
    assert.match(styles, /\.fics-rd4-move-scroll/);
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
    assert.match(builder, /presentation-contract\|analyze-handoff\|layout-shell/);
    assert.match(builder, /PROHIBITED_PLAY_V2_RESOURCE/);
});
