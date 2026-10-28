function positiveDuration(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name}_REQUIRED`);
  return value;
}

function timestamp(value, name) {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) throw new Error(`${name}_INVALID`);
  return time;
}

function boundedLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1000) throw new Error('LIFECYCLE_LIMIT_INVALID');
  return value;
}

export function planScannerImageLifecycle({
  now,
  orphanGraceMs,
  unboundUploadGraceMs,
  maxItems = 100,
  objects = [],
  grants = [],
  feedbackIds = []
}) {
  const nowMs = timestamp(now, 'LIFECYCLE_NOW');
  const orphanCutoff = nowMs - positiveDuration(orphanGraceMs, 'ORPHAN_GRACE_MS');
  const unboundCutoff = nowMs - positiveDuration(unboundUploadGraceMs, 'UNBOUND_UPLOAD_GRACE_MS');
  const limit = boundedLimit(maxItems);
  const trackedKeys = new Set(grants.map(item => String(item.objectKey || '')).filter(Boolean));
  const boundFeedback = new Set(feedbackIds.map(String));

  const orphanObjects = objects
    .filter(item => item.key && !trackedKeys.has(String(item.key)) && timestamp(item.createdAt, 'OBJECT_CREATED_AT') <= orphanCutoff)
    .map(item => ({ action: 'delete-untracked-object', objectKey: String(item.key), reason: 'no-governance-grant' }));

  const expiredReservations = grants
    .filter(item => item.status === 'reserved' && timestamp(item.expiresAt, 'GRANT_EXPIRES_AT') <= nowMs)
    .map(item => ({ action: 'expire-reservation', uploadId: String(item.uploadId), reason: 'grant-expired' }));

  const expiredUploads = grants
    .filter(item => item.status === 'uploading' && timestamp(item.expiresAt, 'GRANT_EXPIRES_AT') <= nowMs)
    .map(item => ({
      action: 'delete-expired-upload',
      uploadId: String(item.uploadId),
      objectKey: String(item.objectKey),
      reason: 'upload-completion-not-recorded'
    }));

  const strandedUploads = grants
    .filter(item => item.status === 'uploaded'
      && !boundFeedback.has(String(item.feedbackId))
      && timestamp(item.uploadedAt || item.createdAt, 'UPLOAD_CREATED_AT') <= unboundCutoff)
    .map(item => ({
      action: 'delete-stranded-upload',
      uploadId: String(item.uploadId),
      objectKey: String(item.objectKey),
      reason: 'uploaded-image-not-bound-to-feedback'
    }));

  const candidates = [...expiredReservations, ...expiredUploads, ...orphanObjects, ...strandedUploads]
    .sort((a, b) => `${a.action}:${a.objectKey || a.uploadId}`.localeCompare(`${b.action}:${b.objectKey || b.uploadId}`))
    .slice(0, limit);
  return Object.freeze({
    mode: 'dry-run',
    evaluatedAt: new Date(nowMs).toISOString(),
    configuredCutoffs: { orphanGraceMs, unboundUploadGraceMs },
    boundedAt: limit,
    candidateCount: candidates.length,
    candidates: Object.freeze(candidates)
  });
}

export async function executeScannerImageLifecycle(plan, {
  adapter,
  executionFlag,
  idempotencyKey,
  concurrency = 2
} = {}) {
  if (executionFlag !== 'SCANNER_LIFECYCLE_EXECUTION_APPROVED') throw new Error('LIFECYCLE_EXECUTION_DISABLED');
  if (!adapter || typeof adapter.deleteObject !== 'function' || typeof adapter.expireGrant !== 'function') {
    throw new Error('LIFECYCLE_ADAPTER_REQUIRED');
  }
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(String(idempotencyKey || ''))) throw new Error('LIFECYCLE_IDEMPOTENCY_KEY_INVALID');
  const width = Math.min(5, boundedLimit(concurrency));
  const queue = [...(plan?.candidates || [])];
  const results = [];
  async function worker() {
    while (queue.length) {
      const candidate = queue.shift();
      if (candidate.action === 'expire-reservation') {
        await adapter.expireGrant(candidate.uploadId, { idempotencyKey });
      } else {
        await adapter.deleteObject(candidate.objectKey, { idempotencyKey });
        if (candidate.uploadId) await adapter.expireGrant(candidate.uploadId, { idempotencyKey });
      }
      results.push({ ...candidate, completed: true });
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()));
  return Object.freeze({ idempotencyKey, completed: results.length, results });
}

