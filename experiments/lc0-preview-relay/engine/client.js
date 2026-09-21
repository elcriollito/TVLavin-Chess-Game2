const $ = selector => document.querySelector(selector);
const log = value => { $('#log').textContent += `${value}\n`; };
$('#environment').textContent = `origin=${location.origin}; isolated=${crossOriginIsolated}; SAB=${typeof SharedArrayBuffer === 'function'}`;

async function api(action, { sessionId, credential, body, cursor, signal } = {}) {
  const url = new URL('/api/eae011', location.origin);
  url.searchParams.set('action', action);
  if (sessionId) url.searchParams.set('sessionId', sessionId);
  if (cursor != null) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { method: body ? 'POST' : 'GET',
    headers: { ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), ...(signal ? { signal } : {}) });
  if (!response.ok) {
    let value; try { value = await response.json(); } catch { value = {}; }
    throw new Error(value.error || `HTTP_${response.status}`);
  }
  return action === 'stream_engine' ? response : response.json();
}

class EnginePreviewClient {
  constructor() {
    this.sessionId = null; this.credential = null; this.cursor = 0; this.seq = 0;
    this.controller = null; this.infoTimer = null; this.heartbeatTimer = null;
    this.outbound = Promise.resolve();
    this.inbound = Promise.resolve(); this.commands = [];
  }

  async initialize() {
    if (!crossOriginIsolated || typeof SharedArrayBuffer !== 'function')
      throw new Error('ISOLATION_REQUIRED');
    const handoff = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname);
    if (handoff.has('sessionId') && handoff.has('claimToken')) {
      this.sessionId = handoff.get('sessionId');
      const claimed = await api('claim', { body: { sessionId: this.sessionId,
        claimToken: handoff.get('claimToken') } });
      this.credential = claimed.engineCredential;
      sessionStorage.setItem('eae011-engine-session', this.sessionId);
      sessionStorage.setItem('eae011-engine-credential', this.credential);
      sessionStorage.setItem('eae011-engine-cursor', '0');
    } else {
      this.sessionId = sessionStorage.getItem('eae011-engine-session');
      this.credential = sessionStorage.getItem('eae011-engine-credential');
      if (!this.sessionId || !this.credential) throw new Error('CLAIM_REQUIRED');
      this.cursor = Number(sessionStorage.getItem('eae011-engine-cursor') || 0);
    }
    const status = await api('engine_state', { sessionId: this.sessionId,
      credential: this.credential });
    this.seq = status.lastEngineSeq;
    await this.connect();
    $('#status').textContent = `Engine session ${this.sessionId}; ${status.phase}`;
  }

  async connect() {
    this.controller = new AbortController();
    const response = await api('stream_engine', { sessionId: this.sessionId,
      credential: this.credential, cursor: this.cursor, signal: this.controller.signal });
    $('#disconnect').disabled = false; $('#reconnect').disabled = true;
    this.consume(response.body, this.controller).catch(error => {
      if (error.name !== 'AbortError') log(error.message);
    });
  }

  heartbeat(epoch) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => api('heartbeat_engine', {
      sessionId: this.sessionId, credential: this.credential, body: { epoch }
    }).catch(error => { log(`heartbeat ${error.message}`); this.disconnect(); }), 1500);
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
        if (!line || !id) continue;
        const item = JSON.parse(line.slice(6)), eventId = Number(id.slice(4));
        this.inbound = this.inbound.then(async () => {
          const accepted = await api('claim_command', { sessionId: this.sessionId,
            credential: this.credential, body: { commandSeq: item.seq } });
          if (accepted.execute) {
            this.commands.push(item); log(`<-- ${JSON.stringify(item)}`);
            await this.handle(item);
          }
          this.cursor = Math.max(this.cursor, eventId);
          sessionStorage.setItem('eae011-engine-cursor', String(this.cursor));
        }).catch(error => log(`command error ${error.message}`));
      }
    } } finally { if (this.controller === controller) clearInterval(this.heartbeatTimer); }
  }

  async message(type, rest = {}) {
    this.outbound = this.outbound.catch(() => {}).then(async () => {
      const seq = this.seq + 1;
      try {
        const result = await api('message', { sessionId: this.sessionId,
          credential: this.credential, body: { type, seq, ...rest } });
        this.seq = seq;
        log(`--> ${type} ${seq}`);
        return result;
      } catch (error) {
        try {
          const status = await api('engine_state', { sessionId: this.sessionId,
            credential: this.credential });
          this.seq = status.lastEngineSeq;
        } catch { /* Original error is authoritative. */ }
        throw error;
      }
    });
    return this.outbound;
  }

  async handle(command) {
    if (command.type === 'HELLO') {
      await this.message('ACK', { command: 'HELLO', commandSeq: command.seq });
      await this.message('READY');
    } else if (command.type === 'POSITION') {
      await this.message('ACK', { command: 'POSITION', commandSeq: command.seq });
    } else if (command.type === 'GO') {
      await this.message('ACK', { command: 'GO', commandSeq: command.seq,
        searchId: command.searchId });
      this.infoTimer = setInterval(() => this.message('INFO', { searchId: command.searchId,
        depth: 1, pv: 'e2e4 e7e5', score: 12, emittedAt: Date.now() }).catch(() => {}), 180);
    } else if (command.type === 'STOP') {
      clearInterval(this.infoTimer); this.infoTimer = null;
      await this.message('ACK', { command: 'STOP', commandSeq: command.seq,
        searchId: command.searchId });
      await this.message('BESTMOVE', { searchId: command.searchId,
        move: 'e2e4', emittedAt: Date.now() });
      await this.message('STOPPED', { searchId: command.searchId });
    } else if (command.type === 'RESET') {
      await this.message('ACK', { command: 'RESET', commandSeq: command.seq,
        searchId: command.searchId });
      await this.message('READY');
    } else if (command.type === 'QUIT') {
      clearInterval(this.infoTimer); this.infoTimer = null;
      await this.message('ACK', { command: 'QUIT', commandSeq: command.seq });
      await this.message('CLEANUP');
      sessionStorage.removeItem('eae011-engine-session');
      sessionStorage.removeItem('eae011-engine-credential');
      sessionStorage.removeItem('eae011-engine-cursor');
      clearInterval(this.heartbeatTimer);
      this.controller?.abort();
      $('#status').textContent = 'CLEANED';
      $('#disconnect').disabled = true;
    }
  }

  disconnect() {
    clearInterval(this.infoTimer); this.infoTimer = null;
    clearInterval(this.heartbeatTimer);
    this.controller?.abort();
    $('#disconnect').disabled = true; $('#reconnect').disabled = false;
    $('#status').textContent = 'DISCONNECTED';
  }

  async reconnect() {
    const status = await api('engine_state', { sessionId: this.sessionId,
      credential: this.credential });
    this.seq = status.lastEngineSeq;
    await this.connect();
    $('#status').textContent = 'RECONNECTED';
  }
}

window.Eae011Engine = new EnginePreviewClient();
const client = window.Eae011Engine;
client.initialize().catch(error => { $('#status').textContent = error.message; log(error.message); });
$('#disconnect').addEventListener('click', () => client.disconnect());
$('#reconnect').addEventListener('click', () => client.reconnect().catch(error => log(error.message)));
