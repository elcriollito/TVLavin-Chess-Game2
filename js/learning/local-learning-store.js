import {
  CONSENT_SCOPE,
  LEARNING_CONSENT_VERSION,
  LEARNING_EVENT_VERSION,
  LEARNING_EVIDENCE_VERSION,
  LEARNING_PROGRESS_VERSION,
  createConsentState,
  deriveEducationalEvidence,
  deriveLearnerProgress,
  validateConsentState,
  validateEvidenceRecord,
  validateInteractionEvent,
  validateLearnerProgress
} from './learning-progress-contracts.js';
import { REVIEW_TRIGGERS } from './review-explanations.js';

export const LOCAL_LEARNING_STORAGE_KEY = 'caissa:learning-progress:v1';
export const LOCAL_LEARNING_SCHEMA_VERSION = 2;
export const LOCAL_LEARNING_EXPORT_FORMAT = 'caissa-learning-progress-export';
export const LOCAL_LEARNING_EXPORT_VERSION = 2;
export const LOCAL_LEARNING_LIMITS = Object.freeze({
  units: 17, events: 160, evidence: 240, deduplication: 500, importBytes: 262144
});

const RELEASE_ID = /^rel-[a-f0-9]{64}$/;
const UNIT_ID = /^ku:endgames:[a-z0-9-]+:[a-z0-9-]+$/;
const STABLE_ID = /^[a-z0-9][a-z0-9:._-]{0,159}$/i;
const clone = value => structuredClone(value);
const immutable = value => Object.freeze(clone(value));
const iso = value => {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key));
const stable = value => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const fingerprint = value => {
  let hash = 2166136261;
  for (const character of stable(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
const result = (ok, code, extra = {}) => Object.freeze({ ok, code, ...extra });
const recordKey = record => `${record.releaseId}:${record.unitId}`;
const sortRecords = records => [...records].sort((a, b) =>
  String(a.createdAt ?? a.occurredAt ?? a.unitId).localeCompare(String(b.createdAt ?? b.occurredAt ?? b.unitId))
  || String(a.evidenceId ?? a.eventId ?? recordKey(a)).localeCompare(String(b.evidenceId ?? b.eventId ?? recordKey(b))));
const dismissalSupported = (dismissal, evidence) => {
  const records = evidence.filter(item => item.unitId === dismissal.unitId && item.releaseId === dismissal.releaseId);
  if (dismissal.triggerType === 'misconception-evidence-present') return records.some(item => item.evidenceType === 'misconception');
  if (dismissal.triggerType === 'assessment-unsuccessful') return records.filter(item => item.evidenceType === 'remediation-needed').length >= 2;
  if (dismissal.triggerType === 'repeated-final-hint-dependence') return records.filter(item => item.evidenceType === 'guided-success' && item.hintDependence === 'final-answer').length >= 2;
  if (dismissal.triggerType === 'repeated-decision-process-hint-dependence') return records.filter(item => item.evidenceType === 'guided-success' && item.hintDependence === 'decision-process').length >= 2;
  if (dismissal.triggerType === 'guided-success-without-independent-success') return records.some(item => item.evidenceType === 'guided-success');
  return dismissal.triggerType === 'assessment-not-yet-attempted'
    && records.some(item => ['participation', 'exposure'].includes(item.evidenceType));
};

function contextForEvent(event) {
  return {
    releaseId: event.releaseId,
    unitIds: [event.unitId],
    positionIds: event.positionId === null ? [] : [event.positionId],
    learningObjectIds: event.learningObjectId === null ? [] : [event.learningObjectId],
    assessmentItemIds: event.assessmentItemId === null ? [] : [event.assessmentItemId]
  };
}

function emptyEnvelope(consent, now) {
  const timestamp = iso(now);
  return {
    schemaVersion: LOCAL_LEARNING_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    consent,
    releaseIds: [],
    progressByUnit: {},
    evidence: [],
    events: [],
    deduplication: [],
    migration: { applied: [], migratedAt: null },
    retention: { ...LOCAL_LEARNING_LIMITS, policy: 'evidence-first-bounded-v1' },
    importProvenance: [],
    reviewDismissals: {},
    integrity: { algorithm: 'fnv1a32', digest: null }
  };
}

function withIntegrity(envelope) {
  const candidate = clone(envelope);
  candidate.integrity = { algorithm: 'fnv1a32', digest: null };
  candidate.integrity.digest = fingerprint(candidate);
  return candidate;
}

export function validateLocalLearningEnvelope(envelope) {
  const errors = [];
  const keys = ['schemaVersion', 'createdAt', 'updatedAt', 'consent', 'releaseIds', 'progressByUnit',
    'evidence', 'events', 'deduplication', 'migration', 'retention', 'importProvenance', 'reviewDismissals', 'integrity'];
  if (!exact(envelope, keys)) return result(false, 'invalid-envelope', { errors: ['invalid-envelope-shape'] });
  if (envelope.schemaVersion !== LOCAL_LEARNING_SCHEMA_VERSION) errors.push(envelope.schemaVersion > LOCAL_LEARNING_SCHEMA_VERSION ? 'unsupported-future-version' : 'unsupported-schema-version');
  if (!iso(envelope.createdAt) || iso(envelope.createdAt) !== envelope.createdAt
    || !iso(envelope.updatedAt) || iso(envelope.updatedAt) !== envelope.updatedAt
    || envelope.updatedAt < envelope.createdAt) errors.push('invalid-store-time');
  errors.push(...validateConsentState(envelope.consent).errors);
  if (!Array.isArray(envelope.releaseIds) || envelope.releaseIds.some(id => !RELEASE_ID.test(id)) || new Set(envelope.releaseIds).size !== envelope.releaseIds.length) errors.push('invalid-release-ids');
  if (!envelope.progressByUnit || typeof envelope.progressByUnit !== 'object' || Array.isArray(envelope.progressByUnit)) errors.push('invalid-progress-map');
  const progress = envelope.progressByUnit && typeof envelope.progressByUnit === 'object' ? Object.values(envelope.progressByUnit) : [];
  if (progress.length > LOCAL_LEARNING_LIMITS.units) errors.push('progress-limit-exceeded');
  for (const item of progress) {
    errors.push(...validateLearnerProgress(item, envelope.consent).errors);
    if (recordKey(item) === undefined || envelope.progressByUnit[recordKey(item)] !== item) errors.push('invalid-progress-key');
  }
  if (!Array.isArray(envelope.events) || envelope.events.length > LOCAL_LEARNING_LIMITS.events) errors.push('invalid-event-list');
  const events = Array.isArray(envelope.events) ? envelope.events : [];
  for (const event of events) errors.push(...validateInteractionEvent(event, contextForEvent(event)).errors);
  const eventIds = events.map(event => event.eventId);
  if (new Set(eventIds).size !== eventIds.length) errors.push('duplicate-event-id');
  if (!Array.isArray(envelope.evidence) || envelope.evidence.length > LOCAL_LEARNING_LIMITS.evidence) errors.push('invalid-evidence-list');
  const evidence = Array.isArray(envelope.evidence) ? envelope.evidence : [];
  for (const item of evidence) errors.push(...validateEvidenceRecord(item, events).errors);
  if (new Set(evidence.map(item => item.evidenceId)).size !== evidence.length) errors.push('duplicate-evidence-id');
  if (!Array.isArray(envelope.deduplication) || envelope.deduplication.length > LOCAL_LEARNING_LIMITS.deduplication
    || envelope.deduplication.some(item => !exact(item, ['eventId', 'fingerprint', 'occurredAt'])
      || typeof item.eventId !== 'string' || typeof item.fingerprint !== 'string' || iso(item.occurredAt) !== item.occurredAt)) errors.push('invalid-deduplication');
  if (new Set(envelope.deduplication?.map(item => item.eventId)).size !== envelope.deduplication?.length) errors.push('duplicate-deduplication-id');
  if (!exact(envelope.migration, ['applied', 'migratedAt']) || !Array.isArray(envelope.migration?.applied)) errors.push('invalid-migration-metadata');
  if (!exact(envelope.retention, ['units', 'events', 'evidence', 'deduplication', 'importBytes', 'policy'])) errors.push('invalid-retention-metadata');
  if (!Array.isArray(envelope.importProvenance) || envelope.importProvenance.length > 20) errors.push('invalid-import-provenance');
  if (!envelope.reviewDismissals || typeof envelope.reviewDismissals !== 'object' || Array.isArray(envelope.reviewDismissals)
    || Object.values(envelope.reviewDismissals).some(item => !exact(item, ['explanationId', 'triggerType', 'unitId', 'releaseId', 'dismissedAt'])
      || !STABLE_ID.test(item.explanationId ?? '') || !REVIEW_TRIGGERS.includes(item.triggerType)
      || !UNIT_ID.test(item.unitId ?? '') || !RELEASE_ID.test(item.releaseId ?? '')
      || iso(item.dismissedAt) !== item.dismissedAt)) errors.push('invalid-review-dismissals');
  if (envelope.reviewDismissals && typeof envelope.reviewDismissals === 'object'
    && Object.values(envelope.reviewDismissals).some(item => !dismissalSupported(item, evidence))) errors.push('orphan-review-dismissal');
  if (!exact(envelope.integrity, ['algorithm', 'digest']) || envelope.integrity?.algorithm !== 'fnv1a32') errors.push('invalid-integrity');
  if (!errors.length) {
    const expected = withIntegrity(envelope).integrity.digest;
    if (envelope.integrity.digest !== expected) errors.push('integrity-mismatch');
  }
  return errors.length ? result(false, errors.includes('unsupported-future-version') ? 'unsupported-future-version' : 'invalid-envelope', { errors: [...new Set(errors)].sort() }) : result(true, 'valid');
}

export function migrateLocalLearningEnvelope(input, now = Date.now()) {
  const source = clone(input);
  if (source?.schemaVersion === LOCAL_LEARNING_SCHEMA_VERSION) return result(true, 'current', { envelope: immutable(source), migrated: false });
  if (Number(source?.schemaVersion) > LOCAL_LEARNING_SCHEMA_VERSION) return result(false, 'unsupported-future-version');
  if (source?.schemaVersion === 1) {
    const migrated = withIntegrity({
      ...source,
      schemaVersion: LOCAL_LEARNING_SCHEMA_VERSION,
      reviewDismissals: {},
      migration: {
        applied: [...(source.migration?.applied ?? []), 'season-9.3.2-v1-to-season-9.3.3-v2'],
        migratedAt: iso(now)
      }
    });
    const validation = validateLocalLearningEnvelope(migrated);
    return validation.ok ? result(true, 'migrated', { envelope: immutable(migrated), migrated: true })
      : result(false, 'migration-failed', { errors: validation.errors });
  }
  if (source?.schemaVersion !== 0 || source?.previewDraft !== true) return result(false, 'unsupported-schema-version');
  const consent = source.consent ?? createConsentState();
  const migrated = withIntegrity({
    ...emptyEnvelope(consent, source.createdAt ?? now),
    updatedAt: iso(source.updatedAt ?? now),
    events: source.events ?? [],
    evidence: source.evidence ?? [],
    progressByUnit: source.progressByUnit ?? {},
    releaseIds: source.releaseIds ?? [],
    migration: { applied: ['development-preview-v0-to-v1'], migratedAt: iso(now) }
  });
  const validation = validateLocalLearningEnvelope(migrated);
  return validation.ok ? result(true, 'migrated', { envelope: immutable(migrated), migrated: true }) : result(false, 'migration-failed', { errors: validation.errors });
}

function parseRaw(raw, now) {
  if (raw === null) return result(true, 'empty', { envelope: null, raw: null });
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return result(false, 'invalid-json', { raw }); }
  const migration = migrateLocalLearningEnvelope(parsed, now);
  if (!migration.ok) return result(false, migration.code, { raw, errors: migration.errors ?? [] });
  const validation = validateLocalLearningEnvelope(migration.envelope);
  if (!validation.ok) return result(false, validation.code, { raw, errors: validation.errors });
  return result(true, migration.migrated ? 'migrated' : 'loaded', { envelope: migration.envelope, raw, migrated: migration.migrated });
}

function mergeProgress(previous, next) {
  if (!previous) return next;
  const rank = ['not-started', 'explored', 'practicing', 'assessed', 'review-suggested'];
  const state = previous.state === 'review-suggested' || next.state === 'review-suggested'
    ? next.state
    : rank.indexOf(previous.state) > rank.indexOf(next.state) ? previous.state : next.state;
  return {
    ...next,
    state,
    firstActivityAt: [previous.firstActivityAt, next.firstActivityAt].filter(Boolean).sort()[0] ?? null,
    mostRecentActivityAt: [previous.mostRecentActivityAt, next.mostRecentActivityAt].filter(Boolean).sort().at(-1) ?? null,
    sessionsCount: Math.max(previous.sessionsCount, next.sessionsCount),
    positionsExplored: Math.max(previous.positionsExplored, next.positionsExplored),
    learningObjectsAttempted: Math.max(previous.learningObjectsAttempted, next.learningObjectsAttempted),
    assessmentEvidenceCount: Math.max(previous.assessmentEvidenceCount, next.assessmentEvidenceCount)
  };
}

function applyRetention(envelope) {
  let events = sortRecords(envelope.events);
  if (events.length > LOCAL_LEARNING_LIMITS.events) {
    const priority = event => event.classification === 'evaluative' ? 2 : event.classification === 'practice' ? 1 : 0;
    events = [...events].sort((a, b) => priority(b) - priority(a) || b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, LOCAL_LEARNING_LIMITS.events);
  }
  const retainedIds = new Set(events.map(event => event.eventId));
  const evidence = sortRecords(envelope.evidence).filter(item => item.sourceEventIds.every(id => retainedIds.has(id)))
    .slice(-LOCAL_LEARNING_LIMITS.evidence);
  return {
    ...envelope,
    events: sortRecords(events),
    evidence,
    deduplication: envelope.deduplication.slice(-LOCAL_LEARNING_LIMITS.deduplication),
    importProvenance: envelope.importProvenance.slice(-20)
  };
}

function summary(envelope) {
  return immutable({
    consent: envelope?.consent ?? createConsentState(),
    progressByUnit: envelope?.progressByUnit ?? {},
    releases: envelope?.releaseIds ?? [],
    totals: {
      units: Object.keys(envelope?.progressByUnit ?? {}).length,
      events: envelope?.events?.length ?? 0,
      evidence: envelope?.evidence?.length ?? 0
    }
  });
}

export function createLocalLearningStore({ storage = globalThis.localStorage, now = Date.now, context = null } = {}) {
  let currentContext = context;
  let cached = null;
  let lastLoad = result(true, 'empty', { envelope: null });
  const read = () => {
    let raw;
    try { raw = storage?.getItem?.(LOCAL_LEARNING_STORAGE_KEY) ?? null; }
    catch { lastLoad = result(false, 'storage-unavailable'); return lastLoad; }
    lastLoad = parseRaw(raw, now());
    cached = lastLoad.ok ? lastLoad.envelope : null;
    return lastLoad;
  };
  const commit = candidate => {
    const validation = validateLocalLearningEnvelope(candidate);
    if (!validation.ok) return result(false, validation.code, { errors: validation.errors });
    try { storage?.setItem?.(LOCAL_LEARNING_STORAGE_KEY, JSON.stringify(candidate)); }
    catch (error) { return result(false, error?.name === 'QuotaExceededError' ? 'storage-quota-exceeded' : 'storage-write-failed'); }
    cached = immutable(candidate);
    return result(true, 'committed', { summary: summary(cached) });
  };
  const requireReadable = () => {
    const loaded = read();
    return loaded.ok ? loaded : result(false, loaded.code, { errors: loaded.errors ?? [] });
  };
  const setConsent = state => {
    const loaded = requireReadable();
    if (!loaded.ok) return loaded;
    if (!['unknown', 'declined', 'local-progress-enabled'].includes(state)) return result(false, 'invalid-consent-state');
    const timestamp = now();
    const consent = createConsentState({ state, occurredAt: state === 'unknown' ? null : timestamp });
    const base = loaded.envelope ?? emptyEnvelope(consent, timestamp);
    return commit(withIntegrity({ ...base, consent, updatedAt: iso(timestamp) }));
  };
  const appendInteractionEvent = event => {
    const loaded = requireReadable();
    if (!loaded.ok) return loaded;
    if (!loaded.envelope || loaded.envelope.consent.state !== 'local-progress-enabled') return result(false, 'consent-required');
    if (!currentContext) return result(false, 'learning-context-required');
    const validation = validateInteractionEvent(event, currentContext);
    if (!validation.ok || !event.persistenceEligible || event.consentState !== 'local-progress-enabled') return result(false, 'invalid-event', { errors: validation.errors });
    const eventFingerprint = fingerprint(event);
    const prior = loaded.envelope.deduplication.find(item => item.eventId === event.eventId);
    if (prior) return prior.fingerprint === eventFingerprint
      ? result(true, 'duplicate-noop', { summary: summary(loaded.envelope) })
      : result(false, 'event-id-conflict');
    const retainSource = event.classification === 'practice' || event.classification === 'evaluative' || event.eventType === 'position-selected';
    const events = retainSource ? [...loaded.envelope.events, clone(event)] : [...loaded.envelope.events];
    const derived = deriveEducationalEvidence([event], currentContext);
    const evidence = retainSource ? [...loaded.envelope.evidence, ...derived] : [...loaded.envelope.evidence];
    const unitEvents = [...events.filter(item => item.unitId === event.unitId && item.releaseId === event.releaseId), ...(retainSource ? [] : [event])];
    const unitEvidence = [...evidence.filter(item => item.unitId === event.unitId && item.releaseId === event.releaseId), ...(retainSource ? [] : derived)];
    const nextProgress = deriveLearnerProgress({
      unitId: event.unitId, releaseId: event.releaseId, events: unitEvents,
      evidence: unitEvidence, consent: loaded.envelope.consent
    });
    const key = recordKey(event);
    let candidate = {
      ...loaded.envelope,
      updatedAt: iso(now()),
      releaseIds: [...new Set([...loaded.envelope.releaseIds, event.releaseId])].sort(),
      events,
      evidence,
      progressByUnit: { ...loaded.envelope.progressByUnit, [key]: mergeProgress(loaded.envelope.progressByUnit[key], nextProgress) },
      deduplication: [...loaded.envelope.deduplication, { eventId: event.eventId, fingerprint: eventFingerprint, occurredAt: event.occurredAt }]
    };
    candidate = withIntegrity(applyRetention(candidate));
    return commit(candidate);
  };
  const clearUnit = (releaseId, unitId) => {
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    if (!loaded.envelope) return result(true, 'empty', { summary: summary(null) });
    const key = `${releaseId}:${unitId}`;
    const progressByUnit = { ...loaded.envelope.progressByUnit }; delete progressByUnit[key];
    const removedIds = new Set(loaded.envelope.events.filter(item => item.releaseId === releaseId && item.unitId === unitId).map(item => item.eventId));
    const candidate = withIntegrity({
      ...loaded.envelope, updatedAt: iso(now()), progressByUnit,
      events: loaded.envelope.events.filter(item => !removedIds.has(item.eventId)),
      evidence: loaded.envelope.evidence.filter(item => item.releaseId !== releaseId || item.unitId !== unitId),
      deduplication: loaded.envelope.deduplication.filter(item => !removedIds.has(item.eventId)),
      releaseIds: [...new Set(Object.values(progressByUnit).map(item => item.releaseId))].sort()
    });
    return commit(candidate);
  };
  const clearAll = ({ disable = false } = {}) => {
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    if (!loaded.envelope) return result(true, 'empty', { summary: summary(null) });
    const consent = disable ? createConsentState({ state: 'declined', occurredAt: now(), clearData: true }) : loaded.envelope.consent;
    const candidate = withIntegrity({ ...emptyEnvelope(consent, loaded.envelope.createdAt), updatedAt: iso(now()) });
    return commit(candidate);
  };
  const exportData = () => {
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    const envelope = loaded.envelope;
    const payload = {
      format: LOCAL_LEARNING_EXPORT_FORMAT, formatVersion: LOCAL_LEARNING_EXPORT_VERSION,
      exportedAt: iso(now()), sourceApplication: 'CAISSA Chess', storageSchemaVersion: LOCAL_LEARNING_SCHEMA_VERSION,
      releaseIds: envelope?.releaseIds ?? [], progressByUnit: envelope?.progressByUnit ?? {},
      evidence: envelope?.evidence ?? [], events: envelope?.events ?? [],
      deduplication: envelope?.deduplication ?? [],
      reviewDismissals: envelope?.reviewDismissals ?? {},
      integrity: { algorithm: 'fnv1a32', digest: null }
    };
    payload.integrity.digest = fingerprint(payload);
    return result(true, 'export-ready', { json: `${stable(payload)}\n`, summary: summary(envelope) });
  };
  const previewImport = json => {
    if (typeof json !== 'string' || new TextEncoder().encode(json).length > LOCAL_LEARNING_LIMITS.importBytes) return result(false, 'import-too-large');
    let payload; try { payload = JSON.parse(json); } catch { return result(false, 'invalid-import-json'); }
    const baseKeys = ['format', 'formatVersion', 'exportedAt', 'sourceApplication', 'storageSchemaVersion', 'releaseIds', 'progressByUnit', 'evidence', 'events', 'deduplication', 'integrity'];
    const supportedV1 = payload?.formatVersion === 1 && payload?.storageSchemaVersion === 1 && exact(payload, baseKeys);
    const supportedV2 = payload?.formatVersion === LOCAL_LEARNING_EXPORT_VERSION
      && payload?.storageSchemaVersion === LOCAL_LEARNING_SCHEMA_VERSION && exact(payload, [...baseKeys, 'reviewDismissals']);
    if ((!supportedV1 && !supportedV2) || payload.format !== LOCAL_LEARNING_EXPORT_FORMAT
      || payload.integrity?.digest !== fingerprint({ ...payload, integrity: { algorithm: 'fnv1a32', digest: null } })) return result(false, 'invalid-import-format');
    const previewEnvelope = withIntegrity({
      ...emptyEnvelope(createConsentState(), payload.exportedAt),
      updatedAt: payload.exportedAt, releaseIds: payload.releaseIds, progressByUnit: payload.progressByUnit,
      evidence: payload.evidence, events: payload.events, deduplication: payload.deduplication,
      reviewDismissals: payload.reviewDismissals ?? {}
    });
    const validation = validateLocalLearningEnvelope(previewEnvelope);
    return validation.ok ? result(true, 'import-preview', { payload: immutable(payload), summary: summary(previewEnvelope) })
      : result(false, 'invalid-import-records', { errors: validation.errors });
  };
  const mergeImport = json => {
    const preview = previewImport(json); if (!preview.ok) return preview;
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    if (!loaded.envelope || loaded.envelope.consent.state !== 'local-progress-enabled') return result(false, 'consent-required');
    const byId = new Map(loaded.envelope.deduplication.map(item => [item.eventId, item.fingerprint]));
    for (const item of preview.payload.deduplication) if (byId.has(item.eventId) && byId.get(item.eventId) !== item.fingerprint) return result(false, 'event-id-conflict');
    const eventMap = new Map(loaded.envelope.events.map(item => [item.eventId, item]));
    preview.payload.events.forEach(item => eventMap.set(item.eventId, item));
    const evidenceMap = new Map(loaded.envelope.evidence.map(item => [item.evidenceId, item]));
    preview.payload.evidence.forEach(item => evidenceMap.set(item.evidenceId, item));
    const dedupMap = new Map(loaded.envelope.deduplication.map(item => [item.eventId, item]));
    preview.payload.deduplication.forEach(item => dedupMap.set(item.eventId, item));
    const progressByUnit = { ...loaded.envelope.progressByUnit };
    for (const [key, item] of Object.entries(preview.payload.progressByUnit)) progressByUnit[key] = mergeProgress(progressByUnit[key], item);
    const reviewDismissals = { ...loaded.envelope.reviewDismissals };
    for (const [key, item] of Object.entries(preview.payload.reviewDismissals ?? {})) {
      if (!dismissalSupported(item, preview.payload.evidence)) return result(false, 'orphan-review-dismissal');
      if (!reviewDismissals[key] || reviewDismissals[key].dismissedAt < item.dismissedAt) reviewDismissals[key] = item;
    }
    let candidate = applyRetention({
      ...loaded.envelope, updatedAt: iso(now()),
      releaseIds: [...new Set([...loaded.envelope.releaseIds, ...preview.payload.releaseIds])].sort(),
      progressByUnit, events: [...eventMap.values()], evidence: [...evidenceMap.values()],
      deduplication: [...dedupMap.values()], reviewDismissals,
      importProvenance: [...loaded.envelope.importProvenance, {
        importedAt: iso(now()), format: LOCAL_LEARNING_EXPORT_FORMAT,
        formatVersion: LOCAL_LEARNING_EXPORT_VERSION, digest: preview.payload.integrity.digest
      }]
    });
    candidate = withIntegrity(candidate);
    return commit(candidate);
  };
  const dismissReview = explanation => {
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    if (!loaded.envelope || loaded.envelope.consent.state !== 'local-progress-enabled') return result(false, 'consent-required');
    if (!STABLE_ID.test(explanation?.explanationId ?? '') || !REVIEW_TRIGGERS.includes(explanation?.triggerType) || !UNIT_ID.test(explanation.unitId ?? '')
      || !RELEASE_ID.test(explanation.releaseId ?? '') || !explanation.supportingEvidenceIds?.every(id =>
        loaded.envelope.evidence.some(item => item.evidenceId === id))) return result(false, 'invalid-review-dismissal');
    const item = {
      explanationId: explanation.explanationId, triggerType: explanation.triggerType,
      unitId: explanation.unitId, releaseId: explanation.releaseId, dismissedAt: iso(now())
    };
    return commit(withIntegrity({
      ...loaded.envelope, updatedAt: iso(now()),
      reviewDismissals: { ...loaded.envelope.reviewDismissals, [recordKey(explanation)]: item }
    }));
  };
  const restoreDismissedReview = (releaseId, unitId) => {
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    if (!loaded.envelope || loaded.envelope.consent.state !== 'local-progress-enabled') return result(false, 'consent-required');
    const reviewDismissals = { ...loaded.envelope.reviewDismissals };
    delete reviewDismissals[`${releaseId}:${unitId}`];
    return commit(withIntegrity({ ...loaded.envelope, updatedAt: iso(now()), reviewDismissals }));
  };
  const clearReviewEvidence = explanation => {
    const loaded = requireReadable(); if (!loaded.ok) return loaded;
    if (!loaded.envelope || loaded.envelope.consent.state !== 'local-progress-enabled') return result(false, 'consent-required');
    const supporting = new Set(explanation?.supportingEvidenceIds ?? []);
    if (!supporting.size || ![...supporting].every(id => loaded.envelope.evidence.some(item => item.evidenceId === id))) return result(false, 'invalid-review-evidence');
    const removed = loaded.envelope.evidence.filter(item => supporting.has(item.evidenceId));
    if (removed.some(item => item.releaseId !== explanation.releaseId || item.unitId !== explanation.unitId)) return result(false, 'review-evidence-scope-mismatch');
    const evidence = loaded.envelope.evidence.filter(item => !supporting.has(item.evidenceId));
    const referenced = new Set(evidence.flatMap(item => item.sourceEventIds));
    const sourceIds = new Set(removed.flatMap(item => item.sourceEventIds));
    const events = loaded.envelope.events.filter(item => !sourceIds.has(item.eventId) || referenced.has(item.eventId));
    const removedEventIds = new Set(loaded.envelope.events.filter(item => !events.includes(item)).map(item => item.eventId));
    const progressByUnit = { ...loaded.envelope.progressByUnit };
    const unitEvents = events.filter(item => item.releaseId === explanation.releaseId && item.unitId === explanation.unitId);
    const unitEvidence = evidence.filter(item => item.releaseId === explanation.releaseId && item.unitId === explanation.unitId);
    const key = `${explanation.releaseId}:${explanation.unitId}`;
    if (!unitEvents.length && !unitEvidence.length) delete progressByUnit[key];
    else progressByUnit[key] = deriveLearnerProgress({
      unitId: explanation.unitId, releaseId: explanation.releaseId,
      events: unitEvents, evidence: unitEvidence, consent: loaded.envelope.consent
    });
    const reviewDismissals = { ...loaded.envelope.reviewDismissals }; delete reviewDismissals[key];
    return commit(withIntegrity({
      ...loaded.envelope, updatedAt: iso(now()), evidence, events, progressByUnit, reviewDismissals,
      deduplication: loaded.envelope.deduplication.filter(item => !removedEventIds.has(item.eventId))
    }));
  };
  return Object.freeze({
    load() { const loaded = read(); return loaded.ok ? result(true, loaded.code, { summary: summary(loaded.envelope) }) : loaded; },
    refreshFromStorage() { return this.load(); },
    getSummary() { return summary(cached); },
    getLearningRecords() {
      return immutable({
        evidence: cached?.evidence ?? [], events: cached?.events ?? [],
        reviewDismissals: cached?.reviewDismissals ?? {}
      });
    },
    getDiagnosticState() { return immutable({ code: lastLoad.code, errors: lastLoad.errors ?? [], hasRaw: Boolean(lastLoad.raw) }); },
    isStorageArea(area) { return !area || area === storage; },
    setContext(value) { currentContext = value; },
    setConsent,
    appendInteractionEvent,
    clearUnit,
    clearAll,
    disableSaving() { return setConsent('declined'); },
    disableAndClear() { return clearAll({ disable: true }); },
    exportData,
    previewImport,
    mergeImport,
    dismissReview,
    restoreDismissedReview,
    clearReviewEvidence,
    clearUnreadableStore() {
      const loaded = read();
      if (loaded.ok) return result(false, 'store-is-readable');
      try { storage?.removeItem?.(LOCAL_LEARNING_STORAGE_KEY); }
      catch { return result(false, 'storage-write-failed'); }
      cached = null; lastLoad = result(true, 'empty', { envelope: null });
      return result(true, 'cleared');
    },
    versions: immutable({
      storage: LOCAL_LEARNING_SCHEMA_VERSION, consent: LEARNING_CONSENT_VERSION,
      event: LEARNING_EVENT_VERSION, evidence: LEARNING_EVIDENCE_VERSION, progress: LEARNING_PROGRESS_VERSION,
      scope: CONSENT_SCOPE
    })
  });
}
