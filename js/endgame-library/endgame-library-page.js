import { loadPinnedEndgameLibrary, PINNED_RELEASE } from './browser-library-reader.js';
import { EndgameBoardView } from '../endgame-trainer/endgame-board-view.js';
import { ChessRulesFacade } from '../endgame-trainer/chess-rules-facade.js';

const CLUSTERS = Object.freeze([
  { id: 'foundations', label: 'King and Pawn Foundations', prefix: 'ku:endgames:pawn-foundations:' },
  { id: 'transformations', label: 'Pawn Structure Transformation', prefix: 'ku:endgames:pawn-transformations:' },
  { id: 'weaknesses', label: 'Majorities and Weaknesses', prefix: 'ku:endgames:pawn-weaknesses:' },
  { id: 'exchanges', label: 'Exchanges and Simplification', prefix: 'ku:endgames:pawn-exchanges:' }
]);

const state = { reader: null, summaries: [], board: null, detailUnit: null };
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const words = value => String(value || '').split('-').map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ');
const clusterFor = id => CLUSTERS.find(cluster => id.startsWith(cluster.prefix));
const list = items => `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;

export function filterValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function taxonomyOptions(registry, selected) {
  const entries = state.reader.getTaxonomy().registries[registry]?.entries || [];
  selected.insertAdjacentHTML('beforeend', entries.filter(entry => entry.status === 'active')
    .map(entry => `<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</option>`).join(''));
}

function relationshipCount(summary) {
  return Object.entries(summary.relationshipCounts || {})
    .filter(([type]) => type !== 'prerequisite')
    .reduce((total, [, count]) => total + count, 0);
}

function renderCards() {
  const filters = filterValues($('#library-filters'));
  const filtered = state.reader.filterUnits(filters);
  $('#result-count').textContent = `${filtered.length} of ${state.summaries.length} concepts`;
  $('#empty-state').hidden = filtered.length !== 0;
  const byCluster = CLUSTERS.map(cluster => ({
    ...cluster, units: filtered.filter(unit => unit.id.startsWith(cluster.prefix))
  })).filter(cluster => cluster.units.length);

  $('#library-results').innerHTML = byCluster.map(cluster => `
    <section class="concept-cluster" id="cluster-${cluster.id}" aria-labelledby="cluster-title-${cluster.id}">
      <div class="cluster-heading">
        <h3 id="cluster-title-${cluster.id}">${cluster.label}</h3>
        <span>${cluster.units.length} concept${cluster.units.length === 1 ? '' : 's'}</span>
      </div>
      <div class="card-grid">${cluster.units.map(cardTemplate).join('')}</div>
    </section>`).join('');
}

function cardTemplate(unit) {
  const cluster = clusterFor(unit.id);
  return `<article class="concept-card">
    <p class="card-cluster">${escapeHtml(cluster?.label || 'Endgames')}</p>
    <h4>${escapeHtml(unit.title)}</h4>
    <p>${escapeHtml(unit.summary)}</p>
    <div class="tags">${[unit.difficulty, ...(unit.themes || []).slice(0, 2), ...(unit.skills || []).slice(0, 2)]
      .map(tag => `<span>${escapeHtml(words(tag))}</span>`).join('')}</div>
    <p class="card-links">${unit.prerequisites?.length || 0} prerequisite${unit.prerequisites?.length === 1 ? '' : 's'} · ${relationshipCount(unit)} study link${relationshipCount(unit) === 1 ? '' : 's'}</p>
    <button type="button" data-open-unit="${escapeHtml(unit.scopedSlug)}">Open concept<span class="sr-only">: ${escapeHtml(unit.title)}</span></button>
  </article>`;
}

function summaryFor(id) {
  return state.reader.getUnitSummaryById(id);
}

function relationSections(unit) {
  const grouped = {
    prerequisite: (unit.education.prerequisites || []).map(targetId => ({ targetId, reason: 'Required foundation for this concept.' })),
    progression: [], recommendation: [], remediation: [], contrast: [], related: []
  };
  for (const relation of unit.relationships || []) grouped[relation.type]?.push(relation);
  const sections = [
    ['prerequisite', 'Build on these first'],
    ['progression', 'Continue with'],
    ['recommendation', 'Recommended next study'],
    ['remediation', 'Review if this is difficult'],
    ['contrast', 'Compare with'],
    ['related', 'Related study']
  ];
  return sections.filter(([type]) => grouped[type].length).map(([type, title]) => `
    <section><h3>${title}</h3><div class="relation-list">${grouped[type].map(relation => {
      const target = summaryFor(relation.targetId);
      return target ? `<button type="button" data-open-unit="${escapeHtml(target.scopedSlug)}">
        <strong>${escapeHtml(target.title)}</strong><span>${escapeHtml(relation.reason)}</span>
      </button>` : '';
    }).join('')}</div></section>`).join('');
}

function learningObjects(unit) {
  const labels = {
    demonstrations: 'Demonstrations', guidedPractice: 'Guided practice',
    checksForUnderstanding: 'Checks for understanding', exercises: 'Exercises',
    assessments: 'Assessments', reviewItems: 'Review'
  };
  return Object.entries(unit.learningObjects || {}).filter(([, values]) => values.length).map(([kind, values]) => `
    <section><h3>${labels[kind] || words(kind)}</h3>${list(values.map(value =>
      value.prompt || value.task || value.purpose || `Study item: ${words(value.id.split(':').pop())}`
    ))}</section>`).join('');
}

function positionTemplate(position, index) {
  return `<button type="button" role="tab" aria-selected="${index === 0}" data-position-index="${index}">
    Position ${index + 1}: ${escapeHtml(words(position.role))}
  </button>`;
}

function updatePosition(index) {
  const position = state.detailUnit.positions[index];
  if (!position) return;
  document.querySelectorAll('[data-position-index]').forEach((button, buttonIndex) => {
    button.setAttribute('aria-selected', String(buttonIndex === index));
  });
  state.board?.setPosition(position.fen);
  $('#position-description').innerHTML = `
    <p><strong>${escapeHtml(words(position.role))}</strong> · ${escapeHtml(words(position.sideToMove))} to move</p>
    <p><strong>Study:</strong> ${escapeHtml((position.expectedConcepts || []).map(words).join(', '))}</p>
    ${(position.principalIdeas || []).map(idea => `<p><strong>Line:</strong> ${escapeHtml((idea.moves || []).join(' '))}<br>${escapeHtml(idea.purpose)}</p>`).join('')}
    <details><summary>Position notation (FEN)</summary><code>${escapeHtml(position.fen)}</code></details>`;
}

async function openUnit(scopedSlug, { push = true } = {}) {
  $('#library-content').hidden = true;
  $('#missing-state').hidden = true;
  const detail = $('#unit-detail');
  detail.hidden = false;
  detail.innerHTML = '<div class="state-card" role="status">Loading concept…</div>';
  const unit = await state.reader.getUnitByScopedSlug(scopedSlug);
  if (!unit) {
    detail.hidden = true;
    $('#missing-state').hidden = false;
    if (push) history.pushState({}, '', `?unit=${encodeURIComponent(scopedSlug)}`);
    return;
  }
  state.board?.dispose();
  state.board = null;
  state.detailUnit = unit;
  const copy = unit.localization.content[unit.localization.defaultLocale];
  detail.innerHTML = `
    <a class="back-link" href="/endgame-library" data-back-library>← Back to all concepts</a>
    <header class="detail-header">
      <p class="eyebrow">${escapeHtml(clusterFor(unit.id)?.label || 'Endgames')}</p>
      <h1 id="detail-title" tabindex="-1">${escapeHtml(copy.title)}</h1>
      <p>${escapeHtml(copy.summary)}</p>
      <div class="tags"><span>${escapeHtml(words(unit.education.difficulty))}</span><span>${escapeHtml(words(unit.education.expectedLearnerLevel))}</span></div>
    </header>
    <div class="detail-grid">
      <div>
        <section><h2>Explanation</h2><p>${escapeHtml(copy.explanation)}</p></section>
        <section><h2>Learning objectives</h2>${list(unit.education.learningObjectives)}</section>
        <section><h2>Mastery criteria</h2>${list(unit.education.masteryCriteria)}</section>
        <section><h2>Key ideas</h2>${list(copy.keyIdeas)}</section>
        <section><h2>Practical rules</h2>${list(copy.practicalRules)}</section>
        <section><h2>Decision process</h2>${list(copy.decisionProcess)}</section>
        <section><h2>Common misconceptions</h2>${list(copy.misconceptions)}</section>
        <section><h2>Reflection prompts</h2>${list(copy.reflectionPrompts)}</section>
        <section><h2>Coaching prompts</h2>${list(copy.coachingPrompts)}</section>
      </div>
      <aside>
        <section class="position-panel" aria-labelledby="position-title">
          <h2 id="position-title">Study positions</h2>
          <div class="position-tabs" role="tablist" aria-label="Choose a study position">${unit.positions.map(positionTemplate).join('')}</div>
          <div id="library-board" class="library-board" aria-label="Read-only chess position"></div>
          <div id="position-description" class="position-description"></div>
        </section>
      </aside>
    </div>
    <section class="learning-section"><h2>Learning activities</h2>${learningObjects(unit)}</section>
    <section class="relationships"><h2>Knowledge connections</h2>${relationSections(unit)}</section>`;
  if (push) history.pushState({}, '', `?unit=${encodeURIComponent(scopedSlug)}`);
  state.board = new EndgameBoardView({
    element: $('#library-board'),
    rulesFactory: fen => ChessRulesFacade.fromFen(fen)
  }).initialize();
  state.board.setInteractive(false);
  updatePosition(0);
  $('#detail-title').focus();
}

function showLibrary({ push = false } = {}) {
  state.board?.dispose();
  state.board = null;
  state.detailUnit = null;
  $('#unit-detail').hidden = true;
  $('#missing-state').hidden = true;
  $('#library-content').hidden = false;
  if (push) history.pushState({}, '', '/endgame-library');
  $('#library-title').focus();
}

function route() {
  const slug = new URLSearchParams(location.search).get('unit');
  return slug ? openUnit(slug, { push: false }) : showLibrary();
}

async function initialize() {
  $('#loading-state').hidden = false;
  $('#error-state').hidden = true;
  try {
    state.reader = await loadPinnedEndgameLibrary();
    state.summaries = state.reader.getUnitSummaries();
    taxonomyOptions('difficulties', $('#filter-difficulty'));
    taxonomyOptions('learnerLevels', $('#filter-level'));
    taxonomyOptions('themes', $('#filter-theme'));
    taxonomyOptions('skills', $('#filter-skill'));
    $('#cluster-nav').innerHTML = CLUSTERS.map(cluster =>
      `<a href="#cluster-${cluster.id}">${escapeHtml(cluster.label)}</a>`).join('');
    $('#release-note').textContent = `Pinned release · ${state.summaries.length} verified concepts · taxonomy ${PINNED_RELEASE.taxonomyVersion}`;
    renderCards();
    $('#loading-state').hidden = true;
    await route();
  } catch (error) {
    console.error(error);
    $('#loading-state').hidden = true;
    $('#error-state').hidden = false;
    $('#error-message').textContent = 'The verified knowledge release could not be loaded. Your training data was not affected.';
  }
}

document.addEventListener('input', event => {
  if (event.target.closest('#library-filters')) renderCards();
});
document.addEventListener('change', event => {
  if (event.target.closest('#library-filters')) renderCards();
});
document.addEventListener('reset', event => {
  if (event.target.id === 'library-filters') requestAnimationFrame(renderCards);
});
document.addEventListener('click', event => {
  const opener = event.target.closest('[data-open-unit]');
  if (opener) openUnit(opener.dataset.openUnit);
  if (event.target.closest('[data-back-library]')) {
    event.preventDefault();
    showLibrary({ push: true });
  }
  const position = event.target.closest('[data-position-index]');
  if (position) updatePosition(Number(position.dataset.positionIndex));
  if (event.target.closest('#empty-reset')) $('#library-filters').reset();
});
$('#retry-button').addEventListener('click', () => location.reload());
window.addEventListener('popstate', route);
initialize();
