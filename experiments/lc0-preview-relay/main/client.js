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
    this.timings = [];
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
    const saved = sessionStorage.getItem('eae011-main-session');
    if (saved) {
      try {
        const info = await api('inspect', { sessionId: saved });
        this.sessionId = saved; this.seq = info.state.lastCommandSeq;
        this.cursor = Number(sessionStorage.getItem('eae011-main-cursor') || 0);
        await this.connect();
        $('#status').textContent = `Recovered ${saved}`;
        $('#run').disabled = this.seq !== 0;
      } catch { sessionStorage.removeItem('eae011-main-session'); }
    }
  }

  async create(competitionId = `preview-${Date.now()}`) {
    const result = await api('create', { body: { competitionId, participantRole: 'white' } });
    this.sessionId = result.sessionId; this.claimToken = result.claimToken;
    this.cursor = 0; this.seq = 0; this.events = [];
    sessionStorage.setItem('eae011-main-session', this.sessionId);
    sessionStorage.setItem('eae011-main-cursor', '0');
    await this.connect();
    $('#open').disabled = false; $('#run').disabled = false;
    $('#status').textContent = `Session ${this.sessionId}; claim expires ${new Date(result.expiresAt).toISOString()}`;
    return result;
  }

  openIsolated() {
    if (!this.claimToken) throw new Error('CLAIM_NOT_AVAILABLE');
    const url = new URL('/experiments/lc0-preview-relay/engine/', this.config.engineOrigin);
    url.hash = new URLSearchParams({ sessionId: this.sessionId,
      claimToken: this.claimToken, mainOrigin: location.origin }).toString();
    window.open(url, '_blank', 'noopener');
  }

  async connect() {
    this.controller = new AbortController();
    const response = await api('stream_main', { sessionId: this.sessionId,
      cursor: this.cursor, signal: this.controller.signal });
    $('#disconnect').disabled = false; $('#reconnect').disabled = true;
    this.consume(response.body).catch(error => { if (error.name !== 'AbortError') log(error.message); });
  }

  async consume(body) {
    const reader = body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const line = frame.split('\n').find(part => part.startsWith('data: '));
        const id = frame.split('\n').find(part => part.startsWith('id: '));
        if (id) {
          this.cursor = Math.max(this.cursor, Number(id.slice(4)));
          sessionStorage.setItem('eae011-main-cursor', String(this.cursor));
        }
        if (line) this.emit(JSON.parse(line.slice(6)));
      }
    }
  }

  disconnect() {
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

  async runSequence() {
    if (this.running) throw new Error('SEQUENCE_RUNNING');
    this.running = true;
    try {
      await this.sendAndAck('HELLO');
      await this.waitFor(item => item.type === 'READY', 0);
      await this.sendAndAck('POSITION', { fen: 'startpos' });
      const searchId = `search_${crypto.randomUUID()}`;
      await this.sendAndAck('GO', { searchId });
      await this.waitFor(item => item.type === 'INFO' && item.searchId === searchId, 0);
      const stopStart = this.events.length, stopSent = performance.now();
      await this.sendAndAck('STOP', { searchId });
      await this.waitFor(item => item.type === 'BESTMOVE' && item.searchId === searchId, stopStart);
      await this.waitFor(item => item.type === 'STOPPED' && item.searchId === searchId, stopStart);
      this.timings.push({ type: 'STOP', terminalMs: performance.now() - stopSent });
      const quitStart = this.events.length, quitSent = performance.now();
      await this.sendAndAck('QUIT');
      await this.waitFor(item => item.type === 'CLEANUP', quitStart);
      this.timings.push({ type: 'QUIT', cleanupMs: performance.now() - quitSent });
      const gate = await api('advance', { sessionId: this.sessionId,
        body: { mode: 'release', searchId } });
      if (!gate.advanceAllowed) throw new Error('GATE_CLOSED');
      await api('terminate', { sessionId: this.sessionId, body: {} });
      sessionStorage.removeItem('eae011-main-session');
      sessionStorage.removeItem('eae011-main-cursor');
      this.controller?.abort();
      $('#status').textContent = `Tournament gate passed; ${searchId}; session terminated.`;
      return gate;
    } finally { this.running = false; }
  }
}

window.Eae011Main = new MainPreviewClient();
const client = window.Eae011Main;
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
