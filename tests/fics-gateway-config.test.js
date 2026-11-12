import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const clientSource = fs.readFileSync(new URL('../js/fics-client.js', import.meta.url), 'utf8');
const classicEntries = ['../index.html', '../yahoo-classic.html'];

function loadClient(hostname, configuredUrl, relayPath = '') {
    const root = { location: { hostname, protocol: 'http:', href: `http://${hostname}/fics` } };
    if (configuredUrl !== undefined) root.CAISSA_FICS_GATEWAY_URL = configuredUrl;
    const document = {
        readyState: 'loading',
        addEventListener() {},
        querySelector(selector) {
            return relayPath && selector === 'meta[name="caissa-fics-hqa-relay"]'
                ? { getAttribute: () => relayPath }
                : null;
        }
    };
    vm.runInNewContext(clientSource, { window: root, document, console, URL });
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

test('explicit insecure configuration is ignored outside loopback', () => {
    assert.equal(
        loadClient('www.caissa-chess.org', 'ws://configured.example/ws').gatewayUrl,
        'wss://fics-gateway.caissa-chess.org/ws'
    );
});

test('Mobile HQA marker selects the same-origin LAN relay without a loopback leak', () => {
    const client = loadClient('192.168.1.78', undefined, '/__caissa_hqa/fics');
    assert.equal(client.gatewayUrl, 'ws://192.168.1.78/__caissa_hqa/fics');
    assert.equal(client.gatewayMode, 'mobile hqa relay');
    assert.doesNotMatch(client.gatewayUrl, /localhost|127\.0\.0\.1/);
});

test('production retains the secure deployed gateway default', () => {
    assert.equal(loadClient('www.caissa-chess.org').gatewayUrl, 'wss://fics-gateway.caissa-chess.org/ws');
});

test('private-LAN mobile origins use the canonical secure gateway, never loopback', () => {
    for (const hostname of ['192.168.50.42', '10.20.30.40', '172.20.10.5']) {
        const client = loadClient(hostname);
        assert.equal(client.gatewayUrl, 'wss://fics-gateway.caissa-chess.org/ws');
        assert.doesNotMatch(client.gatewayUrl, /localhost|127\.0\.0\.1|^ws:/);
    }
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
