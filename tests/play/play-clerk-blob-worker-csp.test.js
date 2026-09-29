import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectedWorkerDirective = "worker-src 'self' blob:";
const expectedScriptDirective = "script-src 'self' https://cdn.jsdelivr.net";

function directives(csp) {
    return csp.split(';').map(value => value.trim()).filter(Boolean);
}

function assertPlayPolicy(csp, label) {
    const values = directives(csp);
    assert.deepEqual(values.filter(value => value.startsWith('worker-src ')), [expectedWorkerDirective], `${label}: worker-src`);
    assert.deepEqual(values.filter(value => value.startsWith('script-src ')), [expectedScriptDirective], `${label}: script-src unchanged`);
    assert.doesNotMatch(csp, /'unsafe-eval'/, `${label}: unsafe-eval prohibited`);
    assert.doesNotMatch(expectedWorkerDirective, /\*/, `${label}: Worker wildcard prohibited`);
}

function metaCsp(document) {
    return document.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || '';
}

test('all effective Play CSP sources allow only self and Blob Workers', () => {
    const vercel = JSON.parse(read('vercel.json'));
    for (const source of ['/play', '/play/:path*']) {
        const csp = vercel.headers.find(rule => rule.source === source)?.headers
            .find(header => header.key === 'Content-Security-Policy')?.value || '';
        assertPlayPolicy(csp, `vercel ${source}`);
    }

    const middleware = read('middleware.js');
    assertPlayPolicy(middleware.match(/'Content-Security-Policy': "([^"]+)"/)?.[1] || '', 'middleware Play response');

    const server = read('server.js');
    assertPlayPolicy(server.match(/const PLAY_V2_CSP = "([^"]+)"/)?.[1] || '', 'local server Play response');
    const diagnostic = server.match(/const PLAY_V2_DIAGNOSTIC_CSP = "([^"]+)"/)?.[1] || '';
    assert.deepEqual(directives(diagnostic).filter(value => value.startsWith('worker-src ')), [expectedWorkerDirective]);

    for (const file of ['play-v2.html', 'play-v2-public-beta.html', 'play-v2-promotion-qa.html',
        'play-v2-ipad-analyze-diagnostic.html']) {
        assertPlayPolicy(metaCsp(read(file)), `${file} meta policy`);
    }

    const generated = read('api/_lib/play-v2-public-beta-document.js');
    assert.match(generated, /worker-src 'self' blob:;/);
    assert.doesNotMatch(generated, /worker-src 'self';/);
});

test('canonical Play routes map to a Blob-enabled policy without a conflicting self-only policy', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const routePolicy = path => {
        const source = path === '/play' ? '/play' : '/play/:path*';
        return vercel.headers.find(rule => rule.source === source)?.headers
            .find(header => header.key === 'Content-Security-Policy')?.value || '';
    };

    for (const path of ['/play', '/play/games', '/play/bots', '/play/coach']) {
        const csp = routePolicy(path);
        assertPlayPolicy(csp, path);
        assert.doesNotMatch(csp, /worker-src 'self';/);
    }
});

test('Play CSP generator preserves the narrow Clerk Blob Worker allowance', () => {
    const generator = read('scripts/build-play-v2.mjs');
    assert.match(generator, /worker-src \\'self\\' blob:;/);
    assert.match(generator, /html\.includes\("worker-src 'self' blob:;"\)/);
    assert.doesNotMatch(generator, /replace\("worker-src 'self' blob:", "worker-src 'self'"\)/);
});
