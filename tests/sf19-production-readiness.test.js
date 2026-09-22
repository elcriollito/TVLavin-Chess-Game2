import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const cspFor = source => config.headers
    .find(rule => rule.source === source)?.headers
    .find(header => header.key === 'Content-Security-Policy')?.value || '';

test('SF19 versioned assets receive the same narrow WASM execution policy as SF18', () => {
    const sf18Csp = cspFor('/assets/vendor/stockfish/18.0.0/:path*');
    const sf19Csp = cspFor('/assets/vendor/stockfish/19.0.0/:path*');

    assert.ok(sf19Csp, 'SF19 requires an asset-specific worker CSP');
    assert.equal(sf19Csp, sf18Csp);
    assert.match(sf19Csp, /script-src 'self' 'wasm-unsafe-eval'/);
    assert.doesNotMatch(sf19Csp, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
    assert.match(sf19Csp, /worker-src 'self'/);
    assert.match(sf19Csp, /object-src 'none'/);
});

test('SF19 readiness correction does not broaden the global site policy', () => {
    const globalCsp = cspFor('/(.*)');

    assert.ok(globalCsp);
    assert.doesNotMatch(globalCsp, /'wasm-unsafe-eval'/);
    assert.doesNotMatch(globalCsp, /(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
});
