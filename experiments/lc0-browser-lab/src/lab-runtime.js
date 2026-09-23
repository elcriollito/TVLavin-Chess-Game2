import { Chess } from 'chess.js';

export const NETWORK = Object.freeze({
  id: 'CSSLab Maia 1100 v1.0',
  url: '/artifacts/network/maia-1100.pb.gz',
  sha256: 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
  bytes: 1313193
});

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function validateEnvironment(runtimeUrl = '/artifacts/runtime/lc0.wasm') {
  const result = {
    secureContext: window.isSecureContext,
    crossOriginIsolated: window.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer === 'function',
    webAssembly: typeof WebAssembly === 'object',
    atomics: typeof Atomics === 'object',
    runtimeModuleValid: false,
    runtimeCompileMs: null,
    runtimeWasmBytes: null,
    supported: false,
    reason: null
  };
  if (!result.secureContext || !result.crossOriginIsolated || !result.sharedArrayBuffer || !result.webAssembly || !result.atomics) {
    result.reason = 'Required secure context, cross-origin isolation, SharedArrayBuffer, WebAssembly, or Atomics is unavailable.';
    return result;
  }
  try {
    const response = await fetch(runtimeUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Runtime WASM unavailable (${response.status})`);
    const bytes = await response.arrayBuffer();
    result.runtimeWasmBytes = bytes.byteLength;
    result.runtimeModuleValid = WebAssembly.validate(bytes);
    if (!result.runtimeModuleValid) throw new Error('Browser rejected the pinned SIMD/pthread WASM module.');
    const started = performance.now();
    await WebAssembly.compile(bytes);
    result.runtimeCompileMs = performance.now() - started;
    result.supported = true;
    return result;
  } catch (error) {
    result.reason = error.message;
    return result;
  }
}

export class Lc0LabRuntime {
  constructor(options = {}) {
    this.network = Object.freeze({ ...NETWORK, ...(options.network || {}) });
    this.assetBase = options.assetBase || '/artifacts';
    this.workerPath = options.workerPath || '/lc0-worker.js';
    this.testMode = options.testMode || 'normal';
    this.timeoutMs = options.timeoutMs || 30_000;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.worker = null;
    this.state = 'CREATED';
    this.lines = [];
    this.stderr = [];
    this.messageWaiters = [];
    this.lineWaiters = [];
    this.parentWorkers = 0;
    this.nestedWorkers = 0;
    this.maxWorkers = 0;
    this.cleanupAcknowledged = false;
    this.forcedTerminations = 0;
    this.generation = 0;
    this.abortController = null;
    this.stopSignal = null;
    this.identity = null;
    this.environment = null;
    this.timings = {};
  }

  workerCount() { return this.parentWorkers + this.nestedWorkers; }

  snapshot() {
    return Object.freeze({
      state: this.state,
      identity: this.identity,
      timings: { ...this.timings },
      workers: this.workerCount(),
      parentWorkers: this.parentWorkers,
      pthreadWorkers: this.nestedWorkers,
      maxWorkers: this.maxWorkers,
      cleanupAcknowledged: this.cleanupAcknowledged,
      forcedTerminations: this.forcedTerminations,
      lines: [...this.lines],
      stderr: [...this.stderr]
    });
  }

  emit(type, detail = {}) {
    this.onEvent(Object.freeze({ type, at: performance.now(), ...detail }));
  }

  updateWorkerPeak() { this.maxWorkers = Math.max(this.maxWorkers, this.workerCount()); }

  async loadNetwork(signal) {
    const started = performance.now();
    const response = await fetch(this.network.url, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`Network unavailable (${response.status})`);
    const bytes = await response.arrayBuffer();
    this.timings.networkLoadMs = performance.now() - started;
    this.timings.networkBytes = bytes.byteLength;
    if (bytes.byteLength !== this.network.bytes) throw new Error(`Network byte-size mismatch: ${bytes.byteLength}`);
    const actualHash = await sha256(bytes);
    if (actualHash !== this.network.sha256) throw new Error(`Network SHA-256 mismatch: ${actualHash}`);
    this.timings.networkSha256 = actualHash;
    return bytes;
  }

  async initialize() {
    if (!['CREATED', 'TERMINATED', 'FAILED'].includes(this.state)) throw new Error(`Cannot initialize from ${this.state}`);
    const generation = ++this.generation;
    this.abortController = new AbortController();
    this.state = 'VALIDATING';
    this.cleanupAcknowledged = false;
    this.environment = await validateEnvironment(`${this.assetBase}/runtime/lc0.wasm`);
    this.assertGeneration(generation);
    this.timings.runtimeCompileMs = this.environment.runtimeCompileMs;
    this.timings.runtimeWasmBytes = this.environment.runtimeWasmBytes;
    if (!this.environment.supported) return this.fail(new Error(`UNSUPPORTED ENVIRONMENT: ${this.environment.reason}`));

    this.state = 'LOADING_NETWORK';
    let networkBytes;
    try { networkBytes = await this.loadNetwork(this.abortController.signal); }
    catch (error) {
      if (error.name === 'AbortError' || this.generation !== generation) this.assertGeneration(generation);
      return this.fail(error);
    }
    this.assertGeneration(generation);

    this.state = 'INITIALIZING';
    const initializationStarted = performance.now();
    this.stopSignal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    const workerUrl = new URL(this.workerPath, location.origin);
    workerUrl.searchParams.set('testMode', this.testMode);
    workerUrl.searchParams.set('assetBase', this.assetBase);
    const worker = new Worker(workerUrl, { type: 'module', name: 'caissa-lc0-lab' });
    this.worker = worker;
    this.parentWorkers = 1;
    this.nestedWorkers = 0;
    this.updateWorkerPeak();
    worker.addEventListener('message', event => {
      if (this.worker === worker && this.state !== 'TERMINATED') this.handleMessage(event.data);
    });
    worker.addEventListener('error', event => {
      event.preventDefault();
      if (this.worker !== worker || this.state === 'TERMINATED') return;
      this.emit('worker-error', { message: event.message });
      this.forceTerminate('worker-error');
      this.rejectWaiters(new Error(`Worker crash: ${event.message}`));
      this.state = 'FAILED';
    });

    try {
      await this.waitForMessage('ready-for-network', this.timeoutMs);
      this.assertGeneration(generation);
      worker.postMessage({ type: 'initialize', network: networkBytes, stopSignal: this.stopSignal.buffer }, [networkBytes]);
      await this.waitForMessage('runtime-started', this.timeoutMs);
      this.assertGeneration(generation);
      this.timings.runtimeLoadMs = performance.now() - initializationStarted;

      const uciStart = this.lines.length;
      const uciSentAt = performance.now();
      this.send('uci');
      await this.waitForLine(line => line === 'uciok', { start: uciStart, timeout: this.timeoutMs });
      this.timings.uciOkMs = performance.now() - uciSentAt;
      const uciLines = this.lines.slice(uciStart);
      const name = uciLines.find(line => line.startsWith('id name '))?.slice(8) || null;
      const author = uciLines.find(line => line.startsWith('id author '))?.slice(10) || null;
      if (!name || !author) throw new Error('UCI identity was incomplete.');

      const readyStart = this.lines.length;
      const readySentAt = performance.now();
      this.send('isready');
      await this.waitForLine(line => line === 'readyok', { start: readyStart, timeout: this.timeoutMs });
      this.timings.readyOkMs = performance.now() - readySentAt;
      this.timings.initializeMs = performance.now() - initializationStarted;
      this.identity = Object.freeze({
        name,
        author,
        sourceCommit: '482bb4a830287b726ebe7d42f14ab7f5f17c18a0',
        backend: 'onnxruntime-web-wasm-cpu',
        networkId: this.network.id,
        networkSha256: this.network.sha256
      });
      this.state = 'READY';
      this.emit('ready', { identity: this.identity });
      return this.snapshot();
    } catch (error) {
      await this.terminate('initialization-failure');
      if (error.code !== 'STALE_INITIALIZATION' && error.name !== 'AbortError') this.state = 'FAILED';
      throw error;
    }
  }

  async uciTest() {
    this.requireReady();
    const start = this.lines.length;
    this.send('uci');
    await this.waitForLine(line => line === 'uciok', { start, timeout: this.timeoutMs });
    const readyStart = this.lines.length;
    this.send('isready');
    await this.waitForLine(line => line === 'readyok', { start: readyStart, timeout: this.timeoutMs });
    return true;
  }

  async search(position = 'startpos', nodes = 1) {
    this.requireReady();
    this.state = 'SEARCHING';
    const start = this.lines.length;
    const started = performance.now();
    this.send(`position ${position}`);
    this.send(`go nodes ${nodes}`);
    const line = await this.waitForLine(value => /^bestmove\s+\S+/.test(value), { start, timeout: this.timeoutMs });
    const bestmove = line.split(/\s+/)[1];
    this.state = 'READY';
    return { bestmove, latencyMs: performance.now() - started, line };
  }

  async startPositionTest() {
    const chess = new Chess();
    const result = await this.search('startpos', 1);
    applyUciMove(chess, result.bestmove);
    this.timings.firstBestmoveMs ??= result.latencyMs;
    return result;
  }

  async repeatedLegalMoves(count = 20) {
    this.requireReady();
    const chess = new Chess();
    const results = [];
    for (let cycle = 0; cycle < count; cycle += 1) {
      if (chess.isGameOver()) chess.reset();
      const fen = chess.fen();
      const result = await this.search(`fen ${fen}`, 1);
      applyUciMove(chess, result.bestmove);
      results.push({ cycle: cycle + 1, fen, ...result });
      if (chess.isGameOver()) chess.reset();
      const reply = chess.moves({ verbose: true })
        .map(move => ({ move, uci: `${move.from}${move.to}${move.promotion || ''}` }))
        .sort((a, b) => a.uci.localeCompare(b.uci))[0];
      if (!reply || !chess.move({ from: reply.move.from, to: reply.move.to, promotion: reply.move.promotion })) {
        throw new Error(`Deterministic reply unavailable at cycle ${cycle + 1}`);
      }
    }
    return results;
  }

  async stopRestartTest() {
    this.requireReady();
    const start = this.lines.length;
    this.state = 'SEARCHING';
    this.send('position startpos');
    this.send('go infinite');
    await delay(120);
    const stopSentAt = performance.now();
    this.send('stop');
    const stoppedLine = await this.waitForLine(line => /^bestmove\s+\S+/.test(line), { start, timeout: this.timeoutMs });
    const stopLatencyMs = performance.now() - stopSentAt;
    const stoppedBestmove = stoppedLine.split(/\s+/)[1];
    applyUciMove(new Chess(), stoppedBestmove);
    this.state = 'READY';
    const readyStart = this.lines.length;
    this.send('isready');
    await this.waitForLine(line => line === 'readyok', { start: readyStart, timeout: this.timeoutMs });
    const restarted = await this.startPositionTest();
    return { stoppedBestmove, stopLatencyMs, restarted };
  }

  send(command) {
    if (!this.worker) throw new Error('Lc0 worker is not active.');
    if (command.startsWith('go ')) Atomics.store(this.stopSignal, 0, 0);
    if (command === 'stop' || command === 'quit') Atomics.store(this.stopSignal, 0, 1);
    this.worker.postMessage(String(command));
    this.emit('stdin', { line: String(command) });
  }

  async crash() {
    if (!this.worker) throw new Error('Lc0 worker is not active.');
    this.worker.postMessage({ type: 'crash' });
    await this.waitForState('FAILED', this.timeoutMs);
    throw new Error('Injected worker crash observed.');
  }

  async terminate(reason = 'requested') {
    this.generation += 1;
    this.abortController?.abort();
    this.abortController = null;
    const worker = this.worker;
    if (!worker) {
      this.state = 'TERMINATED';
      this.parentWorkers = 0;
      this.nestedWorkers = 0;
      return this.snapshot();
    }
    this.state = 'TERMINATING';
    const started = performance.now();
    Atomics.store(this.stopSignal, 0, 1);
    worker.postMessage({ type: 'terminate', reason });
    try { await this.waitForMessage('terminated', 3_000); }
    catch {
      this.cleanupAcknowledged = false;
      worker.terminate();
      this.forcedTerminations += 1;
      this.emit('force-terminated', { reason: 'cooperative-timeout' });
    }
    this.worker = null;
    this.parentWorkers = 0;
    if (this.cleanupAcknowledged) this.nestedWorkers = 0;
    this.timings.terminateMs = performance.now() - started;
    this.state = 'TERMINATED';
    this.rejectWaiters(new Error('Runtime terminated.'));
    this.emit('terminated', { reason, cleanupAcknowledged: this.cleanupAcknowledged });
    return this.snapshot();
  }

  forceTerminate(reason) {
    this.worker?.terminate();
    this.forcedTerminations += 1;
    this.worker = null;
    this.parentWorkers = 0;
    this.nestedWorkers = 0;
    this.cleanupAcknowledged = false;
    this.emit('force-terminated', { reason });
  }

  fail(error) {
    this.state = 'FAILED';
    this.emit('failure', { message: error.message });
    throw error;
  }

  requireReady() {
    if (this.state !== 'READY') throw new Error(`Lc0 runtime is not READY (${this.state}).`);
  }

  assertGeneration(generation) {
    if (this.generation !== generation || this.state === 'TERMINATED') {
      const error = new Error('Initialization was canceled by a newer lifecycle action.');
      error.code = 'STALE_INITIALIZATION';
      throw error;
    }
  }

  handleMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'stdout' || data.type === 'stderr') {
      const line = String(data.text || '').trim();
      (data.type === 'stdout' ? this.lines : this.stderr).push(line);
      this.emit(data.type, { line });
      if (data.type === 'stdout') this.resolveLineWaiters(line);
      return;
    }
    if (data.type === 'uci-trace') {
      this.emit('uci-trace', { stage: data.stage, command: data.command, workerAt: data.at });
      return;
    }
    if (data.type === 'worker-count') {
      this.nestedWorkers = Number(data.pthreads || 0);
      this.updateWorkerPeak();
    }
    if (data.type === 'terminated') {
      this.cleanupAcknowledged = data.pthreads === 0 && data.nativeExit === true;
      this.nestedWorkers = Number(data.pthreads || 0);
    }
    if (data.type === 'failure') {
      const error = new Error(data.message || 'Lc0 worker failure');
      this.emit('failure', { message: error.message });
      this.rejectWaiters(error);
      this.forceTerminate('worker-reported-failure');
      this.state = 'FAILED';
      return;
    }
    this.resolveMessageWaiters(data);
  }

  waitForMessage(type, timeout = this.timeoutMs) {
    return waiter(this.messageWaiters, value => value?.type === type, timeout, `Timed out waiting for ${type}`);
  }

  waitForLine(predicate, { start = 0, timeout = this.timeoutMs } = {}) {
    const existing = this.lines.slice(start).find(predicate);
    if (existing) return Promise.resolve(existing);
    return waiter(this.lineWaiters, predicate, timeout, 'Timed out waiting for UCI output');
  }

  resolveMessageWaiters(value) { resolveWaiters(this.messageWaiters, value); }
  resolveLineWaiters(value) { resolveWaiters(this.lineWaiters, value); }
  rejectWaiters(error) {
    for (const list of [this.messageWaiters, this.lineWaiters]) {
      for (const item of list.splice(0)) { clearTimeout(item.timer); item.reject(error); }
    }
  }

  async waitForState(expected, timeout) {
    const started = performance.now();
    while (performance.now() - started < timeout) {
      if (this.state === expected) return;
      await delay(20);
    }
    throw new Error(`Timed out waiting for state ${expected}`);
  }
}

function applyUciMove(chess, uci) {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!match) throw new Error(`Invalid bestmove syntax: ${uci}`);
  const move = chess.move({ from: match[1], to: match[2], promotion: match[3] || 'q' });
  if (!move) throw new Error(`Illegal bestmove: ${uci}`);
  return move;
}

function waiter(list, predicate, timeout, message) {
  return new Promise((resolve, reject) => {
    const item = { predicate, resolve, reject, timer: null };
    item.timer = setTimeout(() => {
      const index = list.indexOf(item);
      if (index >= 0) list.splice(index, 1);
      reject(new Error(message));
    }, timeout);
    list.push(item);
  });
}

function resolveWaiters(list, value) {
  for (const item of [...list]) {
    if (!item.predicate(value)) continue;
    list.splice(list.indexOf(item), 1);
    clearTimeout(item.timer);
    item.resolve(value);
  }
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
