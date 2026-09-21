import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const LIMITS = Object.freeze({
  claimMs: 30_000, idleMs: 30_000, hardMs: 120_000, leaseMs: 5_000,
  streamHeartbeatMs: 3_000, ackMs: 2_500, maxEvents: 128,
  maxCommandsPerSecond: 30, maxInfoPerSecond: 100, maxReconnectsPerMinute: 20,
  maxClaimAttempts: 8, maxCommandBytes: 2_048, maxInfoBytes: 1_024,
  maxPvBytes: 512, maxBestmoveBytes: 128, maxErrorBytes: 256
});

export class RelayError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}

const secret = () => randomBytes(32).toString('base64url');
const hash = (id, value) => createHash('sha256').update(`${id}:${value}`).digest('base64url');
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const bytes = value => Buffer.byteLength(JSON.stringify(value) ?? 'null');
const idPattern = /^[A-Za-z0-9_-]{20,64}$/;
const searchPattern = /^[A-Za-z0-9_-]{8,64}$/;
const movePattern = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export const LC0_IDENTITY = Object.freeze({
  providerClass: 'lc0-browser-experimental',
  version: 'v0.33.0-dev+git.482bb4a',
  sourceCommit: '482bb4a830287b726ebe7d42f14ab7f5f17c18a0',
  uciName: 'Lc0 v0.33.0-dev+git.482bb4a',
  uciAuthor: 'The LCZero Authors.',
  backend: 'cpu-wasm',
  networkId: 'CSSLab Maia 1100 v1.0',
  networkSha256: 'e1cf1cd0c96b8a4fa6a275f4b9fd54ed1ffebf9fe44641b9fceded310e9619c4',
  manifestSha256: 'b1a28b43918980191d62fc9c67892a00a5458126a1005ea139615c9c9b633c2a'
});

function verifiedIdentity(value) {
  keys(value, [...Object.keys(LC0_IDENTITY), 'runtimeInstanceId']);
  if (Object.keys(value).length !== Object.keys(LC0_IDENTITY).length + 1 ||
      Object.entries(LC0_IDENTITY).some(([key, expected]) => value[key] !== expected) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value.runtimeInstanceId || ''))
    throw new RelayError('ENGINE_IDENTITY_INVALID');
  return value;
}

function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw new RelayError('SCHEMA_INVALID');
}

function event(state, role, value, priority = 'high') {
  if (priority === 'low') state.events = state.events.filter(item => !(item.role === role && item.priority === 'low'));
  if (state.events.length >= LIMITS.maxEvents) throw new RelayError('EVENT_JOURNAL_FULL', 503);
  state.events.push({ id: ++state.nextEventId, role, priority, value });
}

function rate(state, field, now, windowMs, maximum) {
  state[field] = state[field].filter(at => now - at < windowMs);
  if (state[field].length >= maximum) return false;
  state[field].push(now);
  return true;
}

export class DurableBroker {
  constructor(store, { now = () => Date.now() } = {}) { this.store = store; this.now = now; }

  async create({ userId, competitionId, participantRole }) {
    if (!/^user_[A-Za-z0-9]{8,80}$/.test(userId || '')) throw new RelayError('AUTH_REQUIRED', 401);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(competitionId || '')) throw new RelayError('COMPETITION_INVALID');
    if (!['white', 'black'].includes(participantRole)) throw new RelayError('ROLE_INVALID');
    const now = this.now(), sessionId = secret(), claimToken = secret();
    const state = {
      phase: 'UNCLAIMED', claimHash: hash(sessionId, claimToken), engineHash: null,
      engineClientId: null, claimUntil: now + LIMITS.claimMs, idleUntil: now + LIMITS.idleMs,
      expiresAt: now + LIMITS.hardMs, engineStreamUntil: null, mainStreamUntil: null,
      engineEpoch: 0, mainEpoch: 0, lastCommandSeq: 0, lastEngineSeq: 0,
      lastEngineCommandClaimedSeq: 0,
      pending: null, activeSearchId: null, completedSearchId: null,
      bestmove: null, stopped: false, cleanup: false, reuseReadyFor: null,
      identity: null, cleanupEvidence: null,
      seenSearchIds: [], events: [], nextEventId: 0, lastAck: null,
      mainAckCursor: 0, engineAckCursor: 0,
      commandTimes: [], infoTimes: [], reconnectTimes: [], claimAttempts: 0
    };
    const result = await this.store.create({ sessionId, ownerId: userId, competitionId,
      participantRole, createdAt: now, expiresAt: state.expiresAt, state });
    if (result === 'RATE_LIMIT') throw new RelayError('CREATE_RATE_LIMIT', 429);
    if (result === 'CONCURRENT_LIMIT') throw new RelayError('CONCURRENT_SESSION_LIMIT', 429);
    if (result !== true) throw new RelayError('STORE_UNAVAILABLE', 503);
    return { sessionId, claimToken, expiresAt: state.claimUntil };
  }

  async get(sessionId) {
    if (!idPattern.test(sessionId || '')) throw new RelayError('SESSION_INVALID');
    const row = await this.store.get(sessionId);
    if (!row) throw new RelayError('SESSION_GONE', 410);
    return row;
  }

  expired(state, now) {
    if (now >= state.expiresAt) return 'SESSION_EXPIRED';
    if (state.phase === 'UNCLAIMED' && now >= state.claimUntil) return 'CLAIM_EXPIRED';
    if (now >= state.idleUntil) return 'IDLE_EXPIRED';
    if (state.engineStreamUntil != null && now > state.engineStreamUntil + LIMITS.leaseMs)
      return 'ENGINE_LEASE_EXPIRED';
    if (state.mainStreamUntil != null && now > state.mainStreamUntil + LIMITS.leaseMs)
      return 'MAIN_LEASE_EXPIRED';
    if (state.pending && now >= state.pending.deadline && ['STOP', 'QUIT'].includes(state.pending.type))
      return `${state.pending.type}_TIMEOUT`;
    return null;
  }

  async mutate(sessionId, authorize, apply) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.get(sessionId), now = this.now();
      const expired = this.expired(row.state, now);
      if (expired) {
        await this.store.deleteIfVersion(sessionId, row.version);
        throw new RelayError(expired, 410);
      }
      authorize(row);
      const state = structuredClone(row.state);
      const result = apply(state, row, now);
      state.idleUntil = now + LIMITS.idleMs;
      if (await this.store.compareSwap(sessionId, row.version, state)) {
        if (result?.error) throw result.error;
        return result;
      }
    }
    throw new RelayError('CONCURRENT_UPDATE_RETRY', 503);
  }

  owner(userId) {
    if (!userId) throw new RelayError('AUTH_REQUIRED', 401);
    return row => { if (row.ownerId !== userId) throw new RelayError('SESSION_GONE', 404); };
  }

  engine(credential) {
    return row => {
      if (!equal(row.state.engineHash, hash(row.sessionId, credential)))
        throw new RelayError('ENGINE_CREDENTIAL_INVALID', 403);
    };
  }

  async inspect(sessionId, userId) {
    const row = await this.get(sessionId);
    this.owner(userId)(row);
    const expired = this.expired(row.state, this.now());
    if (expired) throw new RelayError(expired, 410);
    const { claimHash, engineHash, events, ...safe } = row.state;
    return { sessionId, competitionId: row.competitionId,
      participantRole: row.participantRole, state: safe };
  }

  async inspectEngine(sessionId, credential) {
    const row = await this.get(sessionId);
    this.engine(credential)(row);
    const expired = this.expired(row.state, this.now());
    if (expired) throw new RelayError(expired, 410);
    return { sessionId, phase: row.state.phase, lastEngineSeq: row.state.lastEngineSeq,
      activeSearchId: row.state.activeSearchId, identity: row.state.identity };
  }

  async claim(sessionId, claimToken) {
    if (typeof claimToken !== 'string' || claimToken.length > 128) throw new RelayError('CLAIM_INVALID', 403);
    const credential = secret(), engineClientId = secret();
    return this.mutate(sessionId, () => {}, (state, row) => {
      if (state.phase !== 'UNCLAIMED') return { error: new RelayError('CLAIM_ALREADY_USED', 409) };
      if (++state.claimAttempts > LIMITS.maxClaimAttempts) return { error: new RelayError('CLAIM_RATE_LIMIT', 429) };
      if (!equal(state.claimHash, hash(row.sessionId, claimToken)))
        return { error: new RelayError('CLAIM_INVALID', 403) };
      state.claimHash = null;
      state.engineHash = hash(row.sessionId, credential);
      state.engineClientId = engineClientId;
      state.phase = 'CLAIMED';
      return { sessionId, engineCredential: credential, engineClientId };
    });
  }

  async command(sessionId, userId, command) {
    keys(command, ['type', 'seq', 'fen', 'moves', 'searchId', 'mode', 'nodes']);
    if (bytes(command) > LIMITS.maxCommandBytes) throw new RelayError('COMMAND_TOO_LARGE', 413);
    return this.mutate(sessionId, this.owner(userId), (state, _row, now) => {
      const { type, seq, fen, moves, searchId, mode, nodes } = command;
      if (!Number.isSafeInteger(seq) || seq !== state.lastCommandSeq + 1)
        throw new RelayError('SEQUENCE_INVALID', 409);
      if (!rate(state, 'commandTimes', now, 1_000, LIMITS.maxCommandsPerSecond))
        return { error: new RelayError('COMMAND_RATE_LIMIT', 429) };
      if (state.pending) throw new RelayError('ACK_PENDING', 409);
      const phases = { HELLO: ['CLAIMED'], POSITION: ['READY', 'REUSE_READY'],
        GO: ['POSITION_ACKED'], STOP: ['SEARCHING'], RESET: ['STOPPED'],
        QUIT: ['STOPPED', 'REUSE_READY'] };
      if (!phases[type]?.includes(state.phase)) throw new RelayError('COMMAND_STATE_INVALID', 409);
      if (type === 'POSITION' && (typeof fen !== 'string' || fen.length > 256 ||
          (fen !== 'startpos' && !/^[KQkqpnbrPNBR1-8a-h\s/-]+\s[wb]\s(?:-|[KQkq]{1,4})\s(?:-|[a-h][36])\s\d{1,3}\s\d{1,4}$/.test(fen)) ||
          (moves !== undefined && (!Array.isArray(moves) || moves.length > 120 ||
            moves.some(move => typeof move !== 'string' || !movePattern.test(move))))))
        throw new RelayError('POSITION_INVALID');
      if (type !== 'POSITION' && (fen !== undefined || moves !== undefined)) throw new RelayError('SCHEMA_INVALID');
      if (type === 'GO' && !((mode === 'infinite' && nodes === undefined) ||
          (mode === 'nodes' && Number.isSafeInteger(nodes) && nodes >= 1 && nodes <= 64)))
        throw new RelayError('GO_INVALID');
      if (type !== 'GO' && (mode !== undefined || nodes !== undefined)) throw new RelayError('SCHEMA_INVALID');
      if (['GO', 'STOP', 'RESET'].includes(type)) {
        if (!searchPattern.test(searchId || '')) throw new RelayError('SEARCH_ID_INVALID');
        if (type === 'GO') {
          if (state.seenSearchIds.includes(searchId)) throw new RelayError('SEARCH_REPLAY', 409);
          state.seenSearchIds.push(searchId);
          state.activeSearchId = searchId;
          state.bestmove = null; state.stopped = false; state.reuseReadyFor = null;
        } else if (searchId !== state.activeSearchId) throw new RelayError('SEARCH_ID_MISMATCH', 409);
      } else if (searchId !== undefined) throw new RelayError('SCHEMA_INVALID');
      state.lastCommandSeq = seq;
      state.pending = { type, seq, searchId: searchId || null, deadline: now + LIMITS.ackMs };
      if (type === 'STOP') state.phase = 'STOPPING';
      if (type === 'RESET') state.phase = 'RESETTING';
      if (type === 'QUIT') state.phase = 'QUITTING';
      event(state, 'engine', { type, seq, ...(fen ? { fen, moves: moves || [] } : {}),
        ...(searchId ? { searchId } : {}), ...(mode ? { mode } : {}),
        ...(nodes ? { nodes } : {}) });
      return { accepted: true, seq, delivered: false };
    });
  }

  async engineMessage(sessionId, credential, message) {
    const shapes = { ACK: ['type', 'seq', 'command', 'commandSeq', 'searchId'],
      READY: ['type', 'seq', 'identity'], INFO: ['type', 'seq', 'searchId', 'depth', 'nodes', 'pv', 'score', 'emittedAt'],
      BESTMOVE: ['type', 'seq', 'searchId', 'move', 'emittedAt'],
      STOPPED: ['type', 'seq', 'searchId'], CLEANUP: ['type', 'seq', 'evidence'],
      ERROR: ['type', 'seq', 'code'] };
    keys(message, shapes[message?.type] || []);
    const size = bytes(message);
    const maximum = message.type === 'INFO' ? LIMITS.maxInfoBytes :
      message.type === 'BESTMOVE' ? LIMITS.maxBestmoveBytes :
      message.type === 'ERROR' ? LIMITS.maxErrorBytes : LIMITS.maxCommandBytes;
    if (size > maximum) throw new RelayError('MESSAGE_TOO_LARGE', 413);
    return this.mutate(sessionId, this.engine(credential), (state, _row, now) => {
      const { type, seq, searchId } = message;
      if (!Number.isSafeInteger(seq) || seq !== state.lastEngineSeq + 1)
        throw new RelayError('ENGINE_SEQUENCE_INVALID', 409);
      if (type === 'ACK') {
        const pending = state.pending;
        if (!pending || message.command !== pending.type || message.commandSeq !== pending.seq ||
            (pending.searchId || null) !== (searchId || null)) throw new RelayError('ACK_INVALID', 409);
        state.pending = null;
        state.lastAck = { command: pending.type, seq: pending.seq, searchId: pending.searchId };
        const next = { HELLO: 'HELLO_ACKED', POSITION: 'POSITION_ACKED', GO: 'SEARCHING',
          STOP: 'STOP_ACKED', RESET: 'RESET_ACKED', QUIT: 'QUIT_ACKED' };
        state.phase = next[pending.type];
        event(state, 'main', { type: 'ACK', command: pending.type,
          commandSeq: pending.seq, searchId: pending.searchId });
      } else if (type === 'READY') {
        if (!['HELLO_ACKED', 'RESET_ACKED'].includes(state.phase)) throw new RelayError('READY_STATE_INVALID', 409);
        const identity = verifiedIdentity(message.identity);
        if (state.identity && Object.keys(LC0_IDENTITY).concat('runtimeInstanceId')
          .some(key => state.identity[key] !== identity[key]))
          throw new RelayError('ENGINE_IDENTITY_CHANGED', 409);
        state.identity = identity;
        if (state.phase === 'RESET_ACKED') {
          state.phase = 'REUSE_READY'; state.reuseReadyFor = state.completedSearchId;
        } else state.phase = 'READY';
        event(state, 'main', { type: 'READY', identity });
      } else if (type === 'INFO') {
        if (!['SEARCHING', 'STOPPING'].includes(state.phase) || searchId !== state.activeSearchId)
          throw new RelayError('INFO_STATE_INVALID', 409);
        if (!Number.isSafeInteger(message.depth) || message.depth < 0 ||
            !Number.isSafeInteger(message.nodes) || message.nodes < 0 ||
            typeof message.pv !== 'string' ||
            bytes(message.pv) > LIMITS.maxPvBytes || typeof message.score !== 'number' ||
            !Number.isFinite(message.score)) throw new RelayError('INFO_INVALID');
        if (!rate(state, 'infoTimes', now, 1_000, LIMITS.maxInfoPerSecond))
          return { error: new RelayError('INFO_RATE_LIMIT', 429) };
        event(state, 'main', { type: 'INFO', searchId, depth: message.depth, nodes: message.nodes,
          pv: message.pv, score: message.score,
          emittedAt: Number.isSafeInteger(message.emittedAt) ? message.emittedAt : null }, 'low');
      } else if (type === 'BESTMOVE') {
        if (state.phase !== 'STOP_ACKED' || searchId !== state.activeSearchId || state.bestmove)
          throw new RelayError('BESTMOVE_STATE_INVALID', 409);
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(message.move || ''))
          throw new RelayError('BESTMOVE_INVALID');
        state.bestmove = message.move;
        state.completedSearchId = searchId;
        event(state, 'main', { type: 'BESTMOVE', searchId, move: message.move,
          emittedAt: Number.isSafeInteger(message.emittedAt) ? message.emittedAt : null });
      } else if (type === 'STOPPED') {
        if (state.phase !== 'STOP_ACKED' || !state.bestmove || searchId !== state.activeSearchId)
          throw new RelayError('STOPPED_STATE_INVALID', 409);
        state.stopped = true; state.phase = 'STOPPED';
        event(state, 'main', { type: 'STOPPED', searchId });
      } else if (type === 'CLEANUP') {
        if (state.phase !== 'QUIT_ACKED' || !state.stopped)
          throw new RelayError('CLEANUP_STATE_INVALID', 409);
        const evidence = message.evidence;
        keys(evidence, ['parentWorkers', 'pthreadWorkers', 'runtimeState', 'cleanupAcknowledged', 'forcedTerminations']);
        if (evidence.parentWorkers !== 0 || evidence.pthreadWorkers !== 0 ||
            evidence.runtimeState !== 'TERMINATED' || evidence.cleanupAcknowledged !== true ||
            evidence.forcedTerminations !== 0) throw new RelayError('CLEANUP_EVIDENCE_INVALID');
        state.cleanup = true; state.phase = 'CLEANED'; state.engineHash = null;
        state.cleanupEvidence = evidence;
        event(state, 'main', { type: 'CLEANUP', evidence });
      } else if (type === 'ERROR') {
        if (typeof message.code !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(message.code))
          throw new RelayError('ERROR_INVALID');
        event(state, 'main', { type: 'ERROR', code: message.code });
      } else throw new RelayError('MESSAGE_TYPE_INVALID');
      state.lastEngineSeq = seq;
      return { accepted: true, type };
    });
  }

  async claimCommand(sessionId, credential, commandSeq) {
    if (!Number.isSafeInteger(commandSeq) || commandSeq < 1) throw new RelayError('SEQUENCE_INVALID');
    return this.mutate(sessionId, this.engine(credential), state => {
      if (commandSeq <= state.lastEngineCommandClaimedSeq) return { execute: false, commandSeq };
      if (commandSeq !== state.lastEngineCommandClaimedSeq + 1 || commandSeq > state.lastCommandSeq ||
          !state.events.some(item => item.role === 'engine' && item.value.seq === commandSeq))
        throw new RelayError('COMMAND_DELIVERY_INVALID', 409);
      state.lastEngineCommandClaimedSeq = commandSeq;
      return { execute: true, commandSeq };
    });
  }

  async advance(sessionId, userId, mode, searchId) {
    return this.mutate(sessionId, this.owner(userId), state => {
      if (searchId !== state.completedSearchId || !state.bestmove || !state.stopped ||
          state.lastAck?.command !== (mode === 'release' ? 'QUIT' : 'RESET') ||
          (mode === 'release' ? !state.cleanup || state.phase !== 'CLEANED' :
            state.phase !== 'REUSE_READY' || state.reuseReadyFor !== searchId))
        throw new RelayError('ADVANCE_GATE_CLOSED', 409);
      return { advanceAllowed: true, mode, searchId };
    });
  }

  async terminate(sessionId, userId) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.get(sessionId);
      this.owner(userId)(row);
      if (await this.store.deleteIfVersion(sessionId, row.version)) return { terminated: true };
    }
    throw new RelayError('CONCURRENT_UPDATE_RETRY', 503);
  }

  async connect(sessionId, role, authority, cursor = 0) {
    if (!['main', 'engine'].includes(role) || !Number.isSafeInteger(cursor) || cursor < 0)
      throw new RelayError('STREAM_INVALID');
    const authorize = role === 'main' ? this.owner(authority) : this.engine(authority);
    return this.mutate(sessionId, authorize, (state, _row, now) => {
      if (role === 'engine' && ['CLEANED', 'UNCLAIMED'].includes(state.phase))
        throw new RelayError('ENGINE_DETACHED', 410);
      if (!rate(state, 'reconnectTimes', now, 60_000, LIMITS.maxReconnectsPerMinute))
        return { error: new RelayError('RECONNECT_RATE_LIMIT', 429) };
      const key = role === 'main' ? 'mainEpoch' : 'engineEpoch';
      const until = role === 'main' ? 'mainStreamUntil' : 'engineStreamUntil';
      const acknowledged = role === 'main' ? state.mainAckCursor : state.engineAckCursor;
      if (cursor < acknowledged) throw new RelayError('STREAM_CURSOR_STALE', 409);
      state[key]++;
      state[until] = now + LIMITS.streamHeartbeatMs;
      return { epoch: state[key], cursor };
    });
  }

  async heartbeat(sessionId, role, authority, epoch, cursor = 0) {
    if (!['main', 'engine'].includes(role) || !Number.isSafeInteger(epoch) || epoch < 1 ||
        !Number.isSafeInteger(cursor) || cursor < 0)
      throw new RelayError('HEARTBEAT_INVALID');
    const authorize = role === 'main' ? this.owner(authority) : this.engine(authority);
    return this.mutate(sessionId, authorize, (state, _row, now) => {
      const key = role === 'main' ? 'mainEpoch' : 'engineEpoch';
      const until = role === 'main' ? 'mainStreamUntil' : 'engineStreamUntil';
      const acknowledged = role === 'main' ? 'mainAckCursor' : 'engineAckCursor';
      if (state[key] !== epoch) throw new RelayError('STREAM_REPLACED', 409);
      if (cursor > state.nextEventId) throw new RelayError('STREAM_CURSOR_INVALID', 409);
      state[acknowledged] = Math.max(state[acknowledged], cursor);
      state.events = state.events.filter(item => item.id >
        (item.role === 'main' ? state.mainAckCursor : state.engineAckCursor));
      state[until] = now + LIMITS.streamHeartbeatMs;
      return { alive: true, epoch };
    });
  }

  async poll(sessionId, role, authority, epoch, cursor) {
    const authorize = role === 'main' ? this.owner(authority) : this.engine(authority);
    const key = role === 'main' ? 'mainEpoch' : 'engineEpoch';
    const select = state => {
      const available = state.events.filter(item => item.role === role && item.id > cursor);
      const high = available.filter(item => item.priority === 'high');
      const newestInfo = available.filter(item => item.priority === 'low').at(-1);
      return { events: [...high, ...(newestInfo ? [newestInfo] : [])],
        cursor: available.length ? Math.max(...available.map(item => item.id)) : cursor,
        phase: state.phase };
    };
    const row = await this.get(sessionId), now = this.now();
    authorize(row);
    const expired = this.expired(row.state, now);
    if (expired) throw new RelayError(expired, 410);
    if (row.state[key] !== epoch) throw new RelayError('STREAM_REPLACED', 409);
    return select(row.state);
  }

  async close(sessionId, role, authority, epoch) {
    try {
      const authorize = role === 'main' ? this.owner(authority) : this.engine(authority);
      await this.mutate(sessionId, authorize, (state, _row, now) => {
        const key = role === 'main' ? 'mainEpoch' : 'engineEpoch';
        const until = role === 'main' ? 'mainStreamUntil' : 'engineStreamUntil';
        if (state[key] === epoch) state[until] = now;
        return { closed: true };
      });
    } catch { /* A replaced or expired stream owns no authoritative state. */ }
  }
}

export const internals = { hash, equal };
