import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const shell = read('js/fics-layout-shell.js');
const client = read('js/fics-client.js');
const styles = read('css/fics-redesign-shell.css');

test('workspace declares exact intrinsic HEAD flexible BODY intrinsic FOOT architecture', () => {
    assert.match(shell, /workspace\.append\(head, body, foot\)/);
    assert.match(shell, /data-fics-workspace-region': 'head', 'data-fics-region-sizing': 'intrinsic'/);
    assert.match(shell, /data-fics-workspace-region': 'body', 'data-fics-region-sizing': 'flexible'/);
    assert.match(shell, /data-fics-workspace-region': 'foot', 'data-fics-region-sizing': 'intrinsic'/);
    assert.match(styles, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
    assert.match(styles, /\.fics-rd2-workspace-body\s*\{[^}]*min-height:\s*0/s);
});

test('HEAD is constructed from only the approved three-tab list', () => {
    assert.match(shell, /Object\.freeze\(\['tables', 'players', 'seek'\]\)/);
    assert.match(shell, /head\.append\(tabList\)/);
    assert.equal((shell.match(/head\.append\(/g) || []).length, 1);
});

test('BODY render paths are product content only', () => {
    for (const view of ['renderTables', 'renderPlayers', 'renderSeek', 'renderGame']) {
        assert.match(shell, new RegExp(`dynamic\\.append\\(${view}\\(`));
    }
    for (const removed of [
        'Connection unavailable',
        'Review the existing FICS connection controls below and try again.',
        'Connect to FICS to load recently reported games.',
        'Connect to FICS to create a table.'
    ]) assert.doesNotMatch(shell, new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(shell, /fics-rd2-placeholder/);
});

test('Tables stays selected while disconnected and uses a minimal empty state', () => {
    assert.match(shell, /view\.activeTab \|\| selectedLobbyView \|\| 'tables'/);
    assert.match(shell, /No tables loaded\./);
    assert.match(shell, /refresh\.disabled = !snapshot\.connection\.authenticated/);
});

test('Seek remains rendered and fails closed without an authenticated capability', () => {
    assert.match(shell, /if \(view\.activeTab === 'seek'\) dynamic\.append\(renderSeek\(snapshot\)\)/);
    assert.match(shell, /submit\.disabled = !snapshot\.capabilities\.createSeek/);
    assert.match(client, /requestSeek\(options = \{\}\)[\s\S]*?if \(!this\.authenticated\)[\s\S]*?code: 'NOT_CONNECTED'/);
});

test('Players is a minimal truthful unsupported product state', () => {
    assert.match(shell, /data-fics-body-view': 'players'/);
    assert.match(shell, /Player directory unavailable\./);
    assert.doesNotMatch(shell, /complete FICS player directory|No player list is shown|\bwho\b|player profile/i);
});

test('workspace availability guidance routes through the one hybrid Console writer', () => {
    assert.match(client, /announceWorkspaceAvailability\(view\)/);
    for (const message of [
        'Connect to FICS to load tables.',
        'Connect to FICS before creating a table.',
        'Player directory is not available yet.'
    ]) assert.match(client, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(shell, /CaissaFICSClient\?\.announceWorkspaceAvailability\?\./);
    assert.equal((client.match(/messageBuffer\.push\(/g) || []).length, 1);
});

test('FOOT is compact Console-only ownership with one canonical session summary', () => {
    assert.match(shell, /foot\.append\(consoleSection\)/);
    assert.match(shell, /fics-rd7-console-status/);
    assert.match(shell, /compactConnectionLabels/);
    assert.doesNotMatch(shell, /ficsRd5ConsoleSummary|consoleSummaryText/);
    assert.match(styles, /\.fics-rd2-workspace-foot\s*\{[^}]*padding:\s*6px 10px/s);
});

test('Settings retains technical diagnostics while Game Mode owns the flexible BODY', () => {
    assert.match(shell, /connectionDiagnostics\.append\(connectionHeading, gatewayDetails\)/);
    assert.match(shell, /settingsContent\.append\(connectionDiagnostics, sessionColumn\)/);
    assert.match(styles, /\.fics-rd4-game\s*\{[^}]*height:\s*100%/s);
    assert.match(styles, /\.fics-rd4-moves\s*\{[^}]*flex:\s*1 1 auto/s);
});

test('responsive and rollback paths preserve a single canonical client and raw Console', () => {
    assert.match(styles, /@media \(max-width: 1100px\)/);
    assert.match(styles, /orientation: landscape/);
    assert.match(shell, /restoreRelocations\(current\.relocations\)/);
    assert.match(client, /sanitizeFicsConsoleText\(text\), 'FICS'/);
    assert.match(client, /sendCommand\(\)[\s\S]*?type: 'command'/);
    assert.equal((client.match(/window\.CaissaFICSClient\s*=\s*CaissaFICSClient/g) || []).length, 1);
    assert.doesNotMatch(shell, /new\s+WebSocket|connectionState\s*=|messageBuffer\s*=/);
});
