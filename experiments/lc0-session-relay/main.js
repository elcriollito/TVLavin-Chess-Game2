const $ = selector => document.querySelector(selector);
const log = value => { $('#log').textContent += `${value}\n`; };
$('#environment').textContent = `origin=${location.origin} isolated=${crossOriginIsolated} SAB=${typeof SharedArrayBuffer === 'function'}`;

async function json(path, method, body, credential, testUser) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(path === '/api/session' ? { 'X-Test-User': testUser } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
  return value;
}

export class MainClient {
  constructor() {
    this.session = null;
    this.seq = 0;
    this.events = [];
    this.waiters = [];
    this.controller = null;
    this.sentAt = new Map();
    this.acceptanceMs = new Map();
    this.createSerial = 0;
  }

  emit(event) {
    this.events.push({ ...event, at: performance.now(), receivedEpoch: Date.now() });
    log(`← ${JSON.stringify(event)}`);
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(event)) continue;
      clearTimeout(waiter.timer);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(event);
    }
  }

  waitFor(predicate, timeoutMs = 3_000, start = this.events.length) {
    const found = this.events.slice(start).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error('EVENT_TIMEOUT'));
      }, timeoutMs) };
      this.waiters.push(waiter);
    });
  }

  async create(competitionId = `browser-${Date.now()}`) {
    const userId = `test-user-browser-${++this.createSerial}`;
    this.session = await json('/api/session', 'POST', {
      userId, competitionId, participantRole: 'white'
    }, null, userId);
    this.seq = 0;
    this.events = [];
    this.sentAt.clear();
    this.acceptanceMs.clear();
    $('#session').textContent = `Session ${this.session.sessionId}; claim expires ${new Date(this.session.expiresAt).toISOString()}`;
    $('#open').disabled = false;
    $('#sequence').disabled = false;
    await this.connect();
    log(`session created ${this.session.sessionId}`);
    return this.session;
  }

  engineUrl() {
    const fragment = new URLSearchParams({ session: this.session.sessionId, claim: this.session.claimToken });
    return `http://127.0.0.1:8792/#${fragment}`;
  }

  openIsolated() {
    // Navigation carries a one-time claim. No WindowProxy/opener is retained or used.
    window.open(this.engineUrl(), '_blank', 'noopener');
  }

  async connect() {
    this.controller = new AbortController();
    const response = await fetch(`/api/session/${this.session.sessionId}/stream`, {
      headers: { Authorization: `Bearer ${this.session.arenaCredential}` }, signal: this.controller.signal
    });
    if (!response.ok) throw new Error((await response.json()).error);
    this.consume(response.body).catch(error => {
      if (error.name !== 'AbortError') log(`stream error ${error.message}`);
    });
  }

  async consume(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const line = frame.split('\n').find(entry => entry.startsWith('data: '));
        if (line) this.emit(JSON.parse(line.slice(6)));
      }
    }
  }

  async send(type, extras = {}) {
    const seq = ++this.seq;
    const started = performance.now();
    this.sentAt.set(seq, started);
    const accepted = await json(`/api/session/${this.session.sessionId}/command`, 'POST',
      { type, seq, ...extras }, this.session.arenaCredential);
    this.acceptanceMs.set(seq, performance.now() - started);
    log(`→ ${type} ${seq}; broker accepted, not yet ACKed`);
    return accepted;
  }

  async sendAndAck(type, extras = {}) {
    const start = this.events.length;
    const { seq } = await this.send(type, extras);
    await this.waitFor(event => event.type === 'ACK' && event.seq === seq && event.command === type, 3_000, start);
    return seq;
  }

  async advance() {
    return json(`/api/session/${this.session.sessionId}/advance`, 'POST', {}, this.session.arenaCredential);
  }

  async terminate() {
    const result = await json(`/api/session/${this.session.sessionId}/terminate`, 'POST', {}, this.session.arenaCredential);
    this.controller?.abort();
    return result;
  }

  async runSequence() {
    await this.sendAndAck('HELLO');
    await this.waitFor(event => event.type === 'READY', 5_000, 0);
    await this.sendAndAck('POSITION', { fen: 'startpos' });
    const goStart = this.events.length;
    await this.sendAndAck('GO');
    await this.waitFor(event => event.type === 'INFO', 3_000, goStart);
    const stopStart = this.events.length;
    await this.sendAndAck('STOP');
    await this.waitFor(event => event.type === 'BESTMOVE', 3_000, stopStart);
    await this.waitFor(event => event.type === 'STOPPED', 3_000, stopStart);
    const quitStart = this.events.length;
    await this.sendAndAck('QUIT');
    await this.waitFor(event => event.type === 'CLEANUP', 3_000, quitStart);
    const gate = await this.advance();
    log(`Tournament gate: ${gate.advanceAllowed}`);
    await this.terminate();
    return gate;
  }
}

window.Eae010Main = new MainClient();
$('#create').addEventListener('click', () => window.Eae010Main.create().catch(error => log(error.message)));
$('#open').addEventListener('click', () => window.Eae010Main.openIsolated());
$('#sequence').addEventListener('click', () => window.Eae010Main.runSequence().catch(error => log(error.message)));
