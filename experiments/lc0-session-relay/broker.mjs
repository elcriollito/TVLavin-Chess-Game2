import { randomBytes, timingSafeEqual } from 'node:crypto';

export const LIMITS = Object.freeze({
  claimMs: 30_000,
  idleMs: 30_000,
  leaseMs: 5_000,
  hardMs: 120_000,
  ackMs: 2_500,
  infoIntervalMs: 50,
  maxSessionsPerUser: 10,
  maxCreatesPerMinute: 20,
  maxCommandsPerSecond: 30,
  maxInfoPerSecond: 100,
  maxCommandBytes: 2_048,
  maxInfoBytes: 1_024,
  maxPvBytes: 512,
  maxBestmoveBytes: 128,
  maxErrorBytes: 256,
  maxHighQueue: 64
});

export class RelayError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const token = () => randomBytes(32).toString('base64url');
const bytes = value => Buffer.byteLength(JSON.stringify(value) ?? 'null');
const equal = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

export class SessionBroker {
  constructor({ now = () => Date.now(), limits = {} } = {}) {
    this.now = now;
    this.limits = { ...LIMITS, ...limits };
    this.sessions = new Map();
    this.tombstones = new Map();
    this.createTimes = new Map();
    this.metrics = { created: 0, expired: 0, terminated: 0, coalescedInfo: 0, deliveredInfo: 0,
      rejectedInfo: 0, rejectedReplay: 0, highDelivered: 0, highQueuedPeak: 0 };
  }

  activeCount() { return this.sessions.size; }

  create({ userId, competitionId, participantRole }) {
    if (!/^test-user-[a-z0-9-]{1,40}$/.test(userId || '')) throw new RelayError('TEST_IDENTITY_REQUIRED', 401);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(competitionId || '')) throw new RelayError('COMPETITION_INVALID');
    if (!['white', 'black'].includes(participantRole)) throw new RelayError('ROLE_INVALID');
    const now = this.now();
    const history = (this.createTimes.get(userId) || []).filter(time => now - time < 60_000);
    if (history.length >= this.limits.maxCreatesPerMinute) throw new RelayError('CREATE_RATE_LIMIT', 429);
    const concurrent = [...this.sessions.values()].filter(session => session.userId === userId).length;
    if (concurrent >= this.limits.maxSessionsPerUser) throw new RelayError('CONCURRENT_SESSION_LIMIT', 429);
    history.push(now);
    this.createTimes.set(userId, history);
    const sessionId = token();
    const claimToken = token();
    const arenaCredential = token();
    const session = {
      sessionId, claimToken, arenaCredential, engineCredential: null,
      arenaClientId: token(), engineClientId: null, userId, competitionId, participantRole,
      createdAt: now, expiresAt: now + this.limits.hardMs,
      claimExpiresAt: now + this.limits.claimMs, idleExpiresAt: null,
      leaseExpiresAt: null, lastSequence: 0, state: 'UNCLAIMED',
      pending: new Map(), commandTimes: [], infoTimes: [],
      acks: new Set(), bestmoveSeen: false, stoppedSeen: false, cleanupSeen: false,
      arenaEverConnected: false, engineEverConnected: false,
      channels: { arena: this.channel(), engine: this.channel() }
    };
    this.sessions.set(sessionId, session);
    this.metrics.created++;
    return { sessionId, claimToken, arenaCredential, arenaClientId: session.arenaClientId,
      expiresAt: session.claimExpiresAt };
  }

  channel() { return { response: null, high: [], low: null, lowTimer: null, lastLowAt: -Infinity }; }

  session(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new RelayError(this.tombstones.get(sessionId)?.reason || 'SESSION_NOT_FOUND', 410);
    this.checkExpiry(session);
    if (!this.sessions.has(sessionId)) throw new RelayError(this.tombstones.get(sessionId)?.reason || 'SESSION_EXPIRED', 410);
    return session;
  }

  checkExpiry(session) {
    const now = this.now();
    if (now >= session.expiresAt) return this.end(session, 'SESSION_EXPIRED');
    if (session.state === 'UNCLAIMED' && now >= session.claimExpiresAt) return this.end(session, 'CLAIM_EXPIRED');
    if (session.idleExpiresAt != null && now >= session.idleExpiresAt) return this.end(session, 'IDLE_EXPIRED');
    if (session.leaseExpiresAt != null && now >= session.leaseExpiresAt &&
        session.state === 'DISCONNECTED') return this.end(session, 'ENGINE_LEASE_EXPIRED');
    for (const pending of session.pending.values()) {
      if (now >= pending.deadline && (pending.type === 'STOP' || pending.type === 'QUIT')) {
        this.enqueue(session, 'arena', { type: 'ERROR', code: `${pending.type}_TIMEOUT`, seq: pending.seq }, 'high');
        return this.end(session, `${pending.type}_TIMEOUT`);
      }
    }
  }

  sweep() {
    for (const session of [...this.sessions.values()]) this.checkExpiry(session);
    const now = this.now();
    for (const [id, value] of this.tombstones) if (now - value.at > 60_000) this.tombstones.delete(id);
    for (const [user, times] of this.createTimes) {
      const recent = times.filter(time => now - time < 60_000);
      if (recent.length) this.createTimes.set(user, recent);
      else this.createTimes.delete(user);
    }
  }

  claim({ sessionId, claimToken }) {
    const session = this.session(sessionId);
    if (session.state !== 'UNCLAIMED') throw new RelayError('CLAIM_ALREADY_USED', 409);
    if (!equal(session.claimToken, claimToken)) throw new RelayError('CLAIM_INVALID', 403);
    session.claimToken = null;
    session.engineCredential = token();
    session.engineClientId = token();
    session.state = 'CLAIMED';
    session.leaseExpiresAt = this.now() + this.limits.leaseMs;
    this.touch(session);
    return { sessionId, engineCredential: session.engineCredential,
      engineClientId: session.engineClientId, leaseExpiresAt: session.leaseExpiresAt };
  }

  auth(sessionId, role, credential) {
    const session = this.session(sessionId);
    if (role === 'engine' && ['CLEANED', 'ADVANCED'].includes(session.state))
      throw new RelayError('ENGINE_DETACHED', 410);
    const expected = role === 'arena' ? session.arenaCredential : session.engineCredential;
    if (!equal(expected, credential)) throw new RelayError('CREDENTIAL_INVALID', 403);
    return session;
  }

  touch(session) { session.idleExpiresAt = this.now() + this.limits.idleMs; }

  connect(sessionId, role, credential, response) {
    const session = this.auth(sessionId, role, credential);
    const channel = session.channels[role];
    if (channel.response) throw new RelayError('CLIENT_ALREADY_CONNECTED', 409);
    if (role === 'engine') {
      if (session.state === 'DISCONNECTED') {
        if (this.now() >= session.leaseExpiresAt) throw new RelayError('ENGINE_LEASE_EXPIRED', 410);
        session.state = session.resumeState || 'CLAIMED';
      }
      session.engineEverConnected = true;
      session.leaseExpiresAt = null;
    } else session.arenaEverConnected = true;
    channel.response = response;
    response.on('close', () => this.disconnect(sessionId, role, response));
    response.on('drain', () => {
      if (this.sessions.has(sessionId) && channel.response === response) this.flush(session, role);
    });
    response.write(': connected\n\n');
    this.flush(session, role);
    return session;
  }

  disconnect(sessionId, role, response) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const channel = session.channels[role];
    if (channel.response !== response) return;
    channel.response = null;
    if (role === 'arena') this.end(session, 'ARENA_DISCONNECTED');
    else if (!['CLEANED', 'ADVANCED'].includes(session.state)) {
      session.resumeState = session.state;
      session.state = 'DISCONNECTED';
      session.leaseExpiresAt = this.now() + this.limits.leaseMs;
      this.enqueue(session, 'arena', { type: 'ERROR', code: 'ENGINE_DISCONNECTED' }, 'high');
    }
  }

  enqueue(session, role, message, priority) {
    const channel = session.channels[role];
    if (priority === 'high') {
      channel.high.push(message);
      this.metrics.highQueuedPeak = Math.max(this.metrics.highQueuedPeak, channel.high.length);
      if (channel.high.length > this.limits.maxHighQueue) {
        this.end(session, 'HIGH_QUEUE_OVERFLOW');
        return;
      }
    } else {
      if (channel.low) this.metrics.coalescedInfo++;
      channel.low = message;
    }
    this.flush(session, role);
  }

  flush(session, role) {
    const channel = session.channels[role];
    if (!channel.response || channel.response.destroyed || channel.response.writableEnded) return;
    if (channel.response.writableNeedDrain) return;
    while (channel.high.length) {
      const message = channel.high.shift();
      const accepted = channel.response.write(`data: ${JSON.stringify(message)}\n\n`);
      this.metrics.highDelivered++;
      if (!accepted) return;
    }
    if (!channel.low) return;
    const remaining = this.limits.infoIntervalMs - (this.now() - channel.lastLowAt);
    if (remaining > 0) {
      if (!channel.lowTimer) {
        channel.lowTimer = setTimeout(() => {
          channel.lowTimer = null;
          if (this.sessions.has(session.sessionId)) this.flush(session, role);
        }, remaining);
        channel.lowTimer.unref?.();
      }
      return;
    }
    channel.response.write(`data: ${JSON.stringify(channel.low)}\n\n`);
    channel.low = null;
    channel.lastLowAt = this.now();
    this.metrics.deliveredInfo++;
  }

  command(sessionId, credential, command) {
    const session = this.auth(sessionId, 'arena', credential);
    if (bytes(command) > this.limits.maxCommandBytes) throw new RelayError('COMMAND_TOO_LARGE', 413);
    const { seq, type } = command || {};
    if (!Number.isSafeInteger(seq) || seq !== session.lastSequence + 1) {
      this.metrics.rejectedReplay++;
      throw new RelayError('SEQUENCE_INVALID', 409);
    }
    const expected = {
      HELLO: ['CLAIMED'], POSITION: ['READY', 'POSITION_ACKED'],
      GO: ['POSITION_ACKED'], STOP: ['SEARCHING'], QUIT: ['STOPPED']
    };
    if (!expected[type]?.includes(session.state)) throw new RelayError('COMMAND_STATE_INVALID', 409);
    if (type === 'POSITION' && (typeof command.fen !== 'string' || command.fen.length > 256))
      throw new RelayError('POSITION_INVALID');
    const now = this.now();
    session.commandTimes = session.commandTimes.filter(time => now - time < 1_000);
    if (session.commandTimes.length >= this.limits.maxCommandsPerSecond) throw new RelayError('COMMAND_RATE_LIMIT', 429);
    session.commandTimes.push(now);
    session.lastSequence = seq;
    session.pending.set(seq, { seq, type, deadline: now + this.limits.ackMs });
    if (type === 'STOP') session.state = 'STOPPING';
    if (type === 'QUIT') session.state = 'QUITTING';
    this.touch(session);
    this.enqueue(session, 'engine', { type, seq, fen: command.fen }, 'high');
    return { accepted: true, seq, delivered: false };
  }

  engineMessage(sessionId, credential, message) {
    const session = this.auth(sessionId, 'engine', credential);
    const type = message?.type;
    const size = bytes(message);
    if (size > (type === 'INFO' ? this.limits.maxInfoBytes :
      type === 'BESTMOVE' ? this.limits.maxBestmoveBytes :
      type === 'ERROR' ? this.limits.maxErrorBytes : this.limits.maxCommandBytes)) {
      throw new RelayError('MESSAGE_TOO_LARGE', 413);
    }
    if (type === 'ACK') {
      const pending = session.pending.get(message.seq);
      if (!pending || message.command !== pending.type) throw new RelayError('ACK_INVALID', 409);
      session.pending.delete(message.seq);
      session.acks.add(pending.type);
      if (pending.type === 'HELLO') session.state = 'HELLO_ACKED';
      if (pending.type === 'POSITION') session.state = 'POSITION_ACKED';
      if (pending.type === 'GO') session.state = 'SEARCHING';
      if (pending.type === 'STOP') session.state = 'STOP_ACKED';
      if (pending.type === 'QUIT') session.state = 'QUIT_ACKED';
      this.enqueue(session, 'arena', { type: 'ACK', seq: message.seq, command: pending.type }, 'high');
    } else if (type === 'READY') {
      if (session.state !== 'HELLO_ACKED') throw new RelayError('READY_STATE_INVALID', 409);
      session.state = 'READY';
      this.enqueue(session, 'arena', { type: 'READY' }, 'high');
    } else if (type === 'INFO') {
      if (session.state !== 'SEARCHING' && session.state !== 'STOPPING')
        throw new RelayError('INFO_STATE_INVALID', 409);
      if (typeof message.depth !== 'number' || !Number.isSafeInteger(message.depth) ||
          typeof message.pv !== 'string' || bytes(message.pv) > this.limits.maxPvBytes ||
          typeof message.score !== 'number' || !Number.isFinite(message.score))
        throw new RelayError('INFO_INVALID');
      const now = this.now();
      session.infoTimes = session.infoTimes.filter(time => now - time < 1_000);
      if (session.infoTimes.length >= this.limits.maxInfoPerSecond) {
        this.metrics.rejectedInfo++;
        throw new RelayError('INFO_RATE_LIMIT', 429);
      }
      session.infoTimes.push(now);
      this.enqueue(session, 'arena', { type: 'INFO', depth: message.depth,
        pv: message.pv, score: message.score,
        emittedAt: Number.isSafeInteger(message.emittedAt) ? message.emittedAt : null }, 'low');
    } else if (type === 'BESTMOVE') {
      if (session.state !== 'STOP_ACKED' || session.bestmoveSeen)
        throw new RelayError('BESTMOVE_STATE_INVALID', 409);
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(message.move || ''))
        throw new RelayError('BESTMOVE_INVALID');
      session.bestmoveSeen = true;
      this.enqueue(session, 'arena', { type: 'BESTMOVE', move: message.move,
        emittedAt: Number.isSafeInteger(message.emittedAt) ? message.emittedAt : null }, 'high');
    } else if (type === 'STOPPED') {
      if (session.state !== 'STOP_ACKED' || !session.bestmoveSeen)
        throw new RelayError('STOPPED_STATE_INVALID', 409);
      session.stoppedSeen = true;
      session.state = 'STOPPED';
      this.enqueue(session, 'arena', { type: 'STOPPED' }, 'high');
    } else if (type === 'CLEANUP') {
      if (session.state !== 'QUIT_ACKED' || !session.stoppedSeen || !session.bestmoveSeen)
        throw new RelayError('CLEANUP_STATE_INVALID', 409);
      session.cleanupSeen = true;
      session.state = 'CLEANED';
      session.engineCredential = null;
      session.leaseExpiresAt = null;
      const engineResponse = session.channels.engine.response;
      session.channels.engine.response = null;
      this.enqueue(session, 'arena', { type: 'CLEANUP' }, 'high');
      engineResponse?.end();
    } else if (type === 'ERROR') {
      if (typeof message.code !== 'string' || message.code.length > 64)
        throw new RelayError('ERROR_INVALID');
      this.enqueue(session, 'arena', { type: 'ERROR', code: message.code }, 'high');
    } else throw new RelayError('MESSAGE_TYPE_INVALID');
    this.touch(session);
    return { accepted: true, type };
  }

  advance(sessionId, credential) {
    const session = this.auth(sessionId, 'arena', credential);
    if (session.state !== 'CLEANED' || !session.acks.has('STOP') || !session.bestmoveSeen ||
        !session.acks.has('QUIT') || !session.cleanupSeen) throw new RelayError('ADVANCE_GATE_CLOSED', 409);
    session.state = 'ADVANCED';
    return { advanceAllowed: true };
  }

  terminate(sessionId, credential) {
    const session = this.auth(sessionId, 'arena', credential);
    this.end(session, 'ARENA_TERMINATED');
    return { terminated: true };
  }

  end(session, reason) {
    if (!this.sessions.has(session.sessionId)) return;
    this.sessions.delete(session.sessionId);
    this.tombstones.set(session.sessionId, { reason, at: this.now() });
    if (reason === 'ARENA_TERMINATED') this.metrics.terminated++;
    else this.metrics.expired++;
    for (const channel of Object.values(session.channels)) {
      if (channel.lowTimer) clearTimeout(channel.lowTimer);
      channel.lowTimer = null;
      channel.low = null;
      channel.high.length = 0;
      channel.response?.end();
      channel.response = null;
    }
    session.pending.clear();
    session.claimToken = null;
    session.arenaCredential = null;
    session.engineCredential = null;
    session.state = reason;
  }

  interrupt() {
    for (const session of [...this.sessions.values()]) this.end(session, 'BROKER_INTERRUPTED');
  }
}
