import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  createGuidedStudyHref,
  createGuidedStudyModel,
  isGuidedStudyEligible,
  loadGuidedStudyRequest,
  parseGuidedStudyRequest
} from '../js/endgame-library/guided-study-entry.js';
import { PINNED_RELEASE } from '../js/endgame-library/browser-library-reader.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const releaseRoot = new URL(`../knowledge/releases/${PINNED_RELEASE.id}/`, import.meta.url);
const release = JSON.parse(fs.readFileSync(new URL('release.json', releaseRoot), 'utf8'));
const units = release.files.units.map(entry =>
  JSON.parse(fs.readFileSync(new URL(entry.file, releaseRoot), 'utf8')).unit
);
const eligible = units.find(unit => unit.id === 'ku:endgames:pawn-exchanges:exchange-into-passer');

test('released units use objective eligibility without invented content', () => {
  assert.equal(isGuidedStudyEligible(eligible), true);
  for (const mutation of [
    { ...eligible, status: 'draft' },
    { ...eligible, positions: [] },
    { ...eligible, learningObjects: { ...eligible.learningObjects, demonstrations: [], guidedPractice: [] } },
    { ...eligible, localization: { ...eligible.localization, content: {} } }
  ]) assert.equal(isGuidedStudyEligible(mutation), false);
});

test('Study this unit URL carries stable unit and pinned release IDs', () => {
  const href = createGuidedStudyHref(eligible);
  const url = new URL(href, 'https://www.caissa-chess.org');
  assert.equal(url.pathname, '/endgame-trainer');
  assert.equal(url.searchParams.get('studyUnit'), eligible.id);
  assert.equal(url.searchParams.get('release'), PINNED_RELEASE.id);
});

test('request parsing rejects malformed IDs and release drift', () => {
  assert.equal(parseGuidedStudyRequest(''), null);
  assert.deepEqual(parseGuidedStudyRequest('?studyUnit=bad&release=x'), { ok: false, code: 'invalid-unit-id' });
  assert.deepEqual(
    parseGuidedStudyRequest(`?studyUnit=${encodeURIComponent(eligible.id)}&release=rel-wrong`),
    { ok: false, code: 'release-mismatch' }
  );
  assert.deepEqual(
    parseGuidedStudyRequest(`?studyUnit=${encodeURIComponent(eligible.id)}&release=${PINNED_RELEASE.id}`),
    { ok: true, unitId: eligible.id, releaseId: PINNED_RELEASE.id }
  );
});

test('study model exposes only released instructional content and a Library return', () => {
  const summary = { scopedSlug: 'endgames/exchange-into-passer' };
  const model = createGuidedStudyModel(eligible, summary);
  assert.equal(model.title, 'Exchange into a passed pawn');
  assert.equal(model.objective, eligible.education.learningObjectives[0]);
  assert.equal(model.explanation, eligible.localization.content['en-US'].explanation);
  assert.equal(model.positions[0].fen, eligible.positions[0].fen);
  assert.equal(model.positions[0].principalIdeas[0].purpose, eligible.positions[0].principalIdeas[0].purpose);
  assert.equal(model.prompts[0], eligible.localization.content['en-US'].coachingPrompts[0]);
  assert.ok(model.learningObjectIds.includes('guided:exchange-passer:orders'));
  assert.ok(model.assessmentItemIds.includes('assessment:exchange-passer:three-of-four'));
  assert.equal(model.returnHref, '/endgame-library?unit=endgames%2Fexchange-into-passer');
});

test('all 17 pinned released units satisfy objective Guided Study eligibility', () => {
  assert.equal(units.length, 17);
  assert.equal(units.filter(isGuidedStudyEligible).length, 17);
});

test('loader fails safely before fetching on malformed or mismatched state', async () => {
  let fetches = 0;
  const fetchImpl = async () => { fetches += 1; throw new Error('unexpected'); };
  assert.deepEqual(await loadGuidedStudyRequest('?studyUnit=bad&release=x', { fetchImpl }), {
    status: 'error', code: 'invalid-unit-id'
  });
  assert.deepEqual(await loadGuidedStudyRequest(
    `?studyUnit=${encodeURIComponent(eligible.id)}&release=rel-wrong`, { fetchImpl }
  ), { status: 'error', code: 'release-mismatch' });
  assert.equal(fetches, 0);
});

test('Library and existing Guided Workspace share the released-data adapter', () => {
  const library = read('js/endgame-library/endgame-library-page.js');
  const trainer = read('js/endgame-trainer/endgame-trainer-page.js');
  const html = read('endgame-trainer.html');
  assert.match(library, /createGuidedStudyHref/);
  assert.match(library, /Study this unit/);
  assert.match(trainer, /loadGuidedStudyRequest/);
  assert.match(trainer, /runtime\?\.boardView\?\.setPosition/);
  assert.match(html, /data-library-study/);
  assert.match(html, /Lesson Companion/);
  assert.match(html, /data-library-study-explanation/);
  assert.match(html, /data-library-study-position-purpose/);
  assert.match(html, /data-learning-consent/);
  assert.match(html, /Return to Endgame Library/);
  assert.match(trainer, /position-unavailable/);
  assert.match(trainer, /principalIdeas/);
  assert.match(trainer, /createGuidedStudyEventSession/);
});

test('guided-study adapter has no authored, draft, persistence, mastery, recommendation, or AI dependency', () => {
  const adapter = read('js/endgame-library/guided-study-entry.js');
  for (const prohibited of [
    'knowledge/domains', 'authoring', 'latest', 'recordSession', 'recordTraining',
    'mastery', 'recommendation', 'fetch("/api/mentor', 'OpenAI', 'Together'
  ]) assert.ok(!adapter.includes(prohibited), `${prohibited} leaked into the adapter`);
  assert.match(adapter, /browser-library-reader/);
  assert.match(adapter, /PINNED_RELEASE/);
});

test('workspace preview is explicitly read-only and does not claim completion', () => {
  const html = read('endgame-trainer.html');
  const trainer = read('js/endgame-trainer/endgame-trainer-page.js');
  assert.match(html, /read-only\. Optional local progress never means completion or mastery/);
  assert.match(trainer, /boardView\?\.setInteractive\(false\)/);
  assert.doesNotMatch(trainer.slice(
    trainer.indexOf('async function initializeLibraryStudy'),
    trainer.indexOf('function sessionEntry')
  ), /recordSession|recordCurriculum|recordTraining|recordPilot|fetch\(.+api/);
});
