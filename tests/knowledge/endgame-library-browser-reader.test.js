import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLibraryRelease } from '../../knowledge/consumer/library-reader.js';
import { LibraryReleaseError, loadPinnedEndgameLibrary, PINNED_RELEASE } from '../../js/endgame-library/browser-library-reader.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const releasesDirectory = path.join(root, 'knowledge', 'releases');
const releaseDirectory = path.join(releasesDirectory, PINNED_RELEASE.id);

function localFetch(overrides = new Map()) {
  return async url => {
    const relative = decodeURIComponent(String(url).split(`/${PINNED_RELEASE.id}/`)[1] || '');
    if (overrides.has(relative)) {
      return { ok: true, status: 200, json: async () => structuredClone(overrides.get(relative)) };
    }
    try {
      const body = await readFile(path.join(releaseDirectory, relative), 'utf8');
      return { ok: true, status: 200, json: async () => JSON.parse(body) };
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
  };
}

test('browser reader pins and exposes only the verified immutable release', async () => {
  const reader = await loadPinnedEndgameLibrary({ fetchImpl: localFetch() });
  assert.equal(reader.getReleaseMetadata().releaseId, PINNED_RELEASE.id);
  assert.equal(reader.getReleaseFingerprint(), PINNED_RELEASE.fingerprint);
  assert.equal(reader.getUnitSummaries().length, 17);
  assert.equal(reader.getCounts().byStatus.published, 17);
  assert.equal(reader.supportsReleaseSchema('1.0.0'), true);
  assert.equal(reader.supportsReleaseSchema('2.0.0'), false);
});

test('browser summary filtering and graph traversal match the Node consumer', async () => {
  const [browser, node] = await Promise.all([
    loadPinnedEndgameLibrary({ fetchImpl: localFetch() }),
    loadLibraryRelease({ releasesDirectory, releaseId: PINNED_RELEASE.id })
  ]);
  const filters = { difficulty: 'intermediate', theme: 'pawn-races' };
  assert.deepEqual(browser.filterUnits(filters).map(unit => unit.id).sort(), node.filterUnits(filters).map(unit => unit.id).sort());
  const id = 'ku:endgames:pawn-exchanges:exchange-into-passer';
  assert.deepEqual(browser.getOutgoing(id), node.getOutgoing(id));
  assert.deepEqual(browser.getIncoming(id), node.getIncoming(id));
  assert.deepEqual(browser.getDirectPrerequisites(id), node.getDirectPrerequisites(id));
  assert.deepEqual(browser.getDirectDependents(id), node.getDirectDependents(id));
});

test('browser reader lazily loads canonical shards and returns isolated data', async () => {
  const requests = [];
  const fetchImpl = localFetch();
  const reader = await loadPinnedEndgameLibrary({ fetchImpl: async url => { requests.push(String(url)); return fetchImpl(url); } });
  assert.equal(requests.some(url => url.includes('/units/')), false);
  const unit = await reader.getUnitByScopedSlug('endgames/exchange-into-passer');
  assert.equal(unit.id, 'ku:endgames:pawn-exchanges:exchange-into-passer');
  assert.equal(requests.filter(url => url.includes('/units/')).length, 1);
  unit.localization.defaultLocale = 'changed';
  const again = await reader.getUnitById(unit.id);
  assert.equal(again.localization.defaultLocale, 'en-US');
  assert.equal(requests.filter(url => url.includes('/units/')).length, 1);
});

test('all pinned units satisfy the library detail and position-preview contract', async () => {
  const reader = await loadPinnedEndgameLibrary({ fetchImpl: localFetch() });
  const clusterCounts = new Map();
  for (const summary of reader.getUnitSummaries()) {
    const unit = await reader.getUnitById(summary.id);
    const copy = unit.localization.content[unit.localization.defaultLocale];
    assert.ok(copy.title && copy.summary && copy.explanation);
    for (const field of ['keyIdeas', 'practicalRules', 'decisionProcess', 'misconceptions', 'reflectionPrompts', 'coachingPrompts']) {
      assert.ok(copy[field].length, `${summary.id} needs ${field}`);
    }
    assert.ok(unit.education.learningObjectives.length);
    assert.ok(unit.education.masteryCriteria.length);
    assert.ok(unit.positions.length);
    for (const position of unit.positions) {
      assert.match(position.fen, / (?:w|b) /);
      assert.ok(position.role && position.sideToMove && position.expectedConcepts.length);
    }
    const cluster = summary.id.split(':')[2];
    clusterCounts.set(cluster, (clusterCounts.get(cluster) || 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(clusterCounts), {
    'pawn-exchanges': 4,
    'pawn-foundations': 5,
    'pawn-transformations': 4,
    'pawn-weaknesses': 4
  });
});

test('browser reader rejects release identity, fingerprint, and completeness drift', async () => {
  const release = JSON.parse(await readFile(path.join(releaseDirectory, 'release.json'), 'utf8'));
  for (const mutation of [
    value => { value.releaseId = 'rel-wrong'; },
    value => { value.repositoryFingerprint = '0'.repeat(64); },
    value => { value.unitCount = 16; }
  ]) {
    const changed = structuredClone(release);
    mutation(changed);
    await assert.rejects(loadPinnedEndgameLibrary({ fetchImpl: localFetch(new Map([['release.json', changed]])) }), LibraryReleaseError);
  }
});

test('browser reader has no authored, draft, write, training, coaching, or mastery dependency', async () => {
  const source = await readFile(path.join(root, 'js', 'endgame-library', 'browser-library-reader.js'), 'utf8');
  assert.doesNotMatch(source, /knowledge\/domains|knowledge\/authoring|draft|localStorage|training-memory|mastery-store|coach/i);
  assert.match(source, /knowledge\/releases/);
  assert.match(source, new RegExp(PINNED_RELEASE.id));
});
