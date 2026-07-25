import { PINNED_RELEASE, loadPinnedEndgameLibrary } from './browser-library-reader.js';

export const GUIDED_STUDY_QUERY = Object.freeze({
  unit: 'studyUnit',
  release: 'release'
});

const clone = value => structuredClone(value);

export function isGuidedStudyEligible(unit) {
  if (!unit || unit.status !== 'published' || unit.schemaVersion !== '1.0.0') return false;
  if (!Array.isArray(unit.positions) || !unit.positions.some(position =>
    typeof position?.fen === 'string' && position.validation?.structural === 'valid'
  )) return false;
  const learning = unit.learningObjects || {};
  if (!(learning.demonstrations?.length || learning.guidedPractice?.length)) return false;
  const copy = unit.localization?.content?.[unit.localization?.defaultLocale];
  return Array.isArray(copy?.coachingPrompts) && copy.coachingPrompts.length > 0
    && Array.isArray(unit.education?.learningObjectives) && unit.education.learningObjectives.length > 0;
}

export function createGuidedStudyHref(unit) {
  if (!isGuidedStudyEligible(unit)) return null;
  const params = new URLSearchParams({
    [GUIDED_STUDY_QUERY.unit]: unit.id,
    [GUIDED_STUDY_QUERY.release]: PINNED_RELEASE.id
  });
  return `/endgame-trainer?${params}`;
}

export function parseGuidedStudyRequest(search = '') {
  const params = new URLSearchParams(search);
  const unitId = params.get(GUIDED_STUDY_QUERY.unit);
  const releaseId = params.get(GUIDED_STUDY_QUERY.release);
  if (!unitId && !releaseId) return null;
  if (!unitId || !/^ku:endgames:[a-z0-9-]+:[a-z0-9-]+$/.test(unitId)) {
    return { ok: false, code: 'invalid-unit-id' };
  }
  if (releaseId !== PINNED_RELEASE.id) return { ok: false, code: 'release-mismatch' };
  return { ok: true, unitId, releaseId };
}

export function createGuidedStudyModel(unit, summary) {
  if (!isGuidedStudyEligible(unit)) return null;
  const copy = unit.localization.content[unit.localization.defaultLocale];
  return Object.freeze({
    releaseId: PINNED_RELEASE.id,
    unitId: unit.id,
    scopedSlug: summary?.scopedSlug || `${unit.domain}/${unit.slug}`,
    title: copy.title,
    objective: unit.education.learningObjectives[0],
    explanation: copy.explanation,
    prompts: clone(copy.coachingPrompts),
    positions: clone(unit.positions.filter(position => position.validation?.structural === 'valid')),
    learningObjectIds: clone(Object.values(unit.learningObjects || {}).flat().map(item => item.id).filter(Boolean)),
    assessmentItemIds: clone((unit.learningObjects?.assessments || []).map(item => item.id).filter(Boolean)),
    returnHref: `/endgame-library?unit=${encodeURIComponent(summary?.scopedSlug || `${unit.domain}/${unit.slug}`)}`
  });
}

export async function loadGuidedStudyRequest(search, options = {}) {
  const request = parseGuidedStudyRequest(search);
  if (!request) return { status: 'absent' };
  if (!request.ok) return { status: 'error', code: request.code };
  try {
    const reader = await loadPinnedEndgameLibrary(options);
    const unit = await reader.getUnitById(request.unitId);
    if (!unit) return { status: 'error', code: 'unit-not-found' };
    const model = createGuidedStudyModel(unit, reader.getUnitSummaryById(request.unitId));
    return model
      ? { status: 'ready', model }
      : { status: 'error', code: 'unit-not-eligible' };
  } catch {
    return { status: 'error', code: 'release-unavailable' };
  }
}
