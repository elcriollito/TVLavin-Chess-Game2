import { inspectExactBooleanGate, sharedMentorGatesEnabled } from '../api/_lib/mentor-feature-gates.js';
import { parseMentorCanaryAllowlist } from '../api/_lib/mentor-canary-policy.js';

const env = process.env;
const globalGate = inspectExactBooleanGate(env.MENTOR_AI_ENABLED);
const sharedGate = inspectExactBooleanGate(env.MENTOR_SHARED_AI_ENABLED);
const allowlist = parseMentorCanaryAllowlist(env.CAISSA_MENTOR_RESERVATION_CANARY_USER_IDS);

console.log(JSON.stringify({
  mentorAi: globalGate,
  mentorSharedAi: sharedGate,
  sharedMentorEnabled: sharedMentorGatesEnabled(env),
  reservationsEnabled: env.CAISSA_MENTOR_RESERVATIONS_ENABLED === 'true',
  canaryAllowlist: { valid: allowlist.ok, count: allowlist.ok ? allowlist.count : 0 }
}));
