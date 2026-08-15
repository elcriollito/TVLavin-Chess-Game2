import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = file => fs.readFileSync(file, 'utf8');

test('automated supply-chain policy rejects runtime drift', () => {
    const result = spawnSync(process.execPath, ['scripts/audit-supply-chain.mjs'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Supply-chain policy passed/);
});

test('Clerk browser SDK is exact and protected by the reviewed SHA-384', () => {
    const url = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@6.28.1/dist/clerk.browser.js';
    const integrity = 'sha384-hDYzybzZL06dXvUhFHr0WXKf/sBfpbnhOwxF4xa/m4/hOYAAgZrNpO1n6eJ5np47';
    for (const file of ['about.html', 'library.html', 'premium.html', 'roadmap.html']) {
        const source = read(file);
        assert.match(source, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.ok(source.includes(`integrity="${integrity}"`), file);
        assert.match(source, /crossorigin="anonymous"/);
    }
    const loader = read('js/caissa-auth.js');
    assert.ok(loader.includes(url));
    assert.ok(loader.includes(integrity));
    assert.doesNotMatch(loader, /@latest|@next/);
});

test('static browser libraries and Stockfish execute from reviewed local assets', () => {
    for (const file of ['index.html', 'yahoo-classic.html', 'opening-database.html', 'endgame-library.html', 'endgame-trainer.html']) {
        const source = read(file);
        assert.doesNotMatch(source, /<script[^>]+(?:code\.jquery|cdnjs\.cloudflare|cdn\.jsdelivr)[^>]+(?:jquery|chess(?:board)?)[^>]*>/i, file);
    }
    assert.match(read('client/public/stockfish-worker.js'), /new Worker\('\/engine\/stockfish-working\.js'\)/);
    assert.doesNotMatch(read('client/public/stockfish-worker.js'), /https?:|blob:/);
});

test('lockfile has registry provenance, integrity, and exact security overrides', () => {
  assert.doesNotMatch(read('.gitignore'), /^package-lock\.json$/m);
    const pkg = JSON.parse(read('package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    assert.equal(lock.lockfileVersion, 3);
    assert.deepEqual(pkg.overrides, { lodash: '4.18.1', nanoid: '3.3.18', qs: '6.15.3', undici: '7.29.0' });
    for (const record of Object.values(lock.packages)) {
        if (!record.resolved) continue;
        assert.match(record.resolved, /^https:\/\/registry\.npmjs\.org\//);
        assert.match(record.integrity, /^sha512-/);
    }
});

test('SEC-005 tokens remain independent of nanoid and SEC-012 stays strict', () => {
    const migration = read('api/_lib/identity-migration.js') + read('api/_lib/clerk-migration-verifiers.js');
    assert.doesNotMatch(migration, /nanoid/i);
    const vercel = JSON.parse(read('vercel.json'));
    const globalCsp = vercel.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
    assert.doesNotMatch(globalCsp, /'unsafe-eval'/);
    assert.match(globalCsp, /worker-src 'self'/);
    assert.doesNotMatch(globalCsp, /worker-src[^;]*blob:/);
});
