/*
 * CAISSA EAE-008 isolated worker, derived from jalpp/lc0.js commit
 * 482bb4a830287b726ebe7d42f14ab7f5f17c18a0 (GPL-3.0-or-later).
 */
import { env as ortEnv, InferenceSession, Tensor } from 'onnxruntime-web/wasm';

ortEnv.wasm.numThreads = 1;
ortEnv.wasm.proxy = false;
const artifactBase = new URL(import.meta.url).searchParams.get('assetBase') || '/artifacts';
if (!/^\/[A-Za-z0-9/_-]+$/.test(artifactBase)) throw new Error('Invalid artifact path');
ortEnv.wasm.wasmPaths = `${artifactBase}/ort/`;

const testMode = new URL(import.meta.url).searchParams.get('testMode') || 'normal';
const traceUci = testMode === 'trace-uci';
function trace(stage, command) {
  if (traceUci) postMessage({ type: 'uci-trace', stage, command, at: performance.now() });
}
const NativeWorker = globalThis.Worker;
const pthreads = new Set();
globalThis.Worker = class TrackedPthreadWorker extends NativeWorker {
  constructor(url, options) {
    super(url, options);
    pthreads.add(this);
    reportWorkers();
  }
  terminate() {
    pthreads.delete(this);
    reportWorkers();
    return super.terminate();
  }
};

let gotLine;
const lines = [];
let module;
let networkBytes;
let stopSignal;
let terminating = false;
let initialized = false;
let runtimeLaunching = false;
let resolveRuntimeExit;
const runtimeExit = new Promise(resolve => { resolveRuntimeExit = resolve; });
let nextId = 0;
const values = new Map();

addEventListener('message', ({ data }) => {
  if (typeof data === 'string') {
    trace('worker-receive', data);
    if (testMode === 'uci-timeout' && data === 'uci') return;
    if (testMode === 'ready-timeout' && data === 'isready') return;
    deliverLine(data);
    return;
  }
  if (!data || typeof data !== 'object') return;
  if (data.type === 'initialize') {
    if (initialized) return;
    initialized = true;
    networkBytes = new Uint8Array(data.network);
    stopSignal = new Int32Array(data.stopSignal);
    startRuntime().catch(error => fail(error));
  } else if (data.type === 'terminate') {
    cleanup(data.reason || 'requested').catch(error => fail(error));
  } else if (data.type === 'crash') {
    setTimeout(() => { throw new Error('Injected Lc0 worker crash'); }, 0);
  }
});

addEventListener('error', event => {
  postMessage({ type: 'failure', message: event.message || 'Worker error' });
});

Object.assign(globalThis, {
  lc0web_trace_native: (stage, command) => trace(stage, command),
  lc0web_take_stop: () => {
    const requested = stopSignal && Atomics.exchange(stopSignal, 0, 0) === 1;
    if (requested) trace('search-stop-requested', 'stop');
    return requested;
  },
  lc0web_get_line: () => {
    if (lines.length) {
      const line = lines.shift();
      trace('uci-dequeue', line);
      return line;
    }
    return new Promise(resolve => {
      gotLine = line => { trace('uci-dequeue', line); resolve(line); };
    });
  },
  lc0web_is_cpu: () => true,
  lc0web_computation: sessionId => {
    const id = nextId++;
    values.set(id, { input: [], session: values.get(sessionId) });
    return id;
  },
  lc0web_batch_size: id => values.get(id).input.length,
  lc0web_remove: id => values.delete(id),
  lc0web_q_val: (id, sample) => {
    const output = values.get(id).output;
    const wdl = output['/output/wdl'];
    if (!wdl) return output['/output/value'].cpuData[sample];
    return wdl.cpuData[sample * 3] - wdl.cpuData[sample * 3 + 2];
  },
  lc0web_d_val: (id, sample) => values.get(id).output['/output/wdl']?.cpuData[sample * 3 + 1] || 0,
  lc0web_p_val: (id, sample, moveId) => values.get(id).output['/output/policy'].cpuData[sample * 1858 + moveId],
  lc0web_m_val: (id, sample) => values.get(id).output['/output/mlh']?.cpuData[sample] || 0,
  lc0web_add_input: id => values.get(id).input.push([]),
  lc0web_add_plane: (id, index, mask, value) => {
    const array = values.get(id).input[index];
    for (let square = 0; square < 64; square += 1) {
      array.push(mask & 1n ? value : 0);
      mask >>= 1n;
    }
  },
  lc0web_compute: async id => {
    const value = values.get(id);
    const tensor = new Tensor('float32', new Float32Array(value.input.flat()), [value.input.length, 112, 8, 8]);
    value.output = await value.session.run({ '/input/planes': tensor });
  },
  lc0web_network: async (data, length) => {
    const id = nextId++;
    const buffer = Uint8Array.from(module.HEAPU8.subarray(data, data + length));
    const started = performance.now();
    const session = await InferenceSession.create(buffer, { executionProviders: ['wasm'] });
    values.set(id, session);
    postMessage({ type: 'backend-ready', backend: 'onnxruntime-web-wasm-cpu', sessionMs: performance.now() - started });
    return id;
  }
});

postMessage({ type: 'ready-for-network' });

async function startRuntime() {
  if (testMode === 'runtime-failure') throw new Error('Injected runtime initialization failure');
  const runtimeUrl = `${artifactBase}/runtime/lc0.js`;
  const { default: Module } = await import(runtimeUrl);
  if (terminating) return;
  const bytes = networkBytes;
  networkBytes = undefined;
  runtimeLaunching = true;
  Module({
    onExit: code => { trace('runtime-exit', String(code)); resolveRuntimeExit(code); },
    preRun: current => {
      module = current;
      const file = module.FS.open('net.pb.gz', 'w');
      module.FS.write(file, bytes, 0, bytes.length);
      module.FS.close(file);
    },
    arguments: [
      '--preload', '--weights=net.pb.gz', '--backend=js', '--threads=1',
      '--minibatch-size=1', '--nncache=2000'
    ],
    print: text => postMessage({ type: 'stdout', text }),
    printErr: text => postMessage({ type: 'stderr', text })
  });
  postMessage({ type: 'runtime-started' });
}

function deliverLine(line) {
  if (gotLine) {
    const resolve = gotLine;
    gotLine = undefined;
    resolve(line);
  } else lines.push(line);
}

async function cleanup(reason) {
  if (terminating) return;
  terminating = true;
  trace('cleanup-request', reason);
  if (!runtimeLaunching) {
    networkBytes = undefined;
    postMessage({ type: 'terminated', reason, pthreads: pthreads.size, nativeExit: true, neverStarted: true });
    close();
    return;
  }
  deliverLine('quit');
  await runtimeExit;
  const sessions = new Set([...values.values()].filter(value => value && typeof value.release === 'function'));
  for (const session of sessions) await session.release().catch(() => {});
  values.clear();
  postMessage({ type: 'terminated', reason, pthreads: pthreads.size, nativeExit: true });
  close();
}

function reportWorkers() { postMessage({ type: 'worker-count', pthreads: pthreads.size }); }
function fail(error) { postMessage({ type: 'failure', message: error?.message || String(error) }); }
