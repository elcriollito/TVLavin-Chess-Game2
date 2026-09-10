import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const shell = read('js/fics-layout-shell.js');
const styles = read('css/fics-redesign-shell.css');
const client = read('js/fics-client.js');
const pages = [read('index.html'), read('yahoo-classic.html')];

test('Settings is one compact presentation-only shell control outside the approved HEAD tabs', () => {
    assert.match(shell, /fics-rd5-settings-button/);
    assert.match(shell, /aria-label': 'Open FICS settings'/);
    assert.match(shell, /let settingsOpen = false/);
    assert.match(shell, /setSettingsOpen/);
    assert.ok(shell.indexOf('head.append(tabList)') < shell.indexOf("const settingsButton = createElement"));
    assert.doesNotMatch(client, /settingsOpen|ficsRd5SettingsPanel/);
});

test('existing connection gateway session sound and gateway-test nodes move without duplication', () => {
    assert.match(shell, /connectionHeading, gatewayDetails, sessionColumn/);
    assert.match(shell, /connectionDiagnostics\.append\(connectionHeading, gatewayDetails\)/);
    assert.match(shell, /settingsContent\.append\(connectionDiagnostics, sessionColumn\)/);
    assert.doesNotMatch(shell, /cloneNode|new\s+WebSocket|WebSocket\s*\(/);
    for (const html of pages) {
        for (const id of ['ficsConnectionStatus', 'ficsGatewayStatus', 'ficsGatewayUrl',
            'ficsGatewayLatency', 'ficsGameStatus', 'ficsSoundToggle', 'ficsTestGatewayBtn']) {
            assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
        }
    }
});

test('primary auth moves to compact session chrome while FOOT owns only Console', () => {
    assert.match(shell, /sessionChrome\.append\(sessionControl, settingsButton\)/);
    assert.match(shell, /connection\.hidden = true/);
    assert.match(shell, /foot\.append\(consoleSection\)/);
    assert.doesNotMatch(shell, /settingsContent\.append\([^)]*(?:connectBtn|accountConnectBtn|disconnectBtn|connectionStatus|identityStatus)/);
    for (const html of pages) {
        assert.match(html, /id="ficsConnectionStatus"/);
        assert.match(html, /name="ficsLoginMode" value="guest"/);
        assert.match(html, /name="ficsLoginMode" value="account"/);
        assert.match(html, /id="ficsConnectBtn"/);
        assert.match(html, /id="ficsDisconnectBtn"/);
    }
});

test('Settings modal implements Escape focus containment return and inert background', () => {
    assert.match(shell, /role: 'dialog', 'aria-modal': 'true'/);
    assert.match(shell, /event\.key === 'Escape'/);
    assert.match(shell, /event\.key !== 'Tab'/);
    assert.match(shell, /mounted\.shell\.inert = true/);
    assert.match(shell, /mounted\.shell\.inert = false/);
    assert.match(shell, /settingsReturnFocus/);
});

test('Console has one canonical node and explicit reversible expansion behavior', () => {
    assert.match(client, /setConsoleExpanded\(expanded\)/);
    assert.match(client, /this\.elements\.consoleContainer\.style\.display = nextExpanded \? 'block' : 'none'/);
    assert.match(client, /toggleConsole\(\)[\s\S]*?return this\.setConsoleExpanded\(!expanded\)/);
    assert.match(shell, /setConsoleExpanded\(false\)/);
    assert.doesNotMatch(shell, /createElement\([^\n]*(?:ficsConsole|ficsCommandInput)|messageBuffer\s*=/i);
});

test('FOOT compaction releases fixed workspace height to a flexible BODY track', () => {
    assert.match(styles, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
    assert.match(styles, /\.fics-rd2-workspace\s*\{[^}]*height:\s*min\(calc\(100dvh - 160px\), 860px\)/s);
    assert.match(styles, /\.fics-rd2-workspace-foot\s*\{[^}]*padding:\s*6px 10px/s);
    assert.match(styles, /\.fics-console-section\s*\{[^}]*padding:\s*0/s);
});

test('Game notation stretches into recovered BODY space while Tables and Seek retain the same body owner', () => {
    assert.match(styles, /\.fics-rd4-game\s*\{[^}]*height:\s*100%/s);
    assert.match(styles, /\.fics-rd4-moves\s*\{[^}]*flex:\s*1 1 auto/s);
    assert.match(styles, /\.fics-rd4-move-scroll\s*\{[^}]*max-height:\s*none/s);
    assert.match(shell, /if \(view\.activeTab === 'tables'\) dynamic\.append\(renderTables\(snapshot\)\)/);
    assert.match(shell, /if \(view\.activeTab === 'seek'\) dynamic\.append\(renderSeek\(snapshot\)\)/);
});

test('mobile Settings is a fixed overlay and cannot consume workspace width', () => {
    assert.match(styles, /\.fics-rd5-settings-layer\s*\{[^}]*position:\s*fixed/s);
    assert.match(styles, /\.fics-rd5-settings-panel\s*\{[^}]*width:\s*min\(390px, 100%\)/s);
    assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?width:\s*min\(92vw, 390px\)/);
    assert.doesNotMatch(styles, /\.fics-rd2-shell[^}]*padding-right[^}]*settings/s);
});

test('feature-flag rollback restores moved diagnostics and the prior Console presentation', () => {
    assert.match(shell, /restoreRelocations\(current\.relocations\)/);
    assert.match(shell, /current\.sessionColumn\.classList\.remove\('fics-rd5-settings-group'\)/);
    assert.match(shell, /consoleContainer\.style\.display = current\.consoleState\.display/);
    assert.match(shell, /current\.settingsLayer\.remove\(\)/);
    assert.match(shell, /current\.sessionChrome\.remove\(\)/);
    assert.match(shell, /current\.connection\.hidden = current\.connectionHidden/);
});

test('one client socket board connection sound console and canonical Players owner remain', () => {
    assert.equal((client.match(/window\.CaissaFICSClient\s*=\s*CaissaFICSClient/g) || []).length, 1);
    assert.doesNotMatch(shell, /new\s+WebSocket|Chessboard\s*\(|new\s+Chess/);
    assert.match(shell, /snapshot\.players/);
    assert.match(client, /playersDirectory:/);
    assert.doesNotMatch(shell, /\bwho\b|challenge player|player profile/i);
    for (const html of pages) {
        for (const id of ['ficsBoardContainer', 'ficsConnectBtn', 'ficsSoundToggle', 'ficsConsole']) {
            assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
        }
    }
});

test('disconnected and error states keep primary Tables or Seek content in BODY', () => {
    assert.match(shell, /const activeTab = view\.activeTab \|\| selectedLobbyView \|\| 'tables'/);
    assert.match(shell, /if \(activeTab !== 'game'\) view\.bodyMode = 'LOBBY'/);
    assert.doesNotMatch(shell, /title: 'Connection unavailable'|Review the existing FICS connection controls below/);
    assert.match(shell, /No tables loaded\./);
    assert.doesNotMatch(shell, /Connect to FICS to (?:load recently reported games|create a table)/);
    assert.match(shell, /submit\.disabled = !snapshot\.capabilities\.createSeek/);
});

test('hybrid Console uses one capped chronological buffer with subtle approved origins', () => {
    assert.match(client, /\['CAISSA', 'FICS', 'COMMAND', 'GAME', 'ERROR'\]\.includes\(origin\)/);
    assert.match(client, /const entry = rawMessage\.split\('\\n'\).*`\[\$\{safeOrigin\}\] \$\{line\}`/);
    assert.equal((client.match(/messageBuffer\.push\(/g) || []).length, 1);
    assert.match(client, /sanitizeFicsConsoleText\(text\), 'FICS'/);
    assert.match(client, /`> \$\{command\}`, 'COMMAND'/);
});

test('connection messages are emitted only from canonical connection transitions', () => {
    assert.match(client, /const previousState = this\.connectionState/);
    assert.match(client, /if \(state !== previousState\)/);
    for (const message of ['Connecting to FICS as guest...', 'Connected to FICS', 'Connection lost.',
        'Reconnecting to FICS...', 'Disconnected from FICS.', 'Unable to connect to FICS.']) {
        assert.match(client, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.doesNotMatch(shell, /connectionEvent(?:s|Store)|messageBuffer\s*=/);
});

test('latency messaging remains canonical while top session chrome solely owns permanent state', () => {
    assert.match(client, /Number\.isFinite\(this\.latencyMs\) \? ` .*Latency: \$\{this\.latencyMs\} ms` : ''/);
    assert.match(shell, /compactConnectionLabels/);
    assert.match(shell, /mounted\.connectionStatus\.textContent = compactConnectionLabels\[snapshot\.connection\.state\]/);
    assert.doesNotMatch(shell, /consoleSessionStatus|fics-rd7-console-status|ficsRd5ConsoleSummary/);
});

test('navigation advisories deduplicate without suppressing raw FICS traffic', () => {
    assert.match(client, /FICS_CONSOLE_REPEAT_ADVISORIES/);
    assert.match(client, /this\.messageBuffer\.slice\(-6\)\.includes\(entry\)/);
    assert.match(client, /safeOrigin === 'CAISSA'/);
    assert.doesNotMatch(client, /safeOrigin === 'FICS'[^\n]*return false/);
});

test('hybrid messages report delivery honestly and retain raw FICS access', () => {
    assert.match(client, /Seek posted to FICS; server acknowledgement is not available\./);
    assert.match(client, /Draw offer sent to FICS; server acknowledgement is pending\./);
    assert.match(client, /Observing game \$\{state\.gameNumber\}\./);
    assert.match(client, /Game ended: \$\{line\}/);
    assert.match(client, /sendCommand\(\)[\s\S]*?this\.send\(\{[\s\S]*?type: 'command'/);
});

test('Settings holds technical diagnostics while Console and session chrome retain their approved responsibilities', () => {
    assert.match(shell, /connectionDiagnostics\.append\(connectionHeading, gatewayDetails\)/);
    assert.match(shell, /settingsContent\.append\(connectionDiagnostics, sessionColumn\)/);
    assert.doesNotMatch(shell, /settingsContent\.append\([^)]*(?:consoleSection|connectionStatus|identityStatus)/);
    assert.match(shell, /foot\.append\(consoleSection\)/);
    assert.match(shell, /sessionChrome\.append\(sessionControl, settingsButton\)/);
});
