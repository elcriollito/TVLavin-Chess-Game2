import {
  archiveMeta, champions, reigns, championshipEvents, pgnCollections,
  getChampion, getReign, validateChampionshipArchive
} from './championship-archive-data.js';

const byId = (values) => new Map(values.map(value => [value.id, value]));
const championById = byId(champions);
const reignById = byId(reigns);
const collectionById = byId(pgnCollections);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const primaryChampions = archiveMeta.primaryChampionIds.map(getChampion);

function reignLabel(champion) {
  const values = (champion.reignIds || []).map(getReign).filter(reign => reign && reign.lineage !== 'fide');
  if (!values.length) return 'Parallel FIDE line';
  return values.map(reign => `${reign.startYear}–${reign.endYear || 'present'}`).join(' · ');
}

function renderChampionCards() {
  const track = document.querySelector('[data-champion-track]');
  if (!track) return;
  track.innerHTML = primaryChampions.map(champion => {
    const collections = (champion.collectionIds || []).map(id => collectionById.get(id)).filter(Boolean);
    return `<article class="champion-card${champion.id === archiveMeta.currentChampionId ? ' is-current' : ''}" id="${escapeHtml(champion.id)}" role="listitem">
      <div class="champion-card__index"><span>No. ${String(champion.order).padStart(2, '0')}</span><span>${champion.id === archiveMeta.currentChampionId ? 'Current' : 'World champion'}</span></div>
      <div class="champion-card__portrait" role="img" aria-label="Portrait placeholder for ${escapeHtml(champion.displayName)}"><span class="champion-card__initials">${escapeHtml(champion.initials)}</span></div>
      <div class="champion-card__body">
        <div class="champion-card__reign">${escapeHtml(reignLabel(champion))}</div>
        <h3>${escapeHtml(champion.displayName)}</h3>
        <div class="champion-card__country">${escapeHtml(champion.country)}</div>
        <p class="champion-card__summary">${escapeHtml(champion.summary)}</p>
        <div class="champion-card__footer"><span>${collections.length ? `${collections.length} PGN ${collections.length === 1 ? 'collection' : 'collections'}` : 'PGN not imported'}</span><button type="button" data-open-champion="${escapeHtml(champion.id)}">View reign</button></div>
      </div>
    </article>`;
  }).join('');
}

function renderSplitDiagram() {
  const target = document.querySelector('[data-split-diagram]');
  if (!target) return;
  const renderTrack = (label, reignIds) => `<div class="split-track"><div class="split-track__label"><span>${label}</span><span>1993 → 2006</span></div><div class="split-track__line" style="--split-count:${reignIds.length}">${reignIds.map(id => {
    const reign = reignById.get(id);
    const champion = championById.get(reign.championId);
    return `<div class="split-node"><strong>${escapeHtml(champion.displayName)}</strong><span>${reign.startYear}–${reign.endYear}</span></div>`;
  }).join('')}</div></div>`;
  target.innerHTML = `${renderTrack('Classical lineage', archiveMeta.splitEra.classicalReignIds)}${renderTrack('FIDE lineage', archiveMeta.splitEra.fideReignIds)}<div class="split-merge"><span>Reunified · Kramnik–Topalov · 2006</span></div>`;
}

function eventsForChampion(championId) {
  return championshipEvents.filter(event => event.championId === championId || event.challengerId === championId || event.winnerId === championId || event.loserId === championId || event.participantIds?.includes(championId)).sort((a, b) => a.year - b.year);
}

function collectionMarkup(collection) {
  const readerAction = collection.readerCompatible && collection.readerHref
    ? `<a href="${escapeHtml(collection.readerHref)}">Open in PGN Reader</a>`
    : `<button type="button" disabled title="The current web reader has no allowlisted collection handoff yet">Reader handoff pending</button>`;
  return `<article class="collection-card"><h4>${escapeHtml(collection.title)}</h4><p>${escapeHtml(collection.gamesCount)} ${collection.gamesCount === 1 ? 'game' : 'games'} · ${escapeHtml(collection.provenance)}</p><div class="collection-actions">${readerAction}${collection.downloadable ? `<a href="${escapeHtml(collection.asset)}" download>Download PGN</a>` : ''}</div></article>`;
}

function openChampionDetail(championId, updateHash = true) {
  const champion = championById.get(championId);
  const dialog = document.querySelector('[data-champion-dialog]');
  const target = document.querySelector('[data-champion-detail]');
  if (!champion || !dialog || !target) return;
  const index = primaryChampions.findIndex(entry => entry.id === champion.id);
  const predecessor = index > 0 ? primaryChampions[index - 1] : null;
  const successor = index >= 0 && index < primaryChampions.length - 1 ? primaryChampions[index + 1] : null;
  const championReigns = (champion.reignIds || []).map(id => reignById.get(id)).filter(Boolean);
  const primaryReign = championReigns.find(reign => reign.lineage !== 'fide') || championReigns[0];
  const events = eventsForChampion(champion.id);
  const collections = (champion.collectionIds || []).map(id => collectionById.get(id)).filter(Boolean);
  target.innerHTML = `<header class="detail-hero"><div class="detail-monogram" role="img" aria-label="Portrait placeholder for ${escapeHtml(champion.displayName)}">${escapeHtml(champion.initials)}</div><div><div class="detail-order">${champion.order ? `World champion no. ${String(champion.order).padStart(2, '0')}` : 'Parallel FIDE lineage'}</div><h2 id="champion-detail-title">${escapeHtml(champion.displayName)}</h2><p>${escapeHtml(champion.summary)}</p><div class="detail-metadata"><span>${escapeHtml(champion.country)}</span><span>${escapeHtml(reignLabel(champion))}</span><span>${collections.length ? `${collections.length} local PGN ${collections.length === 1 ? 'asset' : 'assets'}` : 'PGN assets not imported'}</span></div></div></header>
    <div class="detail-content"><div>
      <section class="detail-section"><h3>Reign at a glance</h3><div class="reign-summary"><div><strong>${escapeHtml(primaryReign?.startYear ?? '—')}</strong><span>Crowned</span></div><div><strong>${escapeHtml(primaryReign?.defenseCount ?? 0)}</strong><span>Title defenses</span></div><div><strong>${escapeHtml(primaryReign?.championshipMatchCount ?? 0)}</strong><span>Title events</span></div></div></section>
      <section class="detail-section"><h3>Championship events</h3><div class="event-list">${events.map(event => `<article class="event-row"><strong>${event.year}</strong><div><h4>${escapeHtml(event.title)}</h4><p>${escapeHtml([event.format, event.score, event.location, event.note].filter(Boolean).join(' · '))}</p></div><span class="event-lineage">${escapeHtml(event.lineage)}</span></article>`).join('')}</div></section>
    </div><aside>
      <section class="detail-section"><h3>Lineage</h3><div class="lineage-links">${predecessor ? `<a href="#champion=${escapeHtml(predecessor.id)}" data-dialog-champion="${escapeHtml(predecessor.id)}"><small>Predecessor</small>${escapeHtml(predecessor.displayName)}</a>` : '<span><small>Predecessor</small>First champion</span>'}${successor ? `<a href="#champion=${escapeHtml(successor.id)}" data-dialog-champion="${escapeHtml(successor.id)}"><small>Successor</small>${escapeHtml(successor.displayName)}</a>` : '<span><small>Successor</small>Current champion</span>'}</div></section>
      <section class="detail-section"><h3>PGN collections</h3><div class="collection-list">${collections.length ? collections.map(collectionMarkup).join('') : '<div class="empty-collection">No approved local collection is attached yet. Actions remain unavailable until a source and asset are reviewed.</div>'}</div></section>
    </aside></div>`;
  target.querySelectorAll('[data-dialog-champion]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); openChampionDetail(link.dataset.dialogChampion); }));
  if (!dialog.open) dialog.showModal();
  if (updateHash) history.replaceState(null, '', `#champion=${champion.id}`);
}

function bindTimeline() {
  const viewport = document.querySelector('[data-mural-viewport]');
  const progress = document.querySelector('[data-mural-progress]');
  const updateProgress = () => {
    const available = Math.max(1, viewport.scrollWidth - viewport.clientWidth);
    const visible = viewport.clientWidth / viewport.scrollWidth;
    const offset = viewport.scrollLeft / available;
    progress.style.width = `${Math.max(8, visible * 100)}%`;
    progress.style.transform = `translateX(${offset * (100 / Math.max(visible, .08) - 100)}%)`;
  };
  document.querySelectorAll('[data-timeline-direction]').forEach(button => button.addEventListener('click', () => viewport.scrollBy({ left: button.dataset.timelineDirection === 'next' ? 590 : -590, behavior: 'smooth' })));
  viewport.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
}

function bindInteractions() {
  document.querySelectorAll('[data-open-champion]').forEach(button => button.addEventListener('click', () => openChampionDetail(button.dataset.openChampion)));
  document.querySelectorAll('[data-era-target]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.eraTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' })));
  const dialog = document.querySelector('[data-champion-dialog]');
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog?.addEventListener('close', () => { if (location.hash.startsWith('#champion=')) history.replaceState(null, '', location.pathname + location.search); });
}

function openHashChampion() {
  const match = location.hash.match(/^#champion=([a-z0-9-]+)$/);
  if (match) openChampionDetail(match[1], false);
}

const validation = validateChampionshipArchive();
if (!validation.valid) console.error('[Championship Archive] Invalid data model', validation.errors);
renderChampionCards();
renderSplitDiagram();
bindTimeline();
bindInteractions();
openHashChampion();
window.CaissaChampionshipArchive = Object.freeze({ version: '0.1.0', validation, openChampionDetail });
