import crypto from 'node:crypto';

export const MENTOR_RESULT_SCHEMA = 'MENTOR_RESULT_JSON_V1';
export const MENTOR_RESULT_MAX_BYTES = 320 * 1024;
const bytes = value => Buffer.isBuffer(value) ? value
  : typeof value === 'string' && value.startsWith('\\x') ? Buffer.from(value.slice(2), 'hex')
  : Buffer.from(value);

function keyFromEnv(env) {
  const encoded = env.CAISSA_MENTOR_RESULT_ENCRYPTION_KEY;
  if (typeof encoded !== 'string') throw new Error('RESULT_ENCRYPTION_UNAVAILABLE');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('RESULT_ENCRYPTION_UNAVAILABLE');
  return key;
}
export function mentorResultEncryptionReady(env = process.env) {
  try { keyFromEnv(env); return true; } catch { return false; }
}
const aad = ({ operationId, userId }) => Buffer.from(`${MENTOR_RESULT_SCHEMA}:${operationId}:${userId}`, 'utf8');

export function encryptMentorResult(value, binding, env = process.env) {
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.length > MENTOR_RESULT_MAX_BYTES) throw new Error('RESULT_TOO_LARGE');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromEnv(env), iv);
  cipher.setAAD(aad(binding));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), plaintextBytes: plaintext.length, schemaVersion: MENTOR_RESULT_SCHEMA };
}

export function decryptMentorResult(record, binding, env = process.env) {
  if (record.schema_version !== MENTOR_RESULT_SCHEMA) throw new Error('RESULT_SCHEMA_INVALID');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromEnv(env), bytes(record.iv));
  decipher.setAAD(aad(binding));
  decipher.setAuthTag(bytes(record.auth_tag));
  const plaintext = Buffer.concat([decipher.update(bytes(record.ciphertext)), decipher.final()]);
  if (plaintext.length > MENTOR_RESULT_MAX_BYTES) throw new Error('RESULT_TOO_LARGE');
  return JSON.parse(plaintext.toString('utf8'));
}

export function mentorResultExpiry(env = process.env, now = Date.now()) {
  const requested = Number(env.CAISSA_MENTOR_RESULT_TTL_MINUTES || 15);
  const minutes = Number.isFinite(requested) ? Math.min(60, Math.max(5, requested)) : 15;
  return new Date(now + minutes * 60000).toISOString();
}
