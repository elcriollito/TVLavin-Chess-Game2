import {
  archiveMeta, champions, reigns, championshipEvents,
  getChampion, getReign, validateChampionshipArchive
} from './championship-archive-data.js';
import {
  getKnownPgnCollection, getPgnCollection, getPgnAvailability,
  resolveRuntimeRegistryMode
} from './pgn-collection-registry.js';
import { buildArchiveReturnTo, readArchiveState } from './archive-return-state.js';
import { CaissaPgnReader } from './caissa-pgn-reader.js';

const byId = values => new Map(values.map(value => [value.id, value]));
const championById = byId(champions);
const reignById = byId(reigns);
const eventById = byId(championshipEvents);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const primaryChampions = archiveMeta.primaryChampionIds.map(getChampion);
const registryMode = resolveRuntimeRegistryMode(location.hostname);
const initialState = readArchiveState(location);
const uiState = {
  view: initialState.view,
  lineage: initialState.lineage,
  champion: championById.has(initialState.champion) ? initialState.champion : null,
  reign: reignById.has(initialState.reign) ? initialState.reign : null,
  event: eventById.has(initialState.event) ? initialState.event : null
};

const archiveScrollTop = () => Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
const restoreArchiveScroll = value => {
  window.scrollTo(0, value);
  document.documentElement.scrollTop = value;
  document.body.scrollTop = value;
};

const externalPeople = Object.freeze({
  'johannes-zukertort': 'Johannes Zukertort', 'paul-keres': 'Paul Keres',
  'samuel-reshevsky': 'Samuel Reshevsky', 'viktor-korchnoi': 'Viktor Korchnoi',
  'nigel-short': 'Nigel Short', 'jan-timman': 'Jan Timman',
  'ian-nepomniachtchi': 'Ian Nepomniachtchi'
});

function personName(id) {
  return championById.get(id)?.displayName || externalPeople[id] || (id ? id.replaceAll('-', ' ') : 'Vacant title');
}

function reignLabel(champion) {
  const values = (champion.reignIds || []).map(getReign).filter(reign => reign && reign.lineage !== 'fide');
  if (!values.length) return 'Parallel FIDE line';
  return values.map(reign => `${reign.startYear}–${reign.endYear || 'present'}`).join(' · ');
}

function championEra(champion) {
  const firstReign = (champion.reignIds || []).map(getReign).filter(Boolean)[0];
  if (!firstReign) return 'Championship lineage';
  if (firstReign.startYear < 1948) return 'Founding era';
  if (firstReign.startYear < 1975) return 'FIDE & Soviet era';
  if (firstReign.startYear < 2007) return 'Rival dynasties';
  return 'Reunified crown';
}

function availabilityCopy(collectionId) {
  const availability = getPgnAvailability(collectionId, { mode: registryMode });
  const descriptions = {
    available: 'Rights-cleared · Reader and download available',
    'internal-qa': 'Local QA only · Not approved for public release',
    'pending-review': 'Rights review required · Public actions disabled',
    'historical-only': 'Historical record · No PGN collection attached'
  };
  return descriptions[availability.code] || descriptions['historical-only'];
}

function setExpandedChampion(championId = null) {
  document.querySelectorAll('.champion-card').forEach(card => card.classList.toggle('is-selected', card.id === championId));
  document.querySelectorAll('[data-open-champion]').forEach(button => button.setAttribute('aria-expanded', String(button.dataset.openChampion === championId)));
}

function currentReturnTo(overrides = {}) {
  const viewport = document.querySelector('[data-mural-viewport]');
  return buildArchiveReturnTo({
    ...uiState,
    scroll: Math.max(0, Math.round(archiveScrollTop())),
    mural: Math.max(0, Math.round(viewport?.scrollLeft || 0)),
    ...overrides
  });
}

function writeState({ replace = true } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', currentReturnTo());
}

function collectionForRuntime(id) {
  return id ? getPgnCollection(id, { mode: registryMode }) : null;
}

function renderChampionCards() {
  const track = document.querySelector('[data-champion-track]');
  track.innerHTML = primaryChampions.map(champion => {
    const collections = (champion.collectionIds || []).map(getKnownPgnCollection).filter(Boolean);
    const available = collections.filter(entry => getPgnAvailability(entry.id, { mode: registryMode }).accessible).length;
    return `<article class="champion-card${champion.id === archiveMeta.currentChampionId ? ' is-current' : ''}" id="${escapeHtml(champion.id)}" data-era="${escapeHtml(championEra(champion))}" role="listitem">
      <div class="champion-card__index"><span>No. ${String(champion.order).padStart(2, '0')}</span><span>${champion.id === archiveMeta.currentChampionId ? 'Current' : 'World champion'}</span></div>
      <div class="champion-card__portrait" role="img" aria-label="Archival monogram for ${escapeHtml(champion.displayName)}; no portrait published"><span class="champion-card__number" aria-hidden="true">${String(champion.order).padStart(2, '0')}</span><span class="champion-card__medallion" aria-hidden="true"></span><span class="champion-card__initials">${escapeHtml(champion.initials)}</span><span class="champion-card__portrait-status">Archival monogram · no portrait</span></div>
      <div class="champion-card__body"><p class="champion-card__era">${escapeHtml(championEra(champion))}</p><div class="champion-card__reign">${escapeHtml(reignLabel(champion))}</div><h3>${escapeHtml(champion.displayName)}</h3>
        ${champion.nationalIdentityVerified ? `<div class="champion-card__country">${escapeHtml(champion.country)}</div>` : ''}
        <p class="champion-card__summary">${escapeHtml(champion.summary)}</p>
        <div class="champion-card__footer"><span>${available ? `${available} playable PGN ${available === 1 ? 'collection' : 'collections'}` : collections.length ? 'PGN awaiting approval' : 'Historical record'}</span><button type="button" data-open-champion="${escapeHtml(champion.id)}" aria-expanded="false">Explore champion</button></div>
      </div></article>`;
  }).join('');
}

function renderSplitDiagram() {
  const target = document.querySelector('[data-split-diagram]');
  const track = (label, ids) => `<div class="split-track"><div class="split-track__label"><span>${label}</span><span>1993 → 2006</span></div><div class="split-track__line" style="--split-count:${ids.length}">${ids.map(id => {
    const reign = reignById.get(id); const champion = championById.get(reign.championId);
    return `<div class="split-node"><strong>${escapeHtml(champion.displayName)}</strong><span>${reign.startYear}–${reign.endYear}</span></div>`;
  }).join('')}</div></div>`;
  target.innerHTML = `${track('Classical lineage', archiveMeta.splitEra.classicalReignIds)}${track('FIDE lineage', archiveMeta.splitEra.fideReignIds)}<div class="split-merge"><span>Reunified · Kramnik–Topalov · 2006</span></div>`;
}

function eventsForChampion(championId) {
  return championshipEvents.filter(event => event.championId === championId || event.challengerId === championId || event.winnerId === championId || event.loserId === championId || event.participantIds?.includes(championId)).sort((a, b) => a.year - b.year);
}

function availabilityBadge(collectionId) {
  const availability = getPgnAvailability(collectionId, { mode: registryMode });
  return `<span class="pgn-availability pgn-availability--${availability.code}">${escapeHtml(availability.label)}</span>`;
}

function collectionMarkup(collectionId) {
  const known = getKnownPgnCollection(collectionId);
  const runtime = collectionForRuntime(collectionId);
  if (!known) return '';
  const availability = getPgnAvailability(known.id, { mode: registryMode });
  const readerAction = runtime?.readerCompatible
    ? `<button type="button" data-open-pgn="${escapeHtml(known.id)}">Open in PGN Reader</button>`
    : '<button type="button" disabled title="This collection is not approved for public distribution">Not available publicly</button>';
  return `<article class="collection-card${known.gamesCount > 1 ? ' is-complete' : ''} collection-card--${availability.code}"><div class="collection-card__type"><span>${known.type === 'championship-match' ? 'Championship match' : 'Player collection'}</span>${availabilityBadge(known.id)}</div><h4>${escapeHtml(known.title)}</h4><p><strong>${known.gamesCount} ${known.gamesCount === 1 ? 'game' : 'games'}</strong> · ${escapeHtml(known.attribution)}</p><p class="collection-card__availability">${escapeHtml(availabilityCopy(known.id))}</p><div class="collection-actions">${readerAction}${runtime?.downloadable ? `<a href="${escapeHtml(runtime.localAsset)}" download>Download PGN</a>` : ''}</div></article>`;
}

function openReader(collectionId, eventId = null) {
  const opened = CaissaPgnReader.open({ collectionId, gameId: null, target: 'best-available', returnTo: currentReturnTo({ event: eventId || uiState.event }) });
  if (!opened) document.querySelector('[data-reader-notice]')?.removeAttribute('hidden');
}

function openChampionDetail(championId, options = {}) {
  const champion = championById.get(championId);
  const dialog = document.querySelector('[data-champion-dialog]');
  const target = document.querySelector('[data-champion-detail]');
  if (!champion || !dialog || !target) return false;
  const championReigns = (champion.reignIds || []).map(id => reignById.get(id)).filter(Boolean);
  const requestedReign = championReigns.find(value => value.id === options.reignId) || championReigns[0];
  const events = eventsForChampion(champion.id);
  const requestedEvent = events.find(value => value.id === options.eventId) || null;
  const index = primaryChampions.findIndex(entry => entry.id === champion.id);
  const predecessor = index > 0 ? primaryChampions[index - 1] : null;
  const successor = index >= 0 && index < primaryChampions.length - 1 ? primaryChampions[index + 1] : null;
  uiState.champion = champion.id; uiState.reign = requestedReign?.id || null; uiState.event = requestedEvent?.id || null;
  const collectionIds = [...new Set([...(champion.collectionIds || []), ...events.map(event => event.pgnCollectionId).filter(Boolean)])];
  target.innerHTML = `<header class="detail-hero"><div class="detail-monogram" role="img" aria-label="Archival monogram for ${escapeHtml(champion.displayName)}; no portrait published"><span class="detail-monogram__number" aria-hidden="true">${String(champion.order || '').padStart(2, '0')}</span><span class="detail-monogram__initials">${escapeHtml(champion.initials)}</span><small>Photo-free archive portrait</small></div><div><div class="detail-order">${champion.order ? `World champion no. ${String(champion.order).padStart(2, '0')}` : 'Parallel FIDE lineage'}</div><h2 id="champion-detail-title">${escapeHtml(champion.displayName)}</h2><p>${escapeHtml(champion.summary)}</p><div class="detail-metadata"><span>${escapeHtml(reignLabel(champion))}</span><span>${collectionIds.length ? `${collectionIds.length} registered PGN ${collectionIds.length === 1 ? 'record' : 'records'}` : 'Historical record only'}</span></div></div></header>
    <div class="detail-content"><div><section class="detail-section"><div class="detail-section__heading"><h3>Reigns</h3><span>${championReigns.length} ${championReigns.length === 1 ? 'chapter' : 'chapters'} in the lineage</span></div><div class="reign-list">${championReigns.map((reign, reignIndex) => `<button type="button" class="reign-card${reign.id === requestedReign?.id ? ' is-selected' : ''}" data-detail-reign="${escapeHtml(reign.id)}" aria-pressed="${reign.id === requestedReign?.id}"><small>Reign ${String(reignIndex + 1).padStart(2, '0')}</small><strong>${reign.startYear}–${reign.endYear || 'Present'}</strong><span>${escapeHtml(reign.lineage)} lineage · ${reign.defenseCount} ${reign.defenseCount === 1 ? 'defense' : 'defenses'}</span></button>`).join('')}</div></section>
      <section class="detail-section"><h3>Selected reign at a glance</h3><div class="reign-summary"><div><strong>${requestedReign?.startYear ?? '—'}</strong><span>Crowned</span></div><div><strong>${escapeHtml(requestedReign?.lineage || '—')}</strong><span>Lineage</span></div><div><strong>${requestedReign?.defenseCount ?? '—'}</strong><span>Title defenses</span></div></div></section>
      <section class="detail-section"><h3>Historical context</h3><p class="detail-context">${escapeHtml(champion.summary)} ${events.length ? `The archive connects ${events.length} relevant championship ${events.length === 1 ? 'event' : 'events'} to this career.` : 'No championship event record is attached yet.'}</p></section>
      <section class="detail-section"><div class="detail-section__heading"><h3>Championship events</h3><span>Chronological record</span></div><div class="event-list">${events.map(event => `<article class="event-row${event.id === requestedEvent?.id ? ' is-selected' : ''}" data-event-id="${event.id}"><strong>${event.year}</strong><div><h4>${escapeHtml(event.title)}</h4><p>${escapeHtml([event.numberOfGames !== undefined ? `${event.numberOfGames} games` : null, event.score ? `Score ${event.score}` : null, event.location, event.historicalNote].filter(Boolean).join(' · '))}</p></div><div class="event-badges">${availabilityBadge(event.pgnCollectionId)}<span class="event-status">${escapeHtml(event.status)}</span><span class="event-lineage">${escapeHtml(event.lineage)}</span></div></article>`).join('')}</div></section></div>
      <aside><section class="detail-section"><h3>Lineage</h3><div class="lineage-links">${predecessor ? `<a href="#champion=${predecessor.id}" data-dialog-champion="${predecessor.id}"><small>Predecessor</small>${escapeHtml(predecessor.displayName)}</a>` : '<span><small>Predecessor</small>First champion</span>'}${successor ? `<a href="#champion=${successor.id}" data-dialog-champion="${successor.id}"><small>Successor</small>${escapeHtml(successor.displayName)}</a>` : '<span><small>Successor</small>Current champion</span>'}</div></section>
      <section class="detail-section"><div class="detail-section__heading"><h3>PGN collections</h3><span>Publication status shown per item</span></div><p class="collection-policy">Reader and download actions appear only for collections available in the current approved registry mode.</p><p data-reader-notice hidden class="reader-notice">This collection is not approved for public redistribution.</p><div class="collection-list">${collectionIds.length ? collectionIds.map(collectionMarkup).join('') : '<div class="empty-collection"><strong>Historical record only</strong><span>No reviewed PGN collection is attached. Metadata remains visible without exposing an unapproved asset.</span></div>'}</div></section></aside></div>`;
  target.querySelectorAll('[data-dialog-champion]').forEach(link => link.addEventListener('click', event => { event.preventDefault(); openChampionDetail(link.dataset.dialogChampion); }));
  target.querySelectorAll('[data-detail-reign]').forEach(button => button.addEventListener('click', () => openChampionDetail(champion.id, { reignId: button.dataset.detailReign })));
  target.querySelectorAll('[data-open-pgn]').forEach(button => button.addEventListener('click', () => openReader(button.dataset.openPgn, uiState.event)));
  const anchor = uiState.view === 'matches' && requestedEvent
    ? document.querySelector(`[data-match-event="${requestedEvent.id}"]`)
    : document.getElementById(champion.id);
  if (anchor) anchor.after(dialog);
  dialog.hidden = false;
  setExpandedChampion(champion.id);
  document.querySelectorAll('.match-card').forEach(card => card.classList.toggle('is-selected', card.dataset.matchEvent === requestedEvent?.id));
  if (options.scrollIntoView !== false) dialog.scrollIntoView({ behavior: 'auto', block: 'start' });
  if (options.updateState !== false) writeState();
  return true;
}

function eventFilterGroup(event) {
  if (event.format === 'administrative' || ['aborted', 'forfeited', 'tournament', 'reunification'].includes(event.status)) return 'special';
  return event.lineage;
}

function eventContextChampion(event) {
  return event.winnerId && championById.has(event.winnerId) ? event.winnerId
    : event.championId && championById.has(event.championId) ? event.championId
      : event.challengerId && championById.has(event.challengerId) ? event.challengerId : null;
}

function renderMatches() {
  const target = document.querySelector('[data-match-list]');
  const results = document.querySelector('[data-match-results]');
  const detail = document.querySelector('[data-champion-dialog]');
  const parking = document.querySelector('[data-detail-parking]');
  if (detail && parking && target.contains(detail)) { detail.hidden = true; parking.after(detail); }
  const events = championshipEvents.filter(event => uiState.lineage === 'all' || eventFilterGroup(event) === uiState.lineage);
  const filterLabels = { all: 'Complete championship record', undisputed: 'Undisputed lineage', classical: 'Classical lineage', fide: 'FIDE lineage', special: 'Exceptional transitions' };
  document.querySelectorAll('[data-filter-count]').forEach(count => {
    const filter = count.dataset.filterCount;
    count.textContent = filter === 'all' ? championshipEvents.length : championshipEvents.filter(event => eventFilterGroup(event) === filter).length;
  });
  if (results) results.textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'} · ${filterLabels[uiState.lineage]} · chronological order`;
  target.innerHTML = events.map((event, eventIndex) => {
    const participantIds = event.participantIds || [event.championId, event.challengerId].filter(Boolean);
    const participants = participantIds.length ? participantIds.map(personName).join(' vs. ') : event.winnerId ? `Winner: ${personName(event.winnerId)}` : 'Championship transition';
    const runtime = collectionForRuntime(event.pgnCollectionId);
    const championId = eventContextChampion(event);
    const factLine = [event.score ? `Score ${event.score}` : null, event.numberOfGames !== undefined ? `${event.numberOfGames} games` : null, event.location].filter(Boolean).join(' · ');
    return `<article class="match-card${event.id === uiState.event ? ' is-selected' : ''}" data-match-event="${event.id}"><div class="match-card__date"><span>${String(eventIndex + 1).padStart(2, '0')}</span><strong class="match-card__year">${event.year}</strong></div><div class="match-card__body"><div class="match-card__meta"><span>${escapeHtml(event.lineage)}</span><span>${escapeHtml(event.status)}</span></div><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(participants)}</p>${factLine ? `<div class="match-card__facts">${escapeHtml(factLine)}</div>` : ''}${event.historicalNote ? `<small>${escapeHtml(event.historicalNote)}</small>` : ''}</div><div class="match-card__actions">${availabilityBadge(event.pgnCollectionId)}${runtime?.readerCompatible ? `<button type="button" data-match-pgn="${runtime.id}" data-event="${event.id}">Open PGN</button>` : ''}${championId ? `<button type="button" data-match-champion="${championId}" data-event="${event.id}">Champion context</button>` : ''}</div></article>`;
  }).join('') || '<p class="match-empty">No events match this filter.</p>';
  target.querySelectorAll('[data-match-pgn]').forEach(button => button.addEventListener('click', () => { uiState.event = button.dataset.event; writeState(); openReader(button.dataset.matchPgn, button.dataset.event); }));
  target.querySelectorAll('[data-match-champion]').forEach(button => button.addEventListener('click', () => openChampionDetail(button.dataset.matchChampion, { eventId: button.dataset.event })));
}

function closeChampionDetail({ update = true } = {}) {
  const detail = document.querySelector('[data-champion-dialog]');
  if (detail) {
    detail.hidden = true;
    document.querySelector('[data-detail-parking]').after(detail);
  }
  setExpandedChampion();
  document.querySelectorAll('.match-card.is-selected').forEach(card => card.classList.remove('is-selected'));
  uiState.champion = null; uiState.reign = null; uiState.event = null;
  if (update) writeState();
}

function setView(view, { update = true } = {}) {
  const detail = document.querySelector('[data-champion-dialog]');
  if (update && detail && !detail.hidden) closeChampionDetail({ update: false });
  uiState.view = view === 'matches' ? 'matches' : 'champions';
  document.querySelectorAll('[data-archive-view]').forEach(element => { element.hidden = element.dataset.archiveView !== uiState.view; });
  document.querySelectorAll('[data-archive-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.archiveMode === uiState.view)));
  if (uiState.view === 'matches') renderMatches();
  if (update) writeState({ replace: false });
}

function setLineage(lineage, { update = true } = {}) {
  const detail = document.querySelector('[data-champion-dialog]');
  if (update && detail && !detail.hidden) closeChampionDetail({ update: false });
  uiState.lineage = ['all', 'undisputed', 'classical', 'fide', 'special'].includes(lineage) ? lineage : 'all';
  document.querySelectorAll('[data-match-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.matchFilter === uiState.lineage)));
  renderMatches();
  if (update) writeState();
}

function bindInteractions() {
  document.querySelectorAll('[data-open-champion]').forEach(button => button.addEventListener('click', () => openChampionDetail(button.dataset.openChampion)));
  document.querySelectorAll('[data-era-target]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.eraTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'start' })));
  document.querySelectorAll('[data-archive-mode]').forEach(button => button.addEventListener('click', () => setView(button.dataset.archiveMode)));
  document.querySelectorAll('[data-match-filter]').forEach(button => button.addEventListener('click', () => setLineage(button.dataset.matchFilter)));
  document.querySelector('[data-close-champion]').addEventListener('click', () => closeChampionDetail());
}

function restoreState() {
  setView(uiState.view, { update: false }); setLineage(uiState.lineage, { update: false });
  requestAnimationFrame(() => {
    const viewport = document.querySelector('[data-mural-viewport]');
    if (viewport) viewport.scrollLeft = initialState.mural;
    if (uiState.champion) openChampionDetail(uiState.champion, { reignId: uiState.reign, eventId: uiState.event, scrollIntoView: false, updateState: false });
    requestAnimationFrame(() => restoreArchiveScroll(initialState.scroll));
  });
}

const validation = validateChampionshipArchive();
if (!validation.valid) console.error('[Championship Archive] Invalid data model', validation.errors);
renderChampionCards(); renderSplitDiagram(); bindInteractions(); restoreState();
window.CaissaChampionshipArchive = Object.freeze({ version: '0.4.0', validation, openChampionDetail, getState: () => Object.freeze({ ...uiState }) });
