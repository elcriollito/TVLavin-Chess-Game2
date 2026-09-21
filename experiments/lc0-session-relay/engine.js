const $ = selector => document.querySelector(selector);
const log = value => { $('#log').textContent += `${value}\n`; };
$('#environment').textContent = `origin=${location.origin} isolated=${crossOriginIsolated} SAB=${typeof SharedArrayBuffer === 'function'}`;

async function json(path, value, credential) {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(value)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

export class DummyEngineClient {
  constructor() {
    this.sessionId = null;
    this.credential = null;
    this.controller = null;
    this.infoTimer = null;
    this.depth = 0;
    this.commandChain = Promise.resolve();
    this.events = [];
  }

  async claim(sessionId, claimToken) {
    if (!crossOriginIsolated || typeof SharedArrayBuffer !== 'function')
      throw new Error('ISOLATION_REQUIRED');
    const claimed = await json('/api/claim', { sessionId, claimToken });
    this.sessionId = sessionId;
    this.credential = claimed.engineCredential;
    $('#status').textContent = `Claimed ${sessionId}`;
    $('#disconnect').disabled = false;
    await this.connect();
    return claimed;
  }

  async connect() {
    this.controller = new AbortController();
    const response = await fetch(`/api/session/${this.sessionId}/stream`, {
      headers: { Authorization: `Bearer ${this.credential}` }, signal: this.controller.signal
    });
    if (!response.ok) throw new Error((await response.json()).error);
    $('#reconnect').disabled = true;
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
        if (!line) continue;
        const command = JSON.parse(line.slice(6));
        this.events.push({ ...command, at: performance.now() });
        log(`← ${JSON.stringify(command)}`);
        this.commandChain = this.commandChain.then(() => this.handle(command))
          .catch(error => log(`command error ${error.message}`));
      }
    }
  }

  async message(value) {
    const result = await json(`/api/session/${this.sessionId}/message`, value, this.credential);
    log(`→ ${JSON.stringify(value)}`);
    return result;
  }

  async handle(command) {
    if (command.type === 'HELLO') {
      await this.message({ type: 'ACK', command: 'HELLO', seq: command.seq });
      await this.message({ type: 'READY' });
    } else if (command.type === 'POSITION') {
      await this.message({ type: 'ACK', command: 'POSITION', seq: command.seq });
    } else if (command.type === 'GO') {
      await this.message({ type: 'ACK', command: 'GO', seq: command.seq });
      this.infoTimer = setInterval(() => {
        this.depth++;
        this.message({ type: 'INFO', depth: this.depth, pv: 'e2e4 e7e5', score: 12,
          emittedAt: Date.now() })
          .catch(() => {});
      }, 10);
    } else if (command.type === 'STOP') {
      clearInterval(this.infoTimer);
      this.infoTimer = null;
      await this.message({ type: 'ACK', command: 'STOP', seq: command.seq });
      await this.message({ type: 'BESTMOVE', move: 'e2e4', emittedAt: Date.now() });
      await this.message({ type: 'STOPPED' });
    } else if (command.type === 'QUIT') {
      clearInterval(this.infoTimer);
      this.infoTimer = null;
      await this.message({ type: 'ACK', command: 'QUIT', seq: command.seq });
      await this.message({ type: 'CLEANUP' });
      $('#status').textContent = 'CLEANED';
      $('#disconnect').disabled = true;
    }
  }

  disconnect() {
    clearInterval(this.infoTimer);
    this.infoTimer = null;
    this.controller?.abort();
    $('#reconnect').disabled = false;
    $('#status').textContent = 'DISCONNECTED';
  }

  async reconnect() {
    await this.connect();
    $('#status').textContent = 'RECONNECTED';
  }
}

window.Eae010Engine = new DummyEngineClient();
$('#disconnect').addEventListener('click', () => window.Eae010Engine.disconnect());
$('#reconnect').addEventListener('click', () => window.Eae010Engine.reconnect().catch(error => log(error.message)));
const claim = new URLSearchParams(location.hash.slice(1));
history.replaceState(null, '', location.pathname);
if (claim.has('session') && claim.has('claim')) {
  window.Eae010Engine.claim(claim.get('session'), claim.get('claim'))
    .catch(error => { $('#status').textContent = error.message; log(error.message); });
}
