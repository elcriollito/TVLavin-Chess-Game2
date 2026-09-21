import { Lc0LabRuntime, NETWORK, validateEnvironment } from './lab-runtime.js';

const elements = Object.fromEntries([
  'environment', 'environmentVerdict', 'identity', 'runtimeStatus', 'console',
  'initialize', 'uciTest', 'positionTest', 'repeatedTest', 'stopRestart', 'terminate'
].map(id => [id, document.getElementById(id)]));
const manifest = await fetch('/lab-manifest.json').then(response => response.json());
let runtime = null;

renderDefinition(elements.identity, {
  'Lc0 source': `${manifest.source.lc0ReportedVersion} · ${manifest.source.commit}`,
  Backend: manifest.runtime.backend,
  Network: manifest.network.id,
  'Network SHA-256': manifest.network.sha256,
  License: `${manifest.source.license}; network ${manifest.network.license}`
});

const environment = await validateEnvironment();
renderEnvironment(environment);
renderRuntime();

elements.initialize.addEventListener('click', () => action(async () => {
  runtime = createRuntime();
  const result = await runtime.initialize();
  log(`READY ${JSON.stringify(result.identity)}`);
  setControls(true);
  renderRuntime();
}));
elements.uciTest.addEventListener('click', () => action(async () => { await runtime.uciTest(); log('UCI handshake repeated successfully.'); }));
elements.positionTest.addEventListener('click', () => action(async () => { log(JSON.stringify(await runtime.startPositionTest())); renderRuntime(); }));
elements.repeatedTest.addEventListener('click', () => action(async () => { const results = await runtime.repeatedLegalMoves(20); log(`Repeated legal moves: ${results.length}/20`); renderRuntime(); }));
elements.stopRestart.addEventListener('click', () => action(async () => { log(JSON.stringify(await runtime.stopRestartTest())); renderRuntime(); }));
elements.terminate.addEventListener('click', () => action(async () => { log(JSON.stringify(await runtime.terminate())); setControls(false); renderRuntime(); }));

function createRuntime(options = {}) {
  return new Lc0LabRuntime({
    ...options,
    onEvent: event => {
      if (event.type === 'stdout' || event.type === 'stderr') log(`${event.type === 'stderr' ? '!' : '>'} ${event.line}`);
      renderRuntime();
    }
  });
}

function renderEnvironment(value) {
  renderDefinition(elements.environment, {
    'Secure context': value.secureContext,
    crossOriginIsolated: value.crossOriginIsolated,
    SharedArrayBuffer: value.sharedArrayBuffer,
    WebAssembly: value.webAssembly,
    Atomics: value.atomics,
    'Pinned SIMD/pthread WASM validates': value.runtimeModuleValid,
    'WASM compile': value.runtimeCompileMs == null ? 'not measured' : `${value.runtimeCompileMs.toFixed(1)} ms`
  });
  elements.environmentVerdict.textContent = value.supported ? 'SUPPORTED LAB ENVIRONMENT' : `UNSUPPORTED ENVIRONMENT — ${value.reason}`;
  elements.environmentVerdict.className = `status ${value.supported ? 'pass' : 'fail'}`;
  elements.initialize.disabled = !value.supported;
}

function renderRuntime() {
  const snapshot = runtime?.snapshot();
  renderDefinition(elements.runtimeStatus, {
    State: snapshot?.state || 'NOT STARTED',
    'Live workers': snapshot?.workers ?? 0,
    'Parent workers': snapshot?.parentWorkers ?? 0,
    'pthread workers': snapshot?.pthreadWorkers ?? 0,
    'Peak workers': snapshot?.maxWorkers ?? 0,
    'Cleanup acknowledged': snapshot?.cleanupAcknowledged ?? false,
    'UCI name': snapshot?.identity?.name || '—',
    Backend: snapshot?.identity?.backend || manifest.runtime.backend,
    'First bestmove': snapshot?.timings?.firstBestmoveMs == null ? '—' : `${snapshot.timings.firstBestmoveMs.toFixed(1)} ms`
  });
}

function setControls(ready) {
  for (const id of ['uciTest', 'positionTest', 'repeatedTest', 'stopRestart', 'terminate']) elements[id].disabled = !ready;
  elements.initialize.disabled = ready || !environment.supported;
}

async function action(callback) {
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { await callback(); }
  catch (error) { log(`ERROR ${error.message}`); renderRuntime(); }
  finally {
    const ready = runtime?.state === 'READY';
    setControls(ready);
    elements.terminate.disabled = !runtime?.worker;
  }
}

function log(message) {
  elements.console.textContent += `${message}\n`;
  elements.console.scrollTop = elements.console.scrollHeight;
}

function renderDefinition(target, values) {
  target.replaceChildren(...Object.entries(values).flatMap(([term, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = String(value);
    return [dt, dd];
  }));
}

window.Lc0Lab = Object.freeze({
  manifest,
  environment,
  network: NETWORK,
  createRuntime,
  get runtime() { return runtime; }
});
