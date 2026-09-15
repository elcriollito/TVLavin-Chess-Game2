import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { Chess } from 'chess.js';

const ROOT = new URL('../../', import.meta.url);
const read = path => fs.readFileSync(new URL(path, ROOT), 'utf8');
const manifest = JSON.parse(read('tests/fixtures/engine18/engine18-002-provider.json'));
const plain = value => JSON.parse(JSON.stringify(value));

function registryFixture() {
    const audit = { created: 0, active: 0, maximum: 0, terminated: 0, workers: [] };
    class FakeWorker {
        constructor(url) {
            this.url = String(url);
            this.messages = [];
            this.terminated = false;
            audit.created += 1;
            audit.active += 1;
            audit.maximum = Math.max(audit.maximum, audit.active);
            audit.workers.push(this);
        }
        postMessage(message) { this.messages.push(String(message)); }
        emit(message) { this.onmessage?.({ data: message }); }
        terminate() {
            if (this.terminated) return;
            this.terminated = true;
            audit.terminated += 1;
            audit.active -= 1;
        }
    }
    class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } }
    const window = {
        location: { pathname: '/play', origin: 'https://caissa.test' },
        Worker: FakeWorker,
        WebAssembly: {},
        dispatchEvent: () => {},
        CAISSA_DEBUG: false
    };
    const context = {
        window, globalThis: window, Worker: FakeWorker, WebAssembly: window.WebAssembly, CustomEvent,
        Object, Number, String, Boolean, Array, Map, Set, WeakSet, Uint32Array, Date, Math, JSON,
        Error, RegExp, console, setTimeout: () => 1, clearTimeout: () => {}
    };
    vm.runInNewContext(read('js/engine-adapter.js'), context, { filename: 'js/engine-adapter.js' });
    vm.runInNewContext(read('js/engine-registry.js'), context, { filename: 'js/engine-registry.js' });
    return { window, audit };
}

function normalizedDigest(path) {
    const bytes = Buffer.from(read(path).replace(/\r\n/g, '\n'), 'utf8');
    return { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

test('ENGINE18-002 registers one explicit inactive, versioned SF18 gameplay provider', () => {
    const { window, audit } = registryFixture();
    const provider = plain(window.EngineRegistry.getGameplayProvider(manifest.provider.providerKey));
    assert.equal(audit.created, 0, 'registration must stay lazy');
    assert.deepEqual(provider, {
        providerKey: manifest.provider.providerKey,
        engineId: manifest.provider.providerKey,
        name: manifest.provider.name,
        version: manifest.provider.version,
        execution: 'wasm',
        workerPath: manifest.provider.worker,
        wasmPath: manifest.provider.wasm,
        expectedUci: { name: manifest.provider.expectedName, author: manifest.provider.expectedAuthor },
        defaultOptions: manifest.provider.defaultOptions,
        roles: manifest.provider.roles,
        capabilities: { singleThreaded: true, chess960: false, attributedRequests: true, analysisInfo: true },
        enabled: false,
        selectedByDefault: false,
        notes: 'ENGINE18-002 inactive provider; never eligible for Bots'
    });
    assert.equal(window.EngineRegistry.get(manifest.provider.providerKey), null,
        'inactive provider must not enter the production selectable engine catalog');
    assert.equal(window.EngineRegistry.getEnabled().some(item => item.id === manifest.provider.providerKey), false);
});

test('role routing stays frozen and the missing, invalid, false, and true gate inputs fail closed', () => {
    const { window, audit } = registryFixture();
    const registry = window.EngineRegistry;
    assert.equal(registry.GAMEPLAY_FEATURE_GATES.CAISSA_PLAY_SF18_GAMEPLAY, false);
    const gateInputs = [undefined, {}, { CAISSA_PLAY_SF18_GAMEPLAY: false },
        { CAISSA_PLAY_SF18_GAMEPLAY: 'true' }, { CAISSA_PLAY_SF18_GAMEPLAY: 1 },
        { CAISSA_PLAY_SF18_GAMEPLAY: true }];
    for (const role of ['game', 'coach-active']) {
        for (const gates of gateInputs) {
            assert.equal(registry.resolveRoleProvider(role, gates).providerKey, 'legacy-stockfish-2019');
        }
    }
    assert.equal(registry.resolveRoleProvider('bots', { CAISSA_PLAY_SF18_GAMEPLAY: true }).providerKey,
        'legacy-stockfish-2019');
    assert.equal(registry.resolveRoleProvider('analyze-review').providerKey, 'stockfish-18-lite');
    assert.equal(registry.resolveRoleProvider('manual-analysis').providerKey, 'stockfish-18-lite');
    assert.equal(registry.resolveRoleProvider('unknown'), null);
    assert.equal(audit.created, 0);
});

test('Bots cannot construct or resolve the SF18 gameplay provider', () => {
    const { window, audit } = registryFixture();
    const registry = window.EngineRegistry;
    assert.equal(registry.getGameplayProvider('stockfish-18-gameplay').roles.includes('bots'), false);
    assert.equal(registry.createInactiveGameplayProviderForVerification('bots', {
        verificationToken: 'ENGINE18-002'
    }), null);
    const bot = registry.createRoleEngine('bots', {
        featureGates: { CAISSA_PLAY_SF18_GAMEPLAY: true },
        adapterOptions: { autoStart: false }
    });
    assert.equal(bot.id, 'stockfish');
    assert.equal(bot.workerPath, '/engine/stockfish-working.js');
    assert.equal(audit.created, 0);
    bot.terminate('test-complete');
});

test('inactive-provider verification is token-bound, lazy, attributed to exact FEN, and terminates cleanly', async () => {
    const { window, audit } = registryFixture();
    const registry = window.EngineRegistry;
    assert.equal(registry.createInactiveGameplayProviderForVerification('game'), null);
    const engine = registry.createInactiveGameplayProviderForVerification('game', {
        verificationToken: 'ENGINE18-002',
        adapterOptions: { autoStart: false, owner: 'engine18-002-smoke', generationIdFactory: () => 'request:fixed-fen' }
    });
    assert.ok(engine);
    assert.equal(audit.created, 0);
    const started = engine.start();
    assert.equal(audit.created, 1);
    const worker = audit.workers[0];
    assert.equal(worker.url, manifest.provider.worker);
    assert.deepEqual(worker.messages, ['uci']);
    worker.emit(`id name ${manifest.provider.expectedName}`);
    worker.emit(`id author ${manifest.provider.expectedAuthor}`);
    worker.emit('uciok');
    assert.deepEqual(worker.messages.slice(-5), [
        'setoption name MultiPV value 1',
        'setoption name MultiPV value 1',
        'setoption name Hash value 16',
        'setoption name Threads value 1',
        'isready'
    ]);
    worker.emit('readyok');
    await started;
    assert.deepEqual(plain(engine.getUciIdentity()), {
        name: manifest.provider.expectedName,
        author: manifest.provider.expectedAuthor,
        validated: true
    });

    const info = [];
    let delivered = null;
    const generation = engine.getBestMoveAttributed(manifest.smoke.fen, (bestmove, ponder, resultGeneration) => {
        delivered = { bestmove, ponder, generation: resultGeneration, canonicalFen: engine.currentFen };
    }, { depth: manifest.smoke.depth, onInfo: item => info.push(plain(item)) });
    assert.equal(generation, 'request:fixed-fen:1');
    assert.deepEqual(worker.messages.slice(-2), [
        `position fen ${manifest.smoke.fen}`,
        `go depth ${manifest.smoke.depth}`
    ]);
    worker.emit('info depth 8 seldepth 10 score cp 31 nodes 1200 pv f1b5 a7a6');
    worker.emit('bestmove f1b5 ponder a7a6');
    assert.equal(info.at(-1).depth, 8);
    assert.deepEqual(delivered, {
        bestmove: 'f1b5', ponder: 'a7a6', generation, canonicalFen: manifest.smoke.fen
    });
    const game = new Chess(manifest.smoke.fen);
    assert.ok(game.move({ from: delivered.bestmove.slice(0, 2), to: delivered.bestmove.slice(2, 4) }));
    engine.send('isready');
    assert.equal(worker.messages.at(-1), 'isready');
    worker.emit('readyok');
    engine.terminate('engine18-002-smoke-complete');
    assert.equal(worker.terminated, true);
    assert.deepEqual({ active: audit.active, maximum: audit.maximum, terminated: audit.terminated },
        { active: 0, maximum: 1, terminated: 1 });
});

test('SF18 verification provider rejects a mismatched UCI identity without fallback', async () => {
    const { window, audit } = registryFixture();
    const engine = window.EngineRegistry.createInactiveGameplayProviderForVerification('coach-active', {
        verificationToken: 'ENGINE18-002', adapterOptions: { autoStart: false }
    });
    const started = engine.start();
    const worker = audit.workers[0];
    worker.emit('id name Stockfish 2019-08-15 Multi-Variant');
    worker.emit('id author D. Dugovic, F. Fichter et al.');
    worker.emit('uciok');
    await assert.rejects(started, error => error.code === 'ENGINE_IDENTITY_MISMATCH');
    assert.equal(worker.terminated, true);
    assert.equal(engine.engine, null);
    assert.equal(audit.created, 1, 'identity failure must not create a legacy fallback Worker');
});

test('versioned assets, same-origin approval, MIME, CSP, and immutable hashes satisfy delivery contract', () => {
    const worker = normalizedDigest(manifest.assets.worker.path);
    const legacy = normalizedDigest(manifest.assets.legacy.path);
    const wasmBytes = fs.readFileSync(new URL(manifest.assets.wasm.path, ROOT));
    assert.deepEqual(worker, {
        bytes: manifest.assets.worker.normalizedBytes,
        sha256: manifest.assets.worker.normalizedSha256
    });
    assert.deepEqual(legacy, {
        bytes: manifest.assets.legacy.normalizedBytes,
        sha256: manifest.assets.legacy.normalizedSha256
    });
    assert.equal(wasmBytes.length, manifest.assets.wasm.bytes);
    assert.equal(crypto.createHash('sha256').update(wasmBytes).digest('hex'), manifest.assets.wasm.sha256);

    const adapter = read('js/engine-adapter.js');
    const server = read('server.js');
    const vercel = JSON.parse(read('vercel.json'));
    assert.match(adapter, new RegExp(`'${manifest.provider.worker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert.match(server, /'\.wasm': 'application\/wasm'/);
    assert.match(server, /worker-src 'self'/);
    const playHeader = vercel.headers.find(rule => rule.source === '/play')?.headers
        .find(header => header.key === 'Content-Security-Policy')?.value || '';
    assert.match(playHeader, /worker-src 'self'/);
    assert.doesNotMatch(playHeader, /worker-src[^;]*(?:https?:|\*)/);
    assert.equal(new URL(manifest.provider.worker, 'https://www.caissa-chess.org').origin,
        'https://www.caissa-chess.org');
});

test('protected runtime, search-policy, Bots, Analyze, board, renderer, and layout sources remain unchanged', () => {
    const baseline = JSON.parse(read('tests/fixtures/engine18/engine18-001-contracts.json'));
    for (const [path, expected] of Object.entries(baseline.normalizedSourceGuards)) {
        if (path === 'js/engine-registry.js') continue;
        assert.deepEqual(normalizedDigest(path), expected, path);
    }
});
