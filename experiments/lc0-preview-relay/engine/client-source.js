import { Chess } from 'chess.js';
import { Lc0LabRuntime, sha256 } from '../../lc0-browser-lab/src/lab-runtime.js';

const $ = selector => document.querySelector(selector);
const log = value => { $('#log').textContent += `${value}\n`; };
const meta = name => document.querySelector(`meta[name="${name}"]`)?.content || null;
const RUNTIME_CONFIG = Object.freeze(globalThis.__LC0_RUNTIME_CONFIG__ || {
  basePath: meta('lc0-base-path'), assetBase: meta('lc0-asset-base'),
  relayOrigin: meta('lc0-relay-origin'), mainOrigin: meta('lc0-main-origin'),
  manifestUrl: meta('lc0-manifest-url'), manifestSha256: meta('lc0-manifest-sha256'),
  workerPath: meta('lc0-worker-path')
});
const BASE = RUNTIME_CONFIG.basePath || '/experiments/lc0-preview-relay/engine';
const ARTIFACTS = RUNTIME_CONFIG.assetBase || `${BASE}/artifacts`;
const RELAY_ORIGIN = RUNTIME_CONFIG.relayOrigin || location.origin;
const MANIFEST_URL = RUNTIME_CONFIG.manifestUrl || `${BASE}/lab-manifest.json`;
const MANIFEST_SHA256 = RUNTIME_CONFIG.manifestSha256 ||
  'b1a28b43918980191d62fc9c67892a00a5458126a1005ea139615c9c9b633c2a';
const TRANSPORT_RECONNECT_MS = 20_000;
const TRANSPORT_RETRY_MAX_MS = 2_000;
const ENGINE_MESSAGE_RETRY_MS = 4_000;
const CLEANUP_MESSAGE_RETRY_MS = 15_000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const PIN = Object.freeze({
  providerClass: 'lc0-browser-experimental', version: 'v0.33.0-dev+git.482bb4a',
  sourceCommit: '482bb4a830287b726ebe7d42f14ab7f5f17c18a0',
  uciName: 'Lc0 v0.33.0-dev+git.482bb4a', uciAuthor: 'The LCZero Authors.',
  backend: 'cpu-wasm', networkId: 'CSSLab Maia 1100 v1.0',
  networkSha256: 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
  manifestSha256: MANIFEST_SHA256
});

async function api(action, { sessionId, credential, body, cursor, signal } = {}) {
  const url = new URL('/api/eae011', RELAY_ORIGIN);
  url.searchParams.set('action', action);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  if (cursor != null) url.searchParams.set('cursor', String(cursor));
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    const error = new Error(value.error || `HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return action === 'stream_engine' ? response : response.json();
}

async function verifyArtifacts() {
  const response = await fetch(MANIFEST_URL, { cache: 'force-cache' });
  if (!response.ok) throw new Error('MANIFEST_UNAVAILABLE');
  const raw = await response.arrayBuffer();
  if (await sha256(raw) !== MANIFEST_SHA256) throw new Error('MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(new TextDecoder().decode(raw));
  const version = value => typeof value === 'string' ? value : value?.version;
  if (manifest.source.commit !== PIN.sourceCommit ||
      manifest.source.lc0ReportedVersion !== PIN.version ||
      manifest.network.id !== PIN.networkId ||
      manifest.network.sha256 !== PIN.networkSha256 ||
      version(manifest.toolchain.emscripten) !== '3.1.64' ||
      version(manifest.toolchain.meson) !== '1.8.3' ||
      version(manifest.toolchain.ninja) !== '1.11.1.4' ||
      version(manifest.toolchain.onnxruntimeWeb) !== '1.27.0')
    throw new Error('MANIFEST_IDENTITY_MISMATCH');
  const legacyFolders = { 'lc0.js': 'runtime', 'lc0.wasm': 'runtime',
    'lc0.worker.mjs': 'runtime', 'ort-wasm-simd-threaded.mjs': 'ort',
    'ort-wasm-simd-threaded.wasm': 'ort', 'maia-1100.pb.gz': 'network' };
  for (const [name, expected] of Object.entries(manifest.artifacts || {})) {
    if (expected.verifyBeforeReady === false) continue;
    const url = expected.path ? new URL(expected.path,
      new URL(MANIFEST_URL, location.origin)).href :
      `${ARTIFACTS}/${legacyFolders[name]}/${name}`;
    const asset = await fetch(url, { cache: 'force-cache' });
    if (!asset.ok) throw new Error(`ARTIFACT_UNAVAILABLE_${name}`);
    const bytes = await asset.arrayBuffer();
    if (!expected || bytes.byteLength !== expected.bytes || await sha256(bytes) !== expected.sha256)
      throw new Error(`ARTIFACT_HASH_MISMATCH_${name}`);
  }
  return manifest;
}

function position(command) {
  const chess = command.fen === 'startpos' ? new Chess() : new Chess(command.fen);
  if (!Array.isArray(command.moves) || command.moves.length > 120) throw new Error('POSITION_MOVES_INVALID');
  for (const uci of command.moves) {
    const parts = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
    if (!parts || !chess.move({ from: parts[1], to: parts[2], promotion: parts[3] || 'q' }))
      throw new Error('POSITION_MOVE_ILLEGAL');
  }
  return { chess, uci: `${command.fen === 'startpos' ? 'startpos' : `fen ${command.fen}`}${command.moves.length ? ` moves ${command.moves.join(' ')}` : ''}` };
}

function info(line) {
  if (!line.startsWith('info ')) return null;
  const depth = /\bdepth (\d+)\b/.exec(line), nodes = /\bnodes (\d+)\b/.exec(line);
  const score = /\bscore (cp|mate) (-?\d+)\b/.exec(line), pv = /\bpv ([a-h1-8qrbn\s]+)(?:\s|$)/.exec(line);
  if (!depth || !nodes || !score) return null;
  return { depth: Number(depth[1]), nodes: Number(nodes[1]),
    score: score[1] === 'cp' ? Number(score[2]) : Math.sign(Number(score[2])) * 100000,
    pv: (pv?.[1] || '').trim().slice(0, 400), emittedAt: Date.now() };
}

class RealLc0RelayClient {
  constructor() {
    this.sessionId = null; this.credential = null; this.cursor = 0; this.seq = 0;
    this.controller = null; this.heartbeatTimer = null; this.reconnectTimer = null;
    this.reconnectPromise = null; this.transportState = 'CONNECTING'; this.transportTrace = [];
    this.inbound = Promise.resolve(); this.outbound = Promise.resolve();
    this.runtime = null; this.runtimeInstanceId = crypto.randomUUID();
    this.identity = null; this.active = null; this.currentPosition = null;
    this.commandHistory = []; this.metrics = { rawInfo: 0, sentInfo: 0, forced: 0,
      claimMs: null, artifactVerifyMs: null, runtimeInitMs: null,
      goToLocalBestmoveMs: [], stopToLocalBestmoveMs: [], cleanupLocalMs: null,
      transportSuspended: 0, reconnectSuccess: 0, reconnectFailure: 0,
      localCleanupObserved: false, brokerCleanupAcknowledged: false,
      localCleanupReason: null, localCleanupEvidence: null };
    this.intentionalDisconnect = false; this.closed = false;
    this.heartbeatRequests = new Set();
  }

  recordTransport(event, detail = {}) {
    const entry = Object.freeze({ at: Date.now(), event,
      online: navigator.onLine !== false, visibility: document.visibilityState, ...detail });
    this.transportTrace.push(entry);
    if (this.transportTrace.length > 120) this.transportTrace.splice(0, 40);
    return entry;
  }

  async initialize() {
    if (!crossOriginIsolated || typeof SharedArrayBuffer !== 'function') throw new Error('ISOLATION_REQUIRED');
    $('#environment').textContent = `origin=${location.origin}; isolated=${crossOriginIsolated}; SAB=true`;
    const handoff = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname);
    if (handoff.has('relayOrigin') && handoff.get('relayOrigin') !== RELAY_ORIGIN)
      throw new Error('RELAY_ORIGIN_MISMATCH');
    if (RUNTIME_CONFIG.mainOrigin && handoff.get('mainOrigin') !== RUNTIME_CONFIG.mainOrigin)
      throw new Error('MAIN_ORIGIN_MISMATCH');
    if (handoff.has('sessionId') && handoff.has('claimToken')) {
      this.sessionId = handoff.get('sessionId');
      const claimAt = performance.now();
      const claimed = await api('claim', { body: { sessionId: this.sessionId,
        claimToken: handoff.get('claimToken') } });
      this.metrics.claimMs = performance.now() - claimAt;
      this.credential = claimed.engineCredential;
      sessionStorage.setItem('eae012-engine-session', this.sessionId);
      sessionStorage.setItem('eae012-engine-credential', this.credential);
      sessionStorage.setItem('eae012-engine-cursor', '0');
    } else {
      this.sessionId = sessionStorage.getItem('eae012-engine-session');
      this.credential = sessionStorage.getItem('eae012-engine-credential');
      this.cursor = Number(sessionStorage.getItem('eae012-engine-cursor') || 0);
      if (!this.sessionId || !this.credential) throw new Error('CLAIM_REQUIRED');
    }
    const state = await api('engine_state', { sessionId: this.sessionId, credential: this.credential });
    this.seq = state.lastEngineSeq;
    if (state.phase !== 'CLAIMED') throw new Error('ENGINE_PAGE_RELOAD_REQUIRES_NEW_RUNTIME');
    $('#status').textContent = 'Claimed; verifying pinned assets';
    const artifactsAt = performance.now();
    await verifyArtifacts();
    this.metrics.artifactVerifyMs = performance.now() - artifactsAt;
    this.runtime = new Lc0LabRuntime({ timeoutMs: 30_000, assetBase: ARTIFACTS,
      workerPath: RUNTIME_CONFIG.workerPath || `${BASE}/lc0-worker.js`,
      network: { url: `${ARTIFACTS}/network/maia-1100.pb.gz` },
      onEvent: event => this.runtimeEvent(event) });
    const runtimeAt = performance.now();
    const snapshot = await this.runtime.initialize();
    this.metrics.runtimeInitMs = performance.now() - runtimeAt;
    this.identity = { ...PIN, runtimeInstanceId: this.runtimeInstanceId };
    if (snapshot.identity.name !== PIN.uciName || snapshot.identity.author !== PIN.uciAuthor ||
        snapshot.identity.networkSha256 !== PIN.networkSha256 || snapshot.identity.sourceCommit !== PIN.sourceCommit)
      throw new Error('UCI_IDENTITY_MISMATCH');
    $('#status').textContent = `Lc0 initialized; ${this.runtimeInstanceId}`;
    await this.connect();
  }

  async connect() {
    this.intentionalDisconnect = false;
    const controller = new AbortController(); this.controller = controller;
    const response = await api('stream_engine', { sessionId: this.sessionId,
      credential: this.credential, cursor: this.cursor, signal: controller.signal });
    const recovered = this.transportState === 'TRANSPORT_SUSPENDED';
    this.transportState = 'CONNECTED';
    this.recordTransport(recovered ? 'RECONNECT_SUCCESS' : 'CONNECTED', {
      action: 'stream_engine', direction: 'engine-to-relay',
      correlationId: response.headers.get('x-vercel-id') || response.headers.get('x-request-id')
    });
    if (recovered) this.metrics.reconnectSuccess += 1;
    $('#disconnect').disabled = false; $('#reconnect').disabled = true;
    this.consume(response.body, controller).catch(error => {
      if (error.name !== 'AbortError') {
        this.recordTransport('STREAM_FAILED', { action: 'stream_engine',
          errorName: error.name, errorCode: error.code || null, error: error.message });
        log(`stream ${error.message}`);
      }
    }).finally(() => {
      if (!this.closed && !this.intentionalDisconnect && this.controller === controller) {
        this.transportLost();
        this.scheduleReconnect();
      }
    });
  }

  heartbeat(epoch, controller) {
    this.heartbeatEpoch = epoch;
    clearInterval(this.heartbeatTimer);
    let inFlight = false;
    this.heartbeatTimer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      const request = api('heartbeat_engine', { sessionId: this.sessionId,
        credential: this.credential, body: { epoch, cursor: this.cursor } })
        .catch(error => {
          if (this.closed || this.controller !== controller || this.heartbeatEpoch !== epoch) return;
          log(`heartbeat ${error.message}`);
          controller.abort();
        })
        .finally(() => { inFlight = false; this.heartbeatRequests.delete(request); });
      this.heartbeatRequests.add(request);
    }, 5_000);
  }

  async consume(body, controller) {
    const reader = body.getReader(), decoder = new TextDecoder(); let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const line = frame.split('\n').find(part => part.startsWith('data: '));
          const id = frame.split('\n').find(part => part.startsWith('id: '));
          if (frame.startsWith('event: lease') && line) {
            this.heartbeat(JSON.parse(line.slice(6)).epoch, controller); continue;
          }
          if (!line || !id) continue;
          const item = JSON.parse(line.slice(6)), eventId = Number(id.slice(4));
          this.inbound = this.inbound.then(async () => {
            const accepted = await api('claim_command', { sessionId: this.sessionId,
              credential: this.credential, body: { commandSeq: item.seq } });
            if (accepted.execute) { this.commandHistory.push(item); await this.handle(item); }
            this.cursor = Math.max(this.cursor, eventId);
            sessionStorage.setItem('eae012-engine-cursor', String(this.cursor));
          }).catch(error => { log(`command ${error.message}`); this.fail(error); });
        }
      }
    } finally { if (this.controller === controller) clearInterval(this.heartbeatTimer); }
  }

  async message(type, rest = {}) {
    this.outbound = this.outbound.catch(() => {}).then(async () => {
      const payload = { type, seq: this.seq + 1, ...rest };
      const deadline = performance.now() +
        (type === 'CLEANUP' ? CLEANUP_MESSAGE_RETRY_MS : ENGINE_MESSAGE_RETRY_MS);
      let retryMs = 100, lastError = null;
      while (true) {
        try {
          const result = await api('message', { sessionId: this.sessionId,
            credential: this.credential, body: payload });
          this.seq = payload.seq; log(`--> ${type} ${this.seq}`); return result;
        } catch (error) {
          lastError = error;
          const state = await api('engine_state', { sessionId: this.sessionId,
            credential: this.credential }).catch(() => null);
          if (state?.lastEngineSeq === payload.seq) {
            this.seq = payload.seq;
            this.recordTransport('OUTBOUND_RECONCILED', { type, seq: payload.seq });
            log(`--> ${type} ${this.seq} (reconciled)`);
            return { accepted: true, type, reconciled: true };
          }
          if (state && state.lastEngineSeq !== payload.seq - 1)
            throw new Error('ENGINE_SEQUENCE_DIVERGED');
          if (state) this.seq = state.lastEngineSeq;
          const retryable = !error.status || error.status >= 500 ||
            error.message === 'ENGINE_SEQUENCE_INVALID';
          if (!retryable || error.status === 410 || performance.now() >= deadline) throw lastError;
          this.recordTransport('OUTBOUND_RETRY', { type, seq: payload.seq,
            errorName: error.name, errorCode: error.code || null,
            error: error.message, retryMs });
          await delay(retryMs);
          retryMs = Math.min(500, retryMs * 2);
        }
      }
    });
    return this.outbound;
  }

  async handle(command) {
    log(`<-- ${JSON.stringify(command)}`);
    const ack = () => this.message('ACK', { command: command.type, commandSeq: command.seq,
      ...(command.searchId ? { searchId: command.searchId } : {}) });
    if (command.type === 'HELLO') {
      await ack(); await this.message('READY', { identity: this.identity });
    } else if (command.type === 'POSITION') {
      this.currentPosition = position(command);
      this.runtime.send(`position ${this.currentPosition.uci}`);
      await ack();
    } else if (command.type === 'GO') {
      if (!this.currentPosition || this.active) throw new Error('GO_STATE_INVALID');
      this.active = { searchId: command.searchId, chess: this.currentPosition.chess,
        startLine: this.runtime.lines.length, startedAt: performance.now(), bestmove: null,
        lastInfoAt: 0, transportUncertain: false };
      this.runtime.state = 'SEARCHING';
      this.runtime.send(command.mode === 'infinite' ? 'go infinite' : `go nodes ${command.nodes}`);
      await ack();
    } else if (command.type === 'STOP') {
      if (!this.active || this.active.searchId !== command.searchId) throw new Error('STOP_SEARCH_MISMATCH');
      const stopAt = performance.now();
      this.active.stopRequested = true;
      await ack();
      const active = this.active;
      if (!active.bestmove) this.runtime.send('stop');
      const line = active.bestmove || await this.runtime.waitForLine(value => /^bestmove\s+\S+/.test(value),
        { start: active.startLine, timeout: 2_200 });
      this.metrics.stopToLocalBestmoveMs.push(performance.now() - stopAt);
      const move = /^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/.exec(line)?.[1];
      const parts = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(move || '');
      if (!parts || !active.chess.move({ from: parts[1], to: parts[2], promotion: parts[3] || 'q' }))
        throw new Error('BESTMOVE_ILLEGAL');
      await this.message('BESTMOVE', { searchId: active.searchId, move, emittedAt: Date.now() });
      await this.message('STOPPED', { searchId: active.searchId });
      this.runtime.state = 'READY'; this.active = null;
    } else if (command.type === 'RESET') {
      if (this.active || this.runtime.state !== 'READY') throw new Error('RESET_STATE_INVALID');
      await ack();
      if (command.newGame === true) this.runtime.send('ucinewgame');
      await this.runtime.uciTest();
      await this.message('READY', { identity: this.identity });
    } else if (command.type === 'QUIT') {
      await ack();
      const ended = await this.runtime.terminate('relay-quit');
      this.metrics.forced = ended.forcedTerminations;
      this.metrics.cleanupLocalMs = ended.timings.terminateMs;
      if (ended.parentWorkers || ended.pthreadWorkers || !ended.cleanupAcknowledged || ended.forcedTerminations)
        throw new Error('CLEANUP_NOT_COOPERATIVE');
      clearInterval(this.heartbeatTimer);
      clearTimeout(this.reconnectTimer);
      this.closed = true;
      await Promise.allSettled([...this.heartbeatRequests]);
      await this.message('CLEANUP', { evidence: { parentWorkers: ended.parentWorkers,
        pthreadWorkers: ended.pthreadWorkers, runtimeState: ended.state,
        cleanupAcknowledged: ended.cleanupAcknowledged, forcedTerminations: ended.forcedTerminations } });
      this.controller?.abort();
      for (const key of ['session', 'credential', 'cursor']) sessionStorage.removeItem(`eae012-engine-${key}`);
      $('#status').textContent = 'CLEANED'; $('#disconnect').disabled = true;
    }
  }

  runtimeEvent(event) {
    if (event.type === 'stdout') {
      const line = event.line;
      if (line.startsWith('info ')) {
        this.metrics.rawInfo += 1;
        const active = this.active, parsed = info(line);
        if (active && parsed && !active.stopRequested && !active.transportUncertain &&
            performance.now() - active.lastInfoAt >= 250) {
          active.lastInfoAt = performance.now(); this.metrics.sentInfo += 1;
          this.message('INFO', { searchId: active.searchId, ...parsed }).catch(error => log(`info ${error.message}`));
        }
      } else if (line.startsWith('bestmove ') && this.active) {
        this.active.bestmove = line;
        this.metrics.goToLocalBestmoveMs.push(performance.now() - this.active.startedAt);
      }
    } else if (event.type === 'worker-error' || event.type === 'failure' || event.type === 'force-terminated') {
      log(`${event.type}: ${event.message || ''}`);
      if (!this.closed && this.identity &&
          (event.type === 'worker-error' || event.type === 'failure'))
        this.fail(new Error('ENGINE_RUNTIME_FAILURE'));
    }
  }

  transportLost() {
    clearInterval(this.heartbeatTimer);
    if (this.transportState !== 'TRANSPORT_SUSPENDED') {
      this.transportState = 'TRANSPORT_SUSPENDED';
      this.metrics.transportSuspended += 1;
      this.recordTransport('TRANSPORT_SUSPENDED', {
        action: 'stream_engine', direction: 'engine-to-relay'
      });
    }
    if (this.active && !this.active.bestmove) {
      this.active.transportUncertain = true;
      this.runtime.send('stop');
      log('Transport uncertain: local stop signalled; waiting for matching relay STOP.');
    }
  }

  disconnect() {
    this.intentionalDisconnect = true; this.transportLost(); this.controller?.abort();
    $('#disconnect').disabled = true; $('#reconnect').disabled = false;
    $('#status').textContent = 'DISCONNECTED';
  }

  async reconnect() {
    clearTimeout(this.reconnectTimer);
    const state = await api('engine_state', { sessionId: this.sessionId, credential: this.credential });
    if (state.identity && Object.keys(PIN).concat('runtimeInstanceId')
      .some(key => state.identity[key] !== this.identity[key]))
      throw new Error('RECONNECT_IDENTITY_MISMATCH');
    if (this.active && state.activeSearchId !== this.active.searchId)
      throw new Error('RECONNECT_SEARCH_MISMATCH');
    this.seq = state.lastEngineSeq;
    await this.connect();
    $('#status').textContent = `RECONNECTED ${state.phase}`;
  }

  scheduleReconnect() {
    if (this.reconnectPromise || this.closed || this.intentionalDisconnect) return this.reconnectPromise;
    this.reconnectPromise = (async () => {
      const deadline = performance.now() + TRANSPORT_RECONNECT_MS;
      let retryMs = 250;
      let lastError = null;
      while (!this.closed && !this.intentionalDisconnect && performance.now() < deadline) {
        try {
          await this.reconnect();
          return true;
        } catch (error) {
          lastError = error;
          this.recordTransport('RECONNECT_RETRY', { errorName: error.name,
            errorCode: error.code || null, error: error.message, retryMs });
          if (error.status === 410) break;
          await delay(retryMs);
          retryMs = Math.min(TRANSPORT_RETRY_MAX_MS, retryMs * 2);
        }
      }
      if (!this.closed && !this.intentionalDisconnect) {
        this.metrics.reconnectFailure += 1;
        this.recordTransport('RECONNECT_EXHAUSTED', {
          errorName: lastError?.name || null, errorCode: lastError?.code || null,
          error: lastError?.message || 'lease window exhausted'
        });
        await this.localFailsafeCleanup(lastError?.status === 410
          ? 'transport-lease-expired' : 'transport-reconnect-exhausted');
      }
      return false;
    })().finally(() => {
      this.reconnectPromise = null;
      if (!this.closed && !this.intentionalDisconnect &&
          this.transportState === 'TRANSPORT_SUSPENDED')
        queueMicrotask(() => this.scheduleReconnect());
    });
    return this.reconnectPromise;
  }

  async localFailsafeCleanup(reason) {
    if (this.closed) return this.metrics.localCleanupEvidence;
    clearInterval(this.heartbeatTimer); clearTimeout(this.reconnectTimer);
    this.controller?.abort();
    this.transportState = 'LOCAL_CLEANUP';
    this.metrics.localCleanupReason = reason;
    const active = this.active;
    if (active) {
      try {
        if (!active.bestmove) {
          this.runtime.send('stop');
          active.bestmove = await this.runtime.waitForLine(value => /^bestmove\s+\S+/.test(value),
            { start: active.startLine, timeout: 5_000 });
        }
      } catch (error) {
        this.recordTransport('LOCAL_STOP_FAILED', { errorName: error.name, error: error.message });
      } finally {
        this.runtime.state = 'READY';
        this.active = null;
      }
    }
    const ended = this.runtime ? await this.runtime.terminate(reason) : {
      parentWorkers: 0, pthreadWorkers: 0, state: 'TERMINATED',
      cleanupAcknowledged: true, forcedTerminations: 0, timings: { terminateMs: 0 }
    };
    this.metrics.forced = ended.forcedTerminations;
    this.metrics.cleanupLocalMs = ended.timings?.terminateMs ?? null;
    this.metrics.localCleanupEvidence = {
      parentWorkers: ended.parentWorkers, pthreadWorkers: ended.pthreadWorkers,
      runtimeState: ended.state, cleanupAcknowledged: ended.cleanupAcknowledged,
      forcedTerminations: ended.forcedTerminations
    };
    this.metrics.localCleanupObserved = ended.parentWorkers === 0 && ended.pthreadWorkers === 0 &&
      ended.cleanupAcknowledged === true && ended.forcedTerminations === 0;
    this.metrics.brokerCleanupAcknowledged = false;
    this.closed = true;
    this.transportState = 'CLEANED_LOCAL';
    for (const key of ['session', 'credential', 'cursor'])
      sessionStorage.removeItem(`eae012-engine-${key}`);
    $('#status').textContent = this.metrics.localCleanupObserved
      ? 'CLEANED LOCALLY; broker acknowledgement unavailable'
      : 'LOCAL CLEANUP FAILED';
    this.recordTransport('LOCAL_CLEANUP_COMPLETE', {
      reason, localCleanupObserved: this.metrics.localCleanupObserved,
      brokerCleanupAcknowledged: false, ...this.metrics.localCleanupEvidence
    });
    return this.metrics.localCleanupEvidence;
  }

  async fail(error) {
    if (this.closed) return;
    await this.localFailsafeCleanup('relay-failure').catch(() => {});
    if (this.credential) await this.message('ERROR', { code: 'ENGINE_RUNTIME_FAILURE' }).catch(() => {});
    $('#status').textContent = `FAILED ${error.message}`;
    log(`FAILED ${error.message}`);
  }
}

window.Eae012Engine = new RealLc0RelayClient();
const client = window.Eae012Engine;
client.initialize().catch(error => client.fail(error));
$('#disconnect').addEventListener('click', () => client.disconnect());
$('#reconnect').addEventListener('click', () => client.reconnect().catch(error => client.fail(error)));
