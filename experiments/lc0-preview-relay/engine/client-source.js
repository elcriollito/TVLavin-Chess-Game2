import { Chess } from 'chess.js';
import { Lc0LabRuntime, sha256 } from '../../lc0-browser-lab/src/lab-runtime.js';

const $ = selector => document.querySelector(selector);
const log = value => { $('#log').textContent += `${value}\n`; };
const BASE = '/experiments/lc0-preview-relay/engine';
const ARTIFACTS = `${BASE}/artifacts`;
const MANIFEST_SHA256 = 'b1a28b43918980191d62fc9c67892a00a5458126a1005ea139615c9c9b633c2a';
const PIN = Object.freeze({
  providerClass: 'lc0-browser-experimental', version: 'v0.33.0-dev+git.482bb4a',
  sourceCommit: '482bb4a830287b726ebe7d42f14ab7f5f17c18a0',
  uciName: 'Lc0 v0.33.0-dev+git.482bb4a', uciAuthor: 'The LCZero Authors.',
  backend: 'cpu-wasm', networkId: 'CSSLab Maia 1100 v1.0',
  networkSha256: 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
  manifestSha256: MANIFEST_SHA256
});

async function api(action, { sessionId, credential, body, cursor, signal } = {}) {
  const url = new URL('/api/eae011', location.origin);
  url.searchParams.set('action', action);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  if (cursor != null) url.searchParams.set('cursor', String(cursor));
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(value.error || `HTTP_${response.status}`);
  }
  return action === 'stream_engine' ? response : response.json();
}

async function verifyArtifacts() {
  const response = await fetch(`${BASE}/lab-manifest.json`, { cache: 'force-cache' });
  if (!response.ok) throw new Error('MANIFEST_UNAVAILABLE');
  const raw = await response.arrayBuffer();
  if (await sha256(raw) !== MANIFEST_SHA256) throw new Error('MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(new TextDecoder().decode(raw));
  if (manifest.source.commit !== PIN.sourceCommit ||
      manifest.source.lc0ReportedVersion !== PIN.version ||
      manifest.network.id !== PIN.networkId ||
      manifest.network.sha256 !== PIN.networkSha256 ||
      manifest.toolchain.emscripten !== '3.1.64' ||
      manifest.toolchain.meson !== '1.8.3' ||
      manifest.toolchain.ninja !== '1.11.1.4' ||
      manifest.toolchain.onnxruntimeWeb !== '1.27.0') throw new Error('MANIFEST_IDENTITY_MISMATCH');
  for (const [folder, names] of Object.entries({
    runtime: ['lc0.js', 'lc0.wasm', 'lc0.worker.mjs'],
    ort: ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'],
    network: ['maia-1100.pb.gz']
  })) {
    for (const name of names) {
      const asset = await fetch(`${ARTIFACTS}/${folder}/${name}`, { cache: 'force-cache' });
      if (!asset.ok) throw new Error(`ARTIFACT_UNAVAILABLE_${name}`);
      const bytes = await asset.arrayBuffer(), expected = manifest.artifacts[name];
      if (!expected || bytes.byteLength !== expected.bytes || await sha256(bytes) !== expected.sha256)
        throw new Error(`ARTIFACT_HASH_MISMATCH_${name}`);
    }
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
    this.inbound = Promise.resolve(); this.outbound = Promise.resolve();
    this.runtime = null; this.runtimeInstanceId = crypto.randomUUID();
    this.identity = null; this.active = null; this.currentPosition = null;
    this.commandHistory = []; this.metrics = { rawInfo: 0, sentInfo: 0, forced: 0,
      claimMs: null, artifactVerifyMs: null, runtimeInitMs: null,
      goToLocalBestmoveMs: [], stopToLocalBestmoveMs: [], cleanupLocalMs: null };
    this.intentionalDisconnect = false; this.closed = false;
    this.heartbeatRequests = new Set();
  }

  async initialize() {
    if (!crossOriginIsolated || typeof SharedArrayBuffer !== 'function') throw new Error('ISOLATION_REQUIRED');
    $('#environment').textContent = `origin=${location.origin}; isolated=${crossOriginIsolated}; SAB=true`;
    const handoff = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname);
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
      workerPath: `${BASE}/lc0-worker.js`,
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
    $('#disconnect').disabled = false; $('#reconnect').disabled = true;
    this.consume(response.body, controller).catch(error => {
      if (error.name !== 'AbortError') log(`stream ${error.message}`);
    }).finally(() => {
      if (!this.closed && !this.intentionalDisconnect && this.controller === controller) {
        this.transportLost();
        this.reconnectTimer = setTimeout(() => this.reconnect().catch(error => this.fail(error)), 500);
      }
    });
  }

  heartbeat(epoch) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      const request = api('heartbeat_engine', { sessionId: this.sessionId,
        credential: this.credential, body: { epoch, cursor: this.cursor } })
        .catch(error => { log(`heartbeat ${error.message}`); this.controller?.abort(); })
        .finally(() => this.heartbeatRequests.delete(request));
      this.heartbeatRequests.add(request);
    }, 1500);
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
          if (frame.startsWith('event: lease') && line) { this.heartbeat(JSON.parse(line.slice(6)).epoch); continue; }
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
      try {
        const result = await api('message', { sessionId: this.sessionId,
          credential: this.credential, body: { type, seq: this.seq + 1, ...rest } });
        this.seq += 1; log(`--> ${type} ${this.seq}`); return result;
      } catch (error) {
        const state = await api('engine_state', { sessionId: this.sessionId,
          credential: this.credential }).catch(() => null);
        if (state) this.seq = state.lastEngineSeq;
        throw error;
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
      await ack(); await this.runtime.uciTest();
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
            performance.now() - active.lastInfoAt >= 150) {
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

  async fail(error) {
    if (this.closed) return;
    this.closed = true; clearInterval(this.heartbeatTimer); clearTimeout(this.reconnectTimer);
    this.controller?.abort();
    if (this.runtime) await this.runtime.terminate('relay-failure').catch(() => {});
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
