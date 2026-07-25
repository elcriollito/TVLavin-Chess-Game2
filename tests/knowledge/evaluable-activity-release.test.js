import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_UNIT_REGISTRY } from '../../knowledge/indexes/manifest.js';
import { validateKnowledgeRepository } from '../../knowledge/validation/validate-knowledge.js';
import { verifyLibrarySnapshot } from '../../knowledge/snapshots/verify-snapshot.js';
import { ChessRulesFacade } from '../../js/endgame-trainer/chess-rules-facade.js';

const oldRelease = 'rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1';
const newRelease = 'rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84';
const items = KNOWLEDGE_UNIT_REGISTRY.flatMap(unit => unit.activityItems.map(item => ({ unit, item })));
const cloneRegistry = () => structuredClone(KNOWLEDGE_UNIT_REGISTRY);

test('coverage provides independent practice and assessment for all 17 units', () => {
  assert.equal(KNOWLEDGE_UNIT_REGISTRY.length, 17);
  assert.equal(items.length, 34);
  for (const unit of KNOWLEDGE_UNIT_REGISTRY) {
    assert.equal(unit.schemaVersion, '1.1.0');
    assert.equal(unit.activityItems.filter(item => item.activityType === 'independent-practice').length, 1);
    assert.equal(unit.activityItems.filter(item => item.activityType === 'assessment').length, 1);
  }
});

test('four explicit transfer items cover the four curriculum clusters', () => {
  const transfer = items.filter(({ item }) => item.transfer);
  assert.equal(transfer.length, 4);
  assert.deepEqual(new Set(transfer.map(({ unit }) => unit.id.split(':')[2])), new Set([
    'pawn-foundations', 'pawn-transformations', 'pawn-weaknesses', 'pawn-exchanges'
  ]));
});

test('all move answers and accepted alternatives are legal from released positions', () => {
  const moveItems = items.filter(({ item }) => item.responseType === 'exact-move');
  assert.equal(moveItems.length, 16);
  let alternatives = 0;
  for (const { unit, item } of moveItems) {
    const position = unit.positions.find(candidate => candidate.id === item.positionId);
    for (const move of [item.answer.expected, ...item.answer.acceptedAlternatives]) {
      assert.doesNotThrow(() => ChessRulesFacade.fromFen(position.fen).move(move));
    }
    alternatives += item.answer.acceptedAlternatives.length;
  }
  assert.ok(alternatives >= 2);
});

test('choice contracts use stable IDs and explicit authored misconception mappings', () => {
  const choices = items.filter(({ item }) => ['single-choice', 'plan-choice'].includes(item.responseType));
  assert.equal(choices.length, 18);
  assert.ok(choices.filter(({ item }) => item.answer.misconceptionMappings.length).length >= 12);
  for (const { unit, item } of choices) {
    const ids = item.answer.choices.map(choice => choice.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes(item.answer.expected));
    for (const mapping of item.answer.misconceptionMappings) {
      assert.ok(ids.includes(mapping.responseId));
      assert.ok(unit.localization.content['en-US'].misconceptions[mapping.sourceMisconceptionIndex]);
      assert.ok(unit.activityItems.some(candidate => candidate.id === mapping.resolutionActivityId));
    }
  }
});

test('validator rejects missing answers, invalid alternatives, mappings, and duplicate IDs', () => {
  const cases = [
    units => { delete units[0].activityItems[0].instruction; },
    units => { delete units[0].activityItems[0].answer.expected; },
    units => { units.find(unit => unit.activityItems.some(item => item.responseType === 'exact-move')).activityItems.find(item => item.responseType === 'exact-move').answer.acceptedAlternatives.push('Qh9'); },
    units => { units[0].activityItems[1].answer.misconceptionMappings[0].responseId = 'choice:missing'; },
    units => { units[0].activityItems[1].id = units[0].activityItems[0].id; }
  ];
  for (const mutate of cases) {
    const units = cloneRegistry(); mutate(units);
    assert.equal(validateKnowledgeRepository(units).valid, false);
  }
});

test('new release verifies while the historical pinned release remains byte-valid', async () => {
  const releasesDirectory = path.join('knowledge', 'releases');
  assert.equal((await verifyLibrarySnapshot({ releasesDirectory, releaseId: newRelease })).valid, true);
  assert.equal((await verifyLibrarySnapshot({ releasesDirectory, releaseId: oldRelease })).valid, true);
  assert.ok(fs.existsSync(path.join('knowledge', 'releases', oldRelease, 'release.json')));
  assert.ok(fs.existsSync(path.join('knowledge', 'releases', newRelease, 'release.json')));
});

test('release identity and fingerprint changed without changing taxonomy', () => {
  const oldManifest = JSON.parse(fs.readFileSync(path.join('knowledge', 'releases', oldRelease, 'manifest.json')));
  const newManifest = JSON.parse(fs.readFileSync(path.join('knowledge', 'releases', newRelease, 'manifest.json')));
  assert.notEqual(oldManifest.repositoryFingerprint, newManifest.repositoryFingerprint);
  assert.equal(oldManifest.taxonomyVersion, '1.4.0');
  assert.equal(newManifest.taxonomyVersion, '1.4.0');
  assert.equal(newManifest.units.length, 17);
});
