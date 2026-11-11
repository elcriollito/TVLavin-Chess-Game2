import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const retiredFiles = [
    'play-v2-ipad-analyze-diagnostic.html',
    'css/play-v2-physical-ipad-analyze-diagnostic.css',
    'js/play/play-v2-physical-ipad-analyze-diagnostic.js',
    'js/play/play-v2-physical-ipad-analyze-diagnostic-policy.js',
    'js/play/play-v2-physical-ipad-analyze-diagnostic-boot.js',
    'js/play/play-v2-physical-ipad-analyze-diagnostic-gate.js'
];

test('the legacy iPad Analyze diagnostic implementation is retired', () => {
    for (const path of retiredFiles) assert.equal(fs.existsSync(new URL(`../../${path}`, import.meta.url)), false, path);
    for (const path of ['scripts/build-play-v2.mjs', 'scripts/build-navigation-fallbacks.mjs',
        'js/play/play-route-controller.js', 'js/play/simplified-play-shell.js']) {
        assert.doesNotMatch(read(path), /PhysicalIpadAnalyzeDiagnostic|data-caissa-ipad-analyze-diagnostic|getModeTarget/i, path);
    }
    assert.doesNotMatch(read('server.js'), /resolvePlayV2PhysicalIpadAnalyzeDiagnostic|PLAY_V2_DIAGNOSTIC_CSP/i);
});

test('the retired route remains explicitly unavailable at hosting boundaries', () => {
    const middleware = read('middleware.js');
    const vercel = JSON.parse(read('vercel.json'));
    assert.match(middleware, /play-v2-ipad-analyze-diagnostic\.html/);
    assert.ok(vercel.rewrites.some(rule => rule.source === '/play-v2-ipad-analyze-diagnostic.html'
        && rule.destination === '/play-v2-unavailable.html'));
});

test('old local-server flags cannot reactivate the retired diagnostic', async t => {
    const port = 23000 + (process.pid % 10000);
    const child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: { ...process.env, PORT: String(port), CAISSA_SERVER_HOST: '127.0.0.1',
            CAISSA_PLAY_V2_BETA_STAGE: 'internal',
            CAISSA_PLAY_V2_PHYSICAL_QA: 'ipad-analyze-diagnostic' },
        stdio: ['ignore', 'ignore', 'pipe']
    });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    t.after(() => { if (!child.killed) child.kill(); });

    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
        try {
            const response = await fetch(`${origin}/play/beta/qa/ipad-analyze-diagnostic`, { redirect: 'manual' });
            ready = response.status > 0;
        } catch (_) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }
    assert.equal(ready, true, stderr || 'local server did not start');

    for (const path of ['/play/beta/qa/ipad-analyze-diagnostic',
        '/play/beta/qa/ipad-analyze-diagnostic/bots',
        '/play/beta/qa/ipad-analyze-diagnostic/coach',
        '/play-v2-ipad-analyze-diagnostic.html']) {
        const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
        const body = await response.text();
        assert.match(body, /Play beta is unavailable/i, path);
        assert.doesNotMatch(body, /data-caissa-ipad-analyze-diagnostic|iPad Analyze diagnostic/i, path);
    }
});
