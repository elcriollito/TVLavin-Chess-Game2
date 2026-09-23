export const CONTROL_MODES = Object.freeze(['ENABLED', 'DRAINING', 'DISABLED']);

export const LIFECYCLE_STATES = Object.freeze([
  'CREATED', 'CLAIMED', 'INITIALIZING', 'READY', 'SEARCHING', 'STOPPING',
  'IDLE', 'DISCONNECTED_GRACE', 'CLEANING', 'CLEANED', 'FAILED', 'EXPIRED'
]);

export const TERMINAL_LIFECYCLE_STATES = Object.freeze(['CLEANED', 'FAILED', 'EXPIRED']);

export const PRODUCTION_POLICY = Object.freeze({
  claimMs: 60_000,
  heartbeatEveryMs: 5_000,
  heartbeatLeaseMs: 30_000,
  reconnectGraceMs: 20_000,
  idleMs: 10 * 60_000,
  absoluteMs: 2 * 60 * 60_000,
  stopWarningMs: 3_000,
  stopTimeoutMs: 10_000,
  stopResultMs: 5_000,
  terminalRetentionMs: 7 * 24 * 60 * 60_000,
  cleanupBatchSize: 100,
  acceptedInfoPerSecond: 4,
  reconnectsPerMinute: 12,
  pollInitialMs: 100,
  pollMaximumMs: 1_000,
  pollBackoffFactor: 2,
  streamCommentMs: 15_000
});

const TRANSITIONS = Object.freeze({
  CREATED: ['CLAIMED', 'EXPIRED', 'FAILED'],
  CLAIMED: ['INITIALIZING', 'DISCONNECTED_GRACE', 'CLEANING', 'FAILED', 'EXPIRED'],
  INITIALIZING: ['READY', 'DISCONNECTED_GRACE', 'CLEANING', 'FAILED', 'EXPIRED'],
  READY: ['SEARCHING', 'DISCONNECTED_GRACE', 'CLEANING', 'FAILED', 'EXPIRED'],
  SEARCHING: ['STOPPING', 'DISCONNECTED_GRACE', 'FAILED', 'EXPIRED'],
  STOPPING: ['IDLE', 'DISCONNECTED_GRACE', 'FAILED', 'EXPIRED'],
  IDLE: ['INITIALIZING', 'DISCONNECTED_GRACE', 'CLEANING', 'FAILED', 'EXPIRED'],
  DISCONNECTED_GRACE: [
    'CLAIMED', 'INITIALIZING', 'READY', 'SEARCHING', 'STOPPING', 'IDLE',
    'CLEANING', 'FAILED', 'EXPIRED'
  ],
  CLEANING: ['CLEANED', 'DISCONNECTED_GRACE', 'FAILED', 'EXPIRED'],
  CLEANED: [],
  FAILED: [],
  EXPIRED: []
});

export function normalizeControlMode(value, fallback = 'DISABLED') {
  const mode = String(value || '').toUpperCase();
  return CONTROL_MODES.includes(mode) ? mode : fallback;
}

export function transitionLifecycle(state, next, now = Date.now()) {
  const current = state.lifecycle || 'CREATED';
  if (!LIFECYCLE_STATES.includes(next) || !TRANSITIONS[current]?.includes(next)) {
    const error = new Error(`LIFECYCLE_TRANSITION_INVALID:${current}:${next}`);
    error.code = 'LIFECYCLE_TRANSITION_INVALID';
    throw error;
  }
  if (next === 'DISCONNECTED_GRACE') {
    state.lifecycleBeforeDisconnect = current;
  } else if (current === 'DISCONNECTED_GRACE') {
    state.lifecycleBeforeDisconnect = null;
  }
  state.lifecycle = next;
  state.lifecycleChangedAt = now;
  if (TERMINAL_LIFECYCLE_STATES.includes(next)) state.terminalAt = now;
  return next;
}

export function restoreLifecycleAfterReconnect(state, now = Date.now()) {
  if (state.lifecycle !== 'DISCONNECTED_GRACE') return state.lifecycle;
  const target = state.lifecycleBeforeDisconnect;
  if (!target || TERMINAL_LIFECYCLE_STATES.includes(target)) {
    const error = new Error('LIFECYCLE_RECONNECT_INVALID');
    error.code = 'LIFECYCLE_RECONNECT_INVALID';
    throw error;
  }
  return transitionLifecycle(state, target, now);
}

export function assertLifecycleLive(state) {
  if (TERMINAL_LIFECYCLE_STATES.includes(state.lifecycle)) {
    const error = new Error(`SESSION_${state.lifecycle}`);
    error.code = `SESSION_${state.lifecycle}`;
    throw error;
  }
}

export function nextPollDelay(current, hadEvents) {
  if (hadEvents) return PRODUCTION_POLICY.pollInitialMs;
  const base = Number.isFinite(current) && current > 0
    ? current : PRODUCTION_POLICY.pollInitialMs;
  return Math.min(PRODUCTION_POLICY.pollMaximumMs,
    Math.ceil(base * PRODUCTION_POLICY.pollBackoffFactor));
}

export function controlPolicy(mode, action, messageType = null) {
  const normalized = normalizeControlMode(mode);
  if (normalized === 'ENABLED') return { allowed: true, mode: normalized };
  if (action === 'create') return { allowed: false, mode: normalized,
    code: normalized === 'DRAINING' ? 'LC0_DRAINING' : 'LC0_DISABLED' };
  if (normalized === 'DRAINING') return { allowed: true, mode: normalized };
  if (action === 'command' && !['STOP', 'QUIT'].includes(messageType))
    return { allowed: false, mode: normalized, code: 'LC0_DISABLED' };
  if (action === 'message' && !['ACK', 'BESTMOVE', 'STOPPED', 'CLEANUP', 'ERROR'].includes(messageType))
    return { allowed: false, mode: normalized, code: 'LC0_DISABLED' };
  return { allowed: true, mode: normalized };
}
