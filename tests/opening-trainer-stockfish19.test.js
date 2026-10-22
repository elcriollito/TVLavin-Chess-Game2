import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterSource = fs.readFileSync(path.join(root, 'js', 'engine-adapter.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'js', 'opening-trainer', 'stockfish19-client.js'), 'utf8');
const sharedClientSource = fs.readFileSync(path.join(root, 'js', 'engine', 'stockfish-client.js'), 'utf8');
const SF19_WORKER = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.js';
const SF19_WASM = '/assets/vendor/stockfish/19.0.0/stockfish-19-lite-single.wasm';

test('vendored Stockfish 19 assets match provenance and retain the GPLv3 notice', () => {
    const directory = path.join(root, 'assets', 'vendor', 'stockfish', '19.0.0');
    const provenance = JSON.parse(fs.readFileSync(path.join(directory, 'provenance.json'), 'utf8'));
    assert.equal(provenance.engine.version, '19');
    assert.equal(provenance.profile.displayName, 'Stockfish 19 Lite');
    assert.equal(provenance.profile.nnue, true);
    assert.equal(provenance.license, 'GPL-3.0');
    for (const [name, expected] of Object.entries(provenance.files)) {
        const bytes = fs.readFileSync(path.join(directory, name));
        assert.equal(bytes.length, expected.bytes, `${name} byte count`);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256, `${name} SHA-256`);
    }
    assert.match(fs.readFileSync(path.join(directory, 'Copying.txt'), 'utf8'), /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/);
});

class FakeWorker {
    static instances = [];
    static uciName = 'Stockfish 19 Lite WASM';
    static author = 'the Stockfish developers (see AUTHORS file)';

    constructor(url) {
        this.url = url;
        this.messages = [];
        this.terminated = false;
        FakeWorker.instances.push(this);
    }

    postMessage(message) {
        this.messages.push(message);
        if (message === 'uci') {
            queueMicrotask(() => {
                this.emit(`id name ${FakeWorker.uciName}`);
                this.emit(`id author ${FakeWorker.author}`);
                this.emit('option name MultiPV type spin default 1 min 1 max 256');
                this.emit('option name Hash type spin default 16 min 1 max 33554432');
                this.emit('option name Threads type spin default 1 min 1 max 1024');
                this.emit('option name UCI_ShowWDL type check default false');
                this.emit('option name UCI_AnalyseMode type check default false');
                this.emit('option name Ponder type check default false');
                this.emit('uciok');
            });
        } else if (message === 'isready') {
            queueMicrotask(() => this.emit('readyok'));
        } else if (message === 'stop') {
            queueMicrotask(() => this.emit('bestmove e2e4'));
        }
    }

    emit(data) { this.onmessage?.({ data }); }
    terminate() { this.terminated = true; }
}

function fixture() {
    FakeWorker.instances = [];
    FakeWorker.uciName = 'Stockfish 19 Lite WASM';
    FakeWorker.author = 'the Stockfish developers (see AUTHORS file)';
    const window = {
        location: { origin: 'https://caissa.test', pathname: '/opening-trainer' },
        dispatchEvent() {}
    };
    const context = vm.createContext({
        window,
        Worker: FakeWorker,
        WebAssembly,
        URL,
        Error,
        Object,
        Array,
        Number,
        String,
        RegExp,
        Date,
        Math,
        Promise,
        queueMicrotask,
        Map,
        Set,
        setTimeout,
        clearTimeout,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
    });
    vm.runInContext(adapterSource, context, { filename: 'engine-adapter.js' });
    vm.runInContext(clientSource, context, { filename: 'stockfish-client.js' });
    return { window, Client: window.OpeningTrainerStockfishClient };
}

test('Opening Trainer initializes one local Stockfish 19 worker with truthful UCI identity', async () => {
    const { Client } = fixture();
    const client = new Client();
    await Promise.all([client.init(), client.init()]);

    assert.equal(FakeWorker.instances.length, 1, 'concurrent init must not duplicate workers');
    const worker = FakeWorker.instances[0];
    assert.equal(worker.url, SF19_WORKER);
    assert.deepEqual({ ...client.getIdentity() }, {
        displayName: 'Stockfish 19 Lite',
        uciName: 'Stockfish 19 Lite WASM',
        author: 'the Stockfish developers (see AUTHORS file)',
        workerPath: SF19_WORKER,
        wasmPath: SF19_WASM,
        ready: true
    });
    assert.deepEqual(worker.messages.slice(0, 9), [
        'uci',
        'setoption name MultiPV value 1',
        'setoption name Hash value 16',
        'setoption name Threads value 1',
        'setoption name UCI_ShowWDL value true',
        'setoption name UCI_AnalyseMode value true',
        'setoption name Ponder value false',
        'isready',
        'setoption name MultiPV value 1'
    ]);
    client.terminate();
});

test('Opening Trainer keeps CP, mate, bounds and WDL in White perspective', async () => {
    const { Client } = fixture();
    const client = new Client();
    const seen = [];
    client.onInfo(info => seen.push(info));
    await client.init();
    client.setOptions({ multiPV: 3 });
    client.setPositionFEN('8/8/8/8/8/8/8/8 b - - 0 1');
    client.startInfiniteAnalysis({ targetDepth: 20 });
    const worker = FakeWorker.instances[0];
    worker.emit('info depth 18 seldepth 25 multipv 1 score cp 24 lowerbound wdl 450 350 200 nodes 10 nps 100 time 5 pv e7e5');
    worker.emit('info depth 18 multipv 2 score mate -3 upperbound pv e7e5');

    assert.equal(seen[0].scorePerspective, 'white');
    assert.equal(seen[0].whiteScorePawns, -0.24);
    assert.equal(seen[0].score, -24);
    assert.equal(seen[0].scoreBound, 'upper');
    assert.deepEqual({ ...seen[0].whiteWdl }, { wins: 200, draws: 350, losses: 450 });
    assert.equal(seen[0].fen, '8/8/8/8/8/8/8/8 b - - 0 1');
    assert.equal(seen[1].whiteMate, 3);
    assert.equal(seen[1].scoreBound, 'lower');
    client.terminate();
});

test('rapid navigation and Practice cancellation reject stale engine output', async () => {
    const { Client } = fixture();
    const client = new Client();
    const seen = [];
    client.onInfo(info => seen.push(info));
    await client.init();
    const worker = FakeWorker.instances[0];

    client.setPositionFEN('8/8/8/8/8/8/8/8 w - - 0 1');
    client.startInfiniteAnalysis({ targetDepth: 18 });
    worker.emit('info depth 8 multipv 1 score cp 10 pv e2e4');
    client.stop();
    worker.emit('info depth 99 multipv 1 score cp 999 pv e2e4');

    client.setPositionFEN('8/8/8/8/8/8/8/8 b - - 0 1');
    client.startInfiniteAnalysis({ targetDepth: 18 });
    await new Promise(resolve => setTimeout(resolve, 0));
    worker.emit('info depth 9 multipv 1 score cp 20 pv e7e5');

    assert.equal(seen.length, 2);
    assert.equal(seen[0].fen.endsWith('w - - 0 1'), true);
    assert.equal(seen[1].fen.endsWith('b - - 0 1'), true);
    assert.notEqual(seen[0].requestId, seen[1].requestId);
    assert.equal(seen.some(info => info.depth === 99), false);
    assert.ok(worker.messages.filter(message => message === 'stop').length >= 1);
    assert.ok(worker.messages.filter(message => message === 'isready').length >= 2);
    client.terminate();
});

test('infinite attributed analysis has no bot deadline and target stop preserves the worker', async () => {
    const { Client } = fixture();
    const client = new Client();
    const seen = [];
    client.onInfo(info => seen.push(info));
    await client.init();
    client.setPositionFEN('8/8/8/8/8/8/8/8 w - - 0 1');
    client.startInfiniteAnalysis({ targetDepth: 18, stopAtTarget: true });
    const worker = FakeWorker.instances[0];

    assert.equal(worker.messages.at(-1), 'go infinite');
    assert.equal(client.adapter.searchTimer, null, 'bot search deadline must not be armed');
    worker.emit('info depth 18 multipv 1 score cp 12 pv e2e4');
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(seen.length, 1);
    assert.equal(worker.messages.includes('stop'), true);
    assert.equal(worker.terminated, false);
    assert.equal(client.getDebugSnapshot().lastStopReason, 'target-depth');
    assert.equal(client.getDebugSnapshot().workerLifecycle.active, 1);
    client.terminate();
});

test('a genuinely stalled analysis is invalidated and terminates its worker once', async () => {
    const { Client } = fixture();
    const client = new Client();
    const errors = [];
    client.onError(error => errors.push(error));
    await client.init();
    client.setPositionFEN('8/8/8/8/8/8/8/8 w - - 0 1');
    client.startInfiniteAnalysis({ targetDepth: 20, stallTimeoutMs: 1000 });
    await new Promise(resolve => setTimeout(resolve, 1100));

    assert.equal(errors.at(-1)?.code, 'ENGINE_ANALYSIS_STALLED');
    assert.equal(client.getIdentity().ready, false);
    assert.equal(FakeWorker.instances[0].terminated, true);
    assert.equal(client.getDebugSnapshot().workerLifecycle.active, 0);
    assert.equal(client.getDebugSnapshot().workerLifecycle.terminated, 1);
});

test('worker termination ends ownership and an external worker URL fails closed', async () => {
    {
        const { Client } = fixture();
        const client = new Client();
        await client.init();
        client.terminate();
        assert.equal(FakeWorker.instances[0].terminated, true);
        assert.equal(client.getIdentity().ready, false);
    }
    {
        const { Client } = fixture();
        const client = new Client({ workerPath: 'https://evil.test/engine.js' });
        await assert.rejects(client.init(), error => error.code === 'ENGINE_WORKER_NOT_APPROVED');
        assert.equal(FakeWorker.instances.length, 0);
    }
});

test('the Opening Trainer shell loads the shared adapter before its SF19-only client', () => {
    const html = fs.readFileSync(path.join(root, 'opening-trainer.html'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'js', 'opening-trainer', 'page.js'), 'utf8');
    assert.ok(html.indexOf('/js/engine-adapter.js') < html.indexOf('/js/opening-trainer/stockfish19-client.js'));
    assert.match(html, /<strong>Stockfish 19 Lite<\/strong>/);
    assert.match(clientSource, /\/assets\/vendor\/stockfish\/19\.0\.0\/stockfish-19-lite-single\.js/);
    assert.doesNotMatch(clientSource, /stockfish\.worker\.js|stockfish-working\.js/);
    assert.match(sharedClientSource, /\/engine\/stockfish\.worker\.js/);
    assert.doesNotMatch(html, /\/js\/engine\/stockfish-client\.js/);
    assert.match(page, /ENGINE_TARGET_DEPTH = ENGINE_CONSTRAINED_DEVICE \? 18 : 20/);
    assert.match(page, /ENGINE_MULTIPV = ENGINE_CONSTRAINED_DEVICE \? 2 : 3/);
    assert.match(page, /startInfiniteAnalysis\(/);
    assert.doesNotMatch(page, /\.goDepth\(/);
    assert.match(page, /resetEnginePresentation\(\{ practice: true \}\)/);
});
