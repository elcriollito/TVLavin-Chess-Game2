import { Chess } from '/assets/vendor/chess.js/chess-1.4.0.esm.js';

const $ = selector => document.querySelector(selector);
const log = value => { $('#log').textContent += `${value}\n`; };
$('#environment').textContent = `origin=${location.origin}; isolated=${crossOriginIsolated}`;

async function api(action, { sessionId, body, signal, cursor } = {}) {
  const token = await window.CAISSA_AUTH.getToken();
  if (!token) throw new Error('CAISSA_SIGN_IN_REQUIRED');
  const url = new URL('/api/eae011', location.origin);
  url.searchParams.set('action', action);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  if (cursor != null) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {})
  });
  if (!response.ok) {
    let value; try { value = await response.json(); } catch { value = {}; }
    throw new Error(value.error || `HTTP_${response.status}`);
  }
  return action === 'stream_main' ? response : response.json();
}

class MainPreviewClient {
  constructor() {
    this.sessionId = null; this.claimToken = null; this.seq = 0; this.cursor = 0;
    this.events = []; this.waiters = []; this.controller = null; this.running = false;
    this.timings = []; this.heartbeatTimer = null; this.identity = null;
    this.chess = new Chess(); this.moves = [];
  }

  emit(value) {
    const item = { ...value, at: performance.now(), receivedAt: Date.now() };
    this.events.push(item); log(`<-- ${JSON.stringify(value)}`);
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(item)) continue;
      clearTimeout(waiter.timer);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(item);
    }
  }

  waitFor(predicate, start = this.events.length, ms = 8_000) {
    const found = this.events.slice(start).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error('EVENT_TIMEOUT'));
      }, ms) };
      this.waiters.push(waiter);
    });
  }

  async initialize() {
    await window.CAISSA_AUTH.whenReady();
    $('#auth').textContent = window.CAISSA_AUTH.isSignedIn
      ? `Signed in to CAISSA as ${window.CAISSA_AUTH.userId}` : 'Sign in to CAISSA to create a session.';
    if (!window.CAISSA_AUTH.isSignedIn) return;
    $('#create').disabled = false;
    this.config = await fetch('/api/eae011?action=config').then(response => response.json());
    const saved = sessionStorage.getItem('eae012-main-session');
    if (saved) {
      try {
        const info = await api('inspect', { sessionId: saved });
        this.sessionId = saved; this.seq = info.state.lastCommandSeq;
        this.cursor = Number(sessionStorage.getItem('eae012-main-cursor') || 0);
        this.identity = info.state.identity;
        await this.connect();
        $('#status').textContent = `Recovered ${saved}`;
        $('#run').disabled = !this.identity;
      } catch { sessionStorage.removeItem('eae012-main-session'); }
    }
  }

  async create(competitionId = `preview-${Date.now()}`) {
    const result = await api('create', { body: { competitionId, participantRole: 'white' } });
    this.sessionId = result.sessionId; this.claimToken = result.claimToken;
    this.cursor = 0; this.seq = 0; this.events = []; this.identity = null;
    this.chess = new Chess(); this.moves = [];
    sessionStorage.setItem('eae012-main-session', this.sessionId);
    sessionStorage.setItem('eae012-main-cursor', '0');
    await this.connect();
    $('#open').disabled = false; $('#run').disabled = false;
    $('#status').textContent = `Session ${this.sessionId}; claim expires ${new Date(result.expiresAt).toISOString()}`;
    return result;
  }

  openIsolated() {
    if (!this.claimToken) throw new Error('CLAIM_NOT_AVAILABLE');
    const url = new URL('/experiments/lc0-preview-relay/engine/index.html', this.config.engineOrigin);
    url.hash = new URLSearchParams({ sessionId: this.sessionId,
      claimToken: this.claimToken, mainOrigin: location.origin }).toString();
    window.open(url, '_blank', 'noopener');
  }

  async connect() {
    this.controller = new AbortController();
    const response = await api('stream_main', { sessionId: this.sessionId,
      cursor: this.cursor, signal: this.controller.signal });
    $('#disconnect').disabled = false; $('#reconnect').disabled = true;
    this.consume(response.body, this.controller).catch(error => {
      if (error.name !== 'AbortError') log(error.message);
    });
  }

  heartbeat(epoch) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => api('heartbeat_main', { sessionId: this.sessionId,
      body: { epoch, cursor: this.cursor } }).catch(error => { log(`heartbeat ${error.message}`); this.disconnect(); }), 1500);
  }

  async consume(body, controller) {
    const reader = body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    try { while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const line = frame.split('\n').find(part => part.startsWith('data: '));
        const id = frame.split('\n').find(part => part.startsWith('id: '));
        if (frame.startsWith('event: lease') && line) {
          this.heartbeat(JSON.parse(line.slice(6)).epoch);
          continue;
        }
        if (id) {
          this.cursor = Math.max(this.cursor, Number(id.slice(4)));
          sessionStorage.setItem('eae012-main-cursor', String(this.cursor));
        }
        if (line) {
          const item = JSON.parse(line.slice(6));
          if (item.type === 'READY') {
            if (!this.verifyIdentity(item.identity)) { this.emit({ type: 'ERROR', code: 'ENGINE_IDENTITY_INVALID' }); continue; }
            this.identity = item.identity;
            $('#identity').textContent = `${item.identity.uciName} · ${item.identity.networkId} · ${item.identity.runtimeInstanceId}`;
          }
          this.emit(item);
        }
      }
    } } finally { if (this.controller === controller) clearInterval(this.heartbeatTimer); }
  }

  disconnect() {
    clearInterval(this.heartbeatTimer);
    this.controller?.abort();
    $('#disconnect').disabled = true; $('#reconnect').disabled = false;
  }

  async send(type, extra = {}) {
    const seq = this.seq + 1, started = performance.now();
    const result = await api('command', { sessionId: this.sessionId,
      body: { type, seq, ...extra } });
    this.seq = seq;
    this.timings.push({ type, seq, acceptanceMs: performance.now() - started });
    return result;
  }

  async sendAndAck(type, extra = {}) {
    const start = this.events.length, sent = performance.now();
    const { seq } = await this.send(type, extra);
    await this.waitFor(item => item.type === 'ACK' && item.command === type &&
      item.commandSeq === seq, start);
    this.timings.push({ type, seq, ackMs: performance.now() - sent });
  }

  verifyIdentity(identity) {
    return identity?.providerClass === 'lc0-browser-experimental' &&
      identity.version === 'v0.33.0-dev+git.482bb4a' &&
      identity.sourceCommit === '482bb4a830287b726ebe7d42f14ab7f5f17c18a0' &&
      identity.uciName === 'Lc0 v0.33.0-dev+git.482bb4a' &&
      identity.uciAuthor === 'The LCZero Authors.' && identity.backend === 'cpu-wasm' &&
      identity.networkId === 'CSSLab Maia 1100 v1.0' &&
      identity.networkSha256 === 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4' &&
      identity.manifestSha256 === 'b1a28b43918980191d62fc9c67892a00a5458126a1005ea139615c9c9b633c2a' &&
      /^[0-9a-f-]{36}$/.test(identity.runtimeInstanceId || '');
  }

  async startEngine() {
    if (!this.identity) {
      await this.sendAndAck('HELLO');
      const ready = await this.waitFor(item => item.type === 'READY' && this.verifyIdentity(item.identity), 0, 40_000);
      this.identity = ready.identity;
    }
    return this.identity;
  }

  async setPosition(fen = 'startpos', moves = []) {
    const chess = fen === 'startpos' ? new Chess() : new Chess(fen);
    for (const uci of moves) {
      const parts = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
      if (!parts || !chess.move({ from: parts[1], to: parts[2], promotion: parts[3] || 'q' }))
        throw new Error('POSITION_MOVE_ILLEGAL');
    }
    await this.sendAndAck('POSITION', { fen, moves });
    this.chess = chess; this.moves = [...moves];
  }

  async search({ mode = 'nodes', nodes = 1, requireInfo = false } = {}) {
    const searchId = `search_${crypto.randomUUID()}`;
    await this.sendAndAck('GO', { searchId, mode, ...(mode === 'nodes' ? { nodes } : {}) });
    if (requireInfo) await this.waitFor(item => item.type === 'INFO' && item.searchId === searchId, 0, 15_000);
    else await new Promise(resolve => setTimeout(resolve, 200));
    const stopStart = this.events.length, stopSent = performance.now();
    await this.sendAndAck('STOP', { searchId });
    const best = await this.waitFor(item => item.type === 'BESTMOVE' && item.searchId === searchId, stopStart, 15_000);
    const parts = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(best.move || '');
    if (!parts) throw new Error('BESTMOVE_SYNTAX_INVALID');
    const move = this.chess.move({ from: parts[1], to: parts[2], promotion: parts[3] || 'q' });
    if (!move) throw new Error('BESTMOVE_ILLEGAL');
    this.moves.push(best.move);
    await this.waitFor(item => item.type === 'STOPPED' && item.searchId === searchId, stopStart, 15_000);
    this.timings.push({ type: 'STOP', searchId, terminalMs: performance.now() - stopSent });
    log(`Legal BESTMOVE ${best.move} (${move.san})`);
    return { searchId, move: best.move, san: move.san };
  }

  async reuse(searchId) {
    await this.sendAndAck('RESET', { searchId });
    await this.waitFor(item => item.type === 'READY' && this.verifyIdentity(item.identity), 0, 15_000);
    const gate = await api('advance', { sessionId: this.sessionId,
      body: { mode: 'reuse', searchId } });
    if (!gate.advanceAllowed) throw new Error('REUSE_GATE_CLOSED');
  }

  async finish(searchId) {
    const quitStart = this.events.length, quitSent = performance.now();
    await this.sendAndAck('QUIT');
    const cleanup = await this.waitFor(item => item.type === 'CLEANUP', quitStart, 15_000);
    if (cleanup.evidence?.parentWorkers !== 0 || cleanup.evidence?.pthreadWorkers !== 0 ||
        cleanup.evidence?.runtimeState !== 'TERMINATED' || !cleanup.evidence?.cleanupAcknowledged ||
        cleanup.evidence?.forcedTerminations !== 0) throw new Error('CLEANUP_EVIDENCE_INVALID');
    this.timings.push({ type: 'QUIT', cleanupMs: performance.now() - quitSent });
    const gate = await api('advance', { sessionId: this.sessionId,
      body: { mode: 'release', searchId } });
    if (!gate.advanceAllowed) throw new Error('GATE_CLOSED');
    await api('terminate', { sessionId: this.sessionId, body: {} });
    sessionStorage.removeItem('eae012-main-session');
    sessionStorage.removeItem('eae012-main-cursor');
    this.controller?.abort();
    $('#status').textContent = `Real Lc0 clean; session terminated.`;
    return { gate, cleanup };
  }

  async runSequence() {
    if (this.running) throw new Error('SEQUENCE_RUNNING');
    this.running = true;
    try {
      await this.startEngine(); await this.setPosition();
      const result = await this.search({ mode: 'infinite', requireInfo: true });
      return this.finish(result.searchId);
    } finally { this.running = false; }
  }
}

window.Eae012Main = new MainPreviewClient();
const client = window.Eae012Main;
client.initialize().catch(error => { $('#status').textContent = error.message; log(error.message); });
$('#create').addEventListener('click', () => client.create().catch(error => log(error.message)));
$('#open').addEventListener('click', () => client.openIsolated());
$('#run').addEventListener('click', () => client.runSequence().catch(error => log(error.message)));
$('#disconnect').addEventListener('click', () => client.disconnect());
$('#reconnect').addEventListener('click', () => client.connect().catch(error => log(error.message)));
$('#sign-in').addEventListener('click', () => {
  const clerk = window.CAISSA_AUTH?.clerk;
  if (!clerk) { log('CAISSA_CLERK_NOT_READY'); return; }
  clerk.openSignIn({ afterSignInUrl: location.href, afterSignUpUrl: location.href });
});
