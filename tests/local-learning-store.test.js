import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCAL_LEARNING_LIMITS,
  LOCAL_LEARNING_STORAGE_KEY,
  createLocalLearningStore,
  migrateLocalLearningEnvelope
} from '../js/learning/local-learning-store.js';
import { createInteractionEvent } from '../js/learning/learning-progress-contracts.js';

const releaseId = `rel-${'a'.repeat(64)}`;
const unitId = 'ku:endgames:test:unit';
const context = { releaseId, unitIds: [unitId], positionIds: ['pos:a'], learningObjectIds: ['object:a'], assessmentItemIds: ['assessment:a'] };
const fixedTime = Date.parse('2026-07-24T12:00:00.000Z');
const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    values, writes: 0,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { this.writes += 1; values.set(key, value); },
    removeItem(key) { values.delete(key); }
  };
};
const event = (id = 'event:one', overrides = {}) => createInteractionEvent({
  eventId: id, eventType: 'position-selected', occurredAt: fixedTime, sessionId: 'session:one',
  releaseId, unitId, positionId: 'pos:a', consentState: 'local-progress-enabled',
  persistenceEligible: true, ...overrides
}, context);
const enabledStore = storage => {
  const store = createLocalLearningStore({ storage, now: () => fixedTime, context });
  store.load();
  assert.equal(store.setConsent('local-progress-enabled').ok, true);
  return store;
};

test('unknown consent keeps storage completely empty and uses a dedicated namespace', () => {
  const storage = memoryStorage(), store = createLocalLearningStore({ storage, now: () => fixedTime, context });
  assert.equal(store.load().ok, true);
  assert.equal(store.appendInteractionEvent(event()).code, 'consent-required');
  assert.equal(storage.writes, 0);
  assert.equal(storage.values.has(LOCAL_LEARNING_STORAGE_KEY), false);
  assert.notEqual(LOCAL_LEARNING_STORAGE_KEY, 'caissa:endgame-trainer:progress:v1');
});

test('explicit enable persists, survives refresh, deduplicates, and rejects conflicting IDs', () => {
  const storage = memoryStorage(), store = enabledStore(storage);
  assert.equal(store.appendInteractionEvent(event()).code, 'committed');
  const raw = storage.getItem(LOCAL_LEARNING_STORAGE_KEY);
  assert.equal(store.appendInteractionEvent(event()).code, 'duplicate-noop');
  assert.equal(storage.getItem(LOCAL_LEARNING_STORAGE_KEY), raw);
  assert.equal(store.appendInteractionEvent(event('event:one', { positionId: null, eventType: 'unit-opened' })).code, 'event-id-conflict');
  const refreshed = createLocalLearningStore({ storage, now: () => fixedTime, context });
  assert.equal(refreshed.load().ok, true);
  assert.deepEqual(refreshed.getSummary().totals, { units: 1, events: 1, evidence: 1 });
  assert.equal(refreshed.getSummary().progressByUnit[`${releaseId}:${unitId}`].state, 'explored');
  assert.equal(JSON.stringify(refreshed.getSummary()).includes('mastered'), false);
});

test('revocation is checked at the write boundary and preserves existing records', () => {
  const storage = memoryStorage(), first = enabledStore(storage);
  first.appendInteractionEvent(event());
  const second = createLocalLearningStore({ storage, now: () => fixedTime, context });
  second.load();
  assert.equal(second.disableSaving().ok, true);
  assert.equal(first.appendInteractionEvent(event('event:two')).code, 'consent-required');
  assert.deepEqual(first.getSummary().totals, { units: 1, events: 1, evidence: 1 });
});

test('clear unit, clear all, and disable-and-clear never touch Trainer Memory', () => {
  const trainerKey = 'caissa:endgame-trainer:progress:v1', storage = memoryStorage({ [trainerKey]: '{"trainer":true}' });
  const store = enabledStore(storage); store.appendInteractionEvent(event());
  assert.equal(store.clearUnit(releaseId, unitId).ok, true);
  assert.deepEqual(store.getSummary().totals, { units: 0, events: 0, evidence: 0 });
  store.appendInteractionEvent(event('event:two'));
  assert.equal(store.clearAll().ok, true);
  assert.equal(store.getSummary().consent.state, 'local-progress-enabled');
  assert.equal(store.disableAndClear().ok, true);
  assert.equal(store.getSummary().consent.state, 'declined');
  assert.equal(storage.getItem(trainerKey), '{"trainer":true}');
});

test('malformed, future, and invalid envelopes are not silently replaced', () => {
  for (const raw of ['{bad', '{"schemaVersion":99}', '{"schemaVersion":1}']) {
    const storage = memoryStorage({ [LOCAL_LEARNING_STORAGE_KEY]: raw });
    const store = createLocalLearningStore({ storage, now: () => fixedTime, context });
    assert.equal(store.load().ok, false);
    assert.equal(store.setConsent('local-progress-enabled').ok, false);
    assert.equal(storage.getItem(LOCAL_LEARNING_STORAGE_KEY), raw);
  }
});

test('quota or storage errors preserve the last valid atomic value', () => {
  const storage = memoryStorage(), store = enabledStore(storage), prior = storage.getItem(LOCAL_LEARNING_STORAGE_KEY);
  storage.setItem = () => { const error = new Error('full'); error.name = 'QuotaExceededError'; throw error; };
  assert.equal(store.appendInteractionEvent(event()).code, 'storage-quota-exceeded');
  assert.equal(storage.getItem(LOCAL_LEARNING_STORAGE_KEY), prior);
});

test('bounded retention preserves summaries and evidence traceability', () => {
  const storage = memoryStorage(), store = enabledStore(storage);
  for (let index = 0; index < LOCAL_LEARNING_LIMITS.events + 15; index += 1) {
    const next = event(`event:${index}`, { occurredAt: fixedTime + index });
    assert.equal(store.appendInteractionEvent(next).ok, true);
  }
  const parsed = JSON.parse(storage.getItem(LOCAL_LEARNING_STORAGE_KEY));
  assert.equal(parsed.events.length, LOCAL_LEARNING_LIMITS.events);
  assert.ok(parsed.evidence.length <= LOCAL_LEARNING_LIMITS.evidence);
  const ids = new Set(parsed.events.map(item => item.eventId));
  assert.ok(parsed.evidence.every(item => item.sourceEventIds.every(id => ids.has(id))));
  assert.equal(Object.keys(parsed.progressByUnit).length, 1);
  assert.equal(parsed.consent.state, 'local-progress-enabled');
});

test('export is dedicated and deterministic; preview is read-only and merge requires consent', () => {
  const sourceStorage = memoryStorage(), source = enabledStore(sourceStorage);
  source.appendInteractionEvent(event());
  const exported = source.exportData();
  assert.equal(exported.ok, true);
  assert.match(exported.json, /"format":"caissa-learning-progress-export"/);
  assert.doesNotMatch(exported.json, /authentication|trainer|knowledge prose/i);
  const targetStorage = memoryStorage(), target = createLocalLearningStore({ storage: targetStorage, now: () => fixedTime, context });
  target.load();
  assert.equal(target.previewImport(exported.json).ok, true);
  assert.equal(targetStorage.writes, 0);
  assert.equal(target.mergeImport(exported.json).code, 'consent-required');
  target.setConsent('local-progress-enabled');
  assert.equal(target.mergeImport(exported.json).ok, true);
  assert.deepEqual(target.getSummary().totals, { units: 1, events: 1, evidence: 1 });
  assert.equal(target.getSummary().consent.state, 'local-progress-enabled');
  assert.equal(target.previewImport('x'.repeat(LOCAL_LEARNING_LIMITS.importBytes + 1)).code, 'import-too-large');
  assert.equal(target.previewImport('{"format":"caissa-endgame-training-memory"}').code, 'invalid-import-format');
});

test('migration infrastructure supports only the documented development-preview v0 fixture', () => {
  const migrated = migrateLocalLearningEnvelope({
    schemaVersion: 0, previewDraft: true, createdAt: new Date(fixedTime).toISOString(),
    updatedAt: new Date(fixedTime).toISOString(), releaseIds: [], progressByUnit: {}, evidence: [], events: []
  }, fixedTime);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.envelope.migration.applied, ['development-preview-v0-to-v1']);
  assert.equal(migrateLocalLearningEnvelope({ schemaVersion: 2 }, fixedTime).code, 'unsupported-future-version');
  assert.equal(migrateLocalLearningEnvelope({ schemaVersion: -1 }, fixedTime).code, 'unsupported-schema-version');
});

test('static integration keeps learning persistence outside mastery, recommendations, and Trainer writes', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../js/learning/local-learning-store.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /createEndgameProgressStore|ENDGAME_PROGRESS_STORAGE_KEY|recordTraining|accountId|cloud|rankRecommendation/);
  assert.doesNotMatch(source, /\b(mastered|completed)\s*:/);
});
