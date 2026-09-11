import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('../js/fics-layout-shell.js', import.meta.url), 'utf8');
const redesignStyles = fs.readFileSync(new URL('../css/fics-redesign-shell.css', import.meta.url), 'utf8');
const legacyStyles = fs.readFileSync(new URL('../css/fics-client.css', import.meta.url), 'utf8');

function loadClient() {
    class FakeWebSocket {
        static OPEN = 1;
    }
    const root = { location: { hostname: '127.0.0.1', protocol: 'http:' }, addEventListener() {} };
    const context = {
        window: root,
        document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
        console,
        WebSocket: FakeWebSocket,
        performance: { now: () => 175 },
        setTimeout() { return 1; },
        clearTimeout() {},
        setInterval() { return 1; },
        clearInterval() {},
        Chess: class {}
    };
    context.globalThis = root;
    vm.runInNewContext(clientSource, context, { filename: 'fics-client.js' });
    return { client: root.CaissaFICSClient, FakeWebSocket };
}

function redesignedLiveRegion() {
    return {
        textContent: '',
        className: '',
        closest(selector) {
            if (selector !== '#ficsSection') return null;
            return { classList: { contains(name) { return name === 'fics-rd2-enabled'; } } };
        }
    };
}

test('redesign turns the former board strip into a non-visual live region while legacy rollback remains visible', () => {
    assert.match(redesignStyles,
        /#ficsSection\.fics-rd2-enabled \.fics-pending-state\s*\{[^}]*position:\s*absolute[^}]*width:\s*1px[^}]*height:\s*1px[^}]*min-height:\s*1px[^}]*clip-path:\s*inset\(50%\)/s);
    assert.doesNotMatch(redesignStyles,
        /#ficsSection\.fics-rd2-enabled \.fics-pending-state\s*\{[^}]*left:\s*8px[^}]*right:\s*8px/s);
    assert.match(legacyStyles,
        /\.fics-pending-state\s*\{[^}]*min-height:\s*24px[^}]*padding:\s*4px 8px/s);
});

test('workspace action confirmations route to Console while blocking errors retain an alert', () => {
    assert.match(shellSource,
        /if \(result\?\.ok\) \{[\s\S]*?logToConsole\?\.\(successMessage, options\.origin \|\| 'GAME'\);[\s\S]*?return null;/);
    assert.match(shellSource,
        /role: actionNotice\.type === 'error' \? 'alert' : 'status'/);
    assert.doesNotMatch(shellSource, /actionNotice\s*=\s*\{\s*view:\s*'game',\s*type:\s*'status'/);
    assert.match(shellSource, /consoleAlreadyOwnsEvent:\s*true/);
});

test('delivered and Style12-confirmed moves append once each to Console without expanding it', () => {
    const { client, FakeWebSocket } = loadClient();
    const sent = [];
    client.authenticated = true;
    client.ws = { readyState: FakeWebSocket.OPEN, send(message) { sent.push(message); } };
    client.elements = {
        console: { textContent: '', scrollTop: 0, scrollHeight: 20 },
        consoleContainer: { style: { display: 'none' } },
        pendingState: redesignedLiveRegion(),
        gatewayLatency: { textContent: '' }
    };
    client.messageBuffer = [];

    client.sendMove('e2e4');
    client.pendingMove = { uci: 'e2e4', optimisticFen: 'fixture-fen', sentAt: 100 };
    client.clearPendingMove(true);

    assert.deepEqual(sent, ['e2e4']);
    assert.equal(client.pendingMove, null);
    assert.equal(client.latencyMs, 75);
    assert.equal(client.elements.consoleContainer.style.display, 'none');
    assert.deepEqual(Array.from(client.messageBuffer), [
        '[GAME] Move sent to FICS; server confirmation is pending.',
        '[GAME] Move confirmed by FICS in 75 ms.'
    ]);
    assert.equal(client.messageBuffer.filter(entry => entry.includes('Move sent to FICS')).length, 1);
    assert.equal(client.messageBuffer.filter(entry => entry.includes('Move confirmed by FICS')).length, 1);
    assert.equal(client.elements.pendingState.textContent, 'Move confirmed by FICS in 75 ms.');
    assert.equal(client.elements.pendingState.className, 'fics-pending-state announcement');
});

test('failed move delivery is never reported as sent and canonical pending rollback stays unchanged', () => {
    const { client } = loadClient();
    client.authenticated = true;
    client.ws = null;
    client.elements = {
        console: { textContent: '', scrollTop: 0, scrollHeight: 20 },
        pendingState: { textContent: '', className: '' }
    };
    client.messageBuffer = [];
    client.pendingMove = { uci: 'e2e4', optimisticFen: 'fixture-fen', sentAt: 100 };

    client.sendMove('e2e4');
    client.clearPendingMove(false);

    assert.equal(client.messageBuffer.some(entry => entry.includes('Move sent to FICS')), false);
    assert.equal(client.messageBuffer.some(entry => entry.includes('Move confirmed by FICS')), false);
    assert.equal(client.pendingMove, null);
    assert.equal(client.elements.pendingState.textContent, '');
});

test('Console writer retains raw FICS, COMMAND and ERROR origin behavior', () => {
    const { client } = loadClient();
    client.elements = {
        console: { textContent: '', scrollTop: 0, scrollHeight: 20 },
        pendingState: redesignedLiveRegion()
    };
    client.messageBuffer = [];

    client.logToConsole('raw server line', 'FICS');
    client.logToConsole('> games', 'COMMAND');
    client.logToConsole('Action could not be delivered.', 'ERROR');

    assert.deepEqual(Array.from(client.messageBuffer), [
        '[FICS] raw server line',
        '[COMMAND] > games',
        '[ERROR] Action could not be delivered.'
    ]);
    assert.equal(client.elements.pendingState.textContent, '');
});
