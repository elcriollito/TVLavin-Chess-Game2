import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const classicEntries = ['../index.html', '../yahoo-classic.html'];

function loadClient(hostname, configuredUrl) {
    const root = { location: { hostname } };
    if (configuredUrl !== undefined) root.CAISSA_FICS_GATEWAY_URL = configuredUrl;
    const document = { readyState: 'loading', addEventListener() {} };
    vm.runInNewContext(clientSource, { window: root, document, console });
    root.CaissaFICSClient.configureGateway();
    return root.CaissaFICSClient;
}

test('local hosts default to the current Worker endpoint', () => {
    for (const hostname of ['localhost', '127.0.0.1']) {
        assert.equal(loadClient(hostname).gatewayUrl, 'ws://127.0.0.1:8787/ws');
    }
});

test('explicit configuration retains precedence locally', () => {
    assert.equal(loadClient('localhost', 'ws://configured.example/ws').gatewayUrl, 'ws://configured.example/ws');
});

test('production retains the secure deployed gateway default', () => {
    assert.equal(loadClient('www.caissa-chess.org').gatewayUrl, 'wss://fics-gateway.caissa-chess.org/ws');
});

test('Classic CSP permits only the current local Worker origin', () => {
    for (const entry of classicEntries) {
        const html = fs.readFileSync(new URL(entry, import.meta.url), 'utf8');
        const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1] || '';
        assert.match(csp, /connect-src[^;]*\bws:\/\/127\.0\.0\.1:8787\b/);
        assert.doesNotMatch(csp, /ws:\/\/(?:localhost|127\.0\.0\.1):8081/);
        assert.match(csp, /connect-src[^;]*\bwss:\/\/fics-gateway\.caissa-chess\.org\b/);
    }
});
