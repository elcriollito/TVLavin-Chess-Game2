import { create as createPgnBoard } from '../pgn-replayer/pgn-board.js?v=2.0.1';
import { getPgnCollection } from './pgn-collection-registry.js';
import { normalizeArchiveReturnTo } from './archive-return-state.js';

const MAX_PGN_BYTES = 10 * 1024 * 1024;
const ALLOWED_PARAMS = new Set(['collection', 'game', 'returnTo']);

const root = document.querySelector('[data-championship-replay]');

if (root) {
  const elements = {
    title: root.querySelector('[data-replay-title]'),
    subtitle: root.querySelector('[data-replay-subtitle]'),
    returnLink: root.querySelector('[data-replay-return]'),
    status: root.querySelector('[data-replay-status]'),
    year: root.querySelector('[data-replay-year]'),
    gamePosition: root.querySelector('[data-replay-game-position]'),
    gameCount: root.querySelector('[data-replay-game-count]'),
    gameTitle: root.querySelector('[data-replay-game-title]'),
    result: root.querySelector('[data-replay-result]'),
    metadata: root.querySelector('[data-replay-metadata]'),
    games: root.querySelector('[data-replay-games]'),
    notation: root.querySelector('[data-replay-notation]'),
    white: root.querySelector('[data-replay-white]'),
    whiteElo: root.querySelector('[data-replay-white-elo]'),
    black: root.querySelector('[data-replay-black]'),
    blackElo: root.querySelector('[data-replay-black-elo]'),
    boardLoading: root.querySelector('[data-replay-board-loading]'),
    first: root.querySelector('[data-replay-first]'),
    previous: root.querySelector('[data-replay-previous]'),
    play: root.querySelector('[data-replay-play]'),
    playIcon: root.querySelector('[data-replay-play-icon]'),
    next: root.querySelector('[data-replay-next]'),
    last: root.querySelector('[data-replay-last]'),
    flip: root.querySelector('[data-replay-flip]'),
    previousGame: root.querySelector('[data-replay-previous-game]'),
    nextGame: root.querySelector('[data-replay-next-game]'),
    tabs: [...root.querySelectorAll('[data-replay-tab]')],
    tabPanels: [...root.querySelectorAll('[data-replay-tabpanel]')]
  };

  const state = {
    registryEntry: null,
    collection: null,
    game: null,
    gameIndex: -1,
    moveIndex: -1,
    activeTab: 'games',
    worker: null,
    requestId: 0,
    autoplayTimer: null
  };

  let board;
  try {
    board = createPgnBoard(root.querySelector('#championship-replay-board'), { orientation: 'white' });
  } catch (_) {
    setStatus('The championship board could not be initialized.', 'error');
  }

  function setStatus(message, tone = 'info', hidden = false) {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
    elements.status.hidden = hidden;
  }

  function finishBusy() {
    root.removeAttribute('aria-busy');
  }

  function fail(message) {
    stopAutoplay();
    finishBusy();
    setStatus(message, 'error');
  }

  function createMetadataRow(label, value) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value || '—';
    row.append(term, description);
    return row;
  }

  function renderMetadata(game) {
    const headers = game.headers;
    const rows = [
      createMetadataRow('Event', headers.Event),
      createMetadataRow('Site', headers.Site),
      createMetadataRow('Date', headers.Date),
      createMetadataRow('Round', headers.Round),
      createMetadataRow('White', headers.White),
      createMetadataRow('Black', headers.Black),
      createMetadataRow('Result', headers.Result || game.result)
    ];
    if (headers.ECO) rows.push(createMetadataRow('ECO', headers.ECO));
    if (headers.Opening) rows.push(createMetadataRow('Opening', headers.Opening));
    if (headers.Variation) rows.push(createMetadataRow('Variation', headers.Variation));
    elements.metadata.replaceChildren(...rows);
  }

  function selectTab(name, focus = false) {
    if (!['games', 'notation'].includes(name)) return false;
    state.activeTab = name;
    elements.tabs.forEach(tab => {
      const selected = tab.dataset.replayTab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    elements.tabPanels.forEach(panel => {
      panel.hidden = panel.dataset.replayTabpanel !== name;
    });
    root.dataset.activeTab = name;
    return true;
  }

  function gameSummary(game) {
    const headers = game.headers;
    return [headers.Event, headers.Date, headers.Round && `Round ${headers.Round}`].filter(Boolean).join(' · ');
  }

  function renderGames() {
    elements.games.replaceChildren();
    elements.gameCount.textContent = `(${state.collection.games.length})`;
    state.collection.games.forEach((game, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'championship-game-row';
      button.dataset.gameIndex = String(index);
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-current', String(index === state.gameIndex));
      button.setAttribute('aria-label', `Game ${index + 1}: ${game.label}`);

      const number = document.createElement('span');
      number.className = 'championship-game-row__number';
      number.textContent = String(index + 1).padStart(2, '0');
      const players = document.createElement('span');
      players.className = 'championship-game-row__players';
      const names = document.createElement('strong');
      names.textContent = game.label;
      const detail = document.createElement('small');
      detail.textContent = gameSummary(game) || 'Championship game';
      players.append(names, detail);
      const result = document.createElement('span');
      result.className = 'championship-game-row__result';
      result.textContent = game.result || '*';
      button.append(number, players, result);
      button.addEventListener('click', () => selectGame(index));
      elements.games.append(button);
    });
  }

  function renderNotation() {
    elements.notation.replaceChildren();
    state.game.mainline.forEach((node, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.moveIndex = String(index);
      button.setAttribute('aria-current', String(index === state.moveIndex));
      button.setAttribute('aria-label', `${node.moveNumber}${node.turn === 'b' ? '...' : '.'} ${node.san}`);
      button.textContent = `${node.turn === 'w' ? `${node.moveNumber}. ` : ''}${node.san}`;
      button.addEventListener('click', () => goToMove(index));
      elements.notation.append(button);
    });
  }

  function keepCurrentGameVisible() {
    const selected = elements.games.querySelector('[aria-current="true"]');
    if (!selected) return;
    const top = selected.offsetTop;
    const bottom = top + selected.offsetHeight;
    if (top < elements.games.scrollTop) elements.games.scrollTop = top;
    else if (bottom > elements.games.scrollTop + elements.games.clientHeight) elements.games.scrollTop = bottom - elements.games.clientHeight;
  }

  function updateControls() {
    const hasGame = Boolean(state.game);
    const lastMove = (state.game?.mainline.length || 0) - 1;
    elements.first.disabled = !hasGame || state.moveIndex < 0;
    elements.previous.disabled = !hasGame || state.moveIndex < 0;
    elements.next.disabled = !hasGame || state.moveIndex >= lastMove;
    elements.last.disabled = !hasGame || lastMove < 0 || state.moveIndex === lastMove;
    elements.play.disabled = elements.next.disabled;
    elements.flip.disabled = !hasGame;
    elements.previousGame.disabled = !hasGame || state.gameIndex <= 0;
    elements.nextGame.disabled = !hasGame || state.gameIndex >= state.collection.games.length - 1;
  }

  function goToMove(index) {
    if (!state.game || index < -1 || index >= state.game.mainline.length) return false;
    state.moveIndex = index;
    const node = index >= 0 ? state.game.mainline[index] : null;
    board?.setPosition(node?.fenAfter || state.game.startFen, node, true);
    elements.notation.querySelectorAll('[data-move-index]').forEach(button => {
      button.setAttribute('aria-current', String(Number(button.dataset.moveIndex) === index));
    });
    updateControls();
    return true;
  }

  function stopAutoplay() {
    window.clearTimeout(state.autoplayTimer);
    state.autoplayTimer = null;
    elements.playIcon.textContent = '▶';
    elements.play.setAttribute('aria-label', 'Play moves automatically');
  }

  function toggleAutoplay() {
    if (state.autoplayTimer) {
      stopAutoplay();
      return;
    }
    elements.playIcon.textContent = 'Ⅱ';
    elements.play.setAttribute('aria-label', 'Pause automatic replay');
    const tick = () => {
      if (!goToMove(state.moveIndex + 1) || state.moveIndex >= state.game.mainline.length - 1) {
        stopAutoplay();
        return;
      }
      state.autoplayTimer = window.setTimeout(tick, 900);
    };
    tick();
  }

  function selectGame(index, announce = true) {
    stopAutoplay();
    const game = state.collection?.games?.[index];
    if (!game) return false;
    state.game = game;
    state.gameIndex = index;
    state.moveIndex = -1;
    const headers = game.headers;
    elements.title.textContent = state.registryEntry.title.replace(/^\d{4}\s+[—-]\s+/, '');
    elements.subtitle.textContent = gameSummary(game) || state.registryEntry.title;
    elements.year.textContent = state.registryEntry.title.match(/^\d{4}/)?.[0] || headers.Date?.slice(0, 4) || '—';
    elements.gamePosition.textContent = `Game ${index + 1} of ${state.collection.games.length}`;
    elements.gameTitle.textContent = game.label;
    elements.result.textContent = `Result ${game.result || '*'}`;
    elements.white.textContent = headers.White || 'White';
    elements.whiteElo.textContent = headers.WhiteElo || '—';
    elements.black.textContent = headers.Black || 'Black';
    elements.blackElo.textContent = headers.BlackElo || '—';
    renderMetadata(game);
    renderGames();
    renderNotation();
    board?.setPosition(game.startFen, null, false);
    elements.boardLoading.hidden = true;
    updateControls();
    queueMicrotask(keepCurrentGameVisible);
    root.dataset.collectionId = state.registryEntry.id;
    root.dataset.gameIndex = String(index);
    if (announce) setStatus(`Game ${index + 1} selected: ${game.label}`, 'info');
    return true;
  }

  function parsePgn(text, requestedGameIndex) {
    state.worker?.terminate();
    state.worker = new Worker('/js/pgn-replayer/pgn-worker.js', { type: 'module' });
    state.requestId += 1;
    const requestId = state.requestId;
    state.worker.addEventListener('message', event => {
      const response = event.data || {};
      if (response.requestId !== requestId) return;
      if (response.type !== 'parsed') {
        fail(response.error?.message || 'The approved championship PGN could not be read.');
        return;
      }
      state.collection = response.collection;
      if (!selectGame(requestedGameIndex, false)) {
        fail('The requested game does not exist in this championship collection.');
        return;
      }
      finishBusy();
      setStatus(`${state.collection.games.length} championship games ready. Game ${requestedGameIndex + 1} is selected.`, 'info');
    });
    state.worker.addEventListener('error', () => fail('The local championship parser stopped unexpectedly.'), { once: true });
    state.worker.postMessage({ type: 'parse', requestId, text });
  }

  async function loadRequestedCollection() {
    if (!board) return;
    const params = new URLSearchParams(window.location.search);
    if ([...params.keys()].some(key => !ALLOWED_PARAMS.has(key))) {
      fail('This replay link contains unsupported parameters.');
      return;
    }
    const collectionId = params.get('collection');
    const entry = getPgnCollection(collectionId);
    if (!entry || entry.type !== 'championship-match') {
      fail('This championship collection is not approved for public replay.');
      return;
    }
    const gameValue = params.get('game') ?? '0';
    if (!/^\d+$/.test(gameValue)) {
      fail('The requested game index is invalid.');
      return;
    }
    const gameIndex = Number(gameValue);
    if (!Number.isSafeInteger(gameIndex) || gameIndex < 0 || gameIndex >= entry.gamesCount) {
      fail('The requested game is not available in this championship collection.');
      return;
    }
    const returnValue = params.get('returnTo');
    if (returnValue !== null) {
      const safeReturnTo = normalizeArchiveReturnTo(returnValue);
      if (!safeReturnTo) {
        fail('The return destination is not an approved Champions archive state.');
        return;
      }
      elements.returnLink.href = safeReturnTo;
    }

    state.registryEntry = entry;
    elements.title.textContent = entry.title.replace(/^\d{4}\s+[—-]\s+/, '');
    elements.subtitle.textContent = 'Loading the approved match scorebook…';
    elements.year.textContent = entry.title.match(/^\d{4}/)?.[0] || '—';
    try {
      const response = await fetch(entry.readerAsset, { credentials: 'same-origin', cache: 'force-cache', redirect: 'error' });
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (!response.ok || (declaredSize && declaredSize > MAX_PGN_BYTES)) throw new Error('Unavailable collection');
      const text = await response.text();
      if (new Blob([text]).size > MAX_PGN_BYTES || !/^\s*\[(Event|Site|Date|Round|White|Black|Result)\s+"/m.test(text)) {
        throw new Error('Invalid PGN response');
      }
      setStatus('Reading the championship scorebook locally…');
      parsePgn(text, gameIndex);
    } catch (_) {
      fail('The approved championship collection is temporarily unavailable.');
    }
  }

  elements.first.addEventListener('click', () => { stopAutoplay(); goToMove(-1); });
  elements.previous.addEventListener('click', () => { stopAutoplay(); goToMove(state.moveIndex - 1); });
  elements.play.addEventListener('click', toggleAutoplay);
  elements.next.addEventListener('click', () => { stopAutoplay(); goToMove(state.moveIndex + 1); });
  elements.last.addEventListener('click', () => { stopAutoplay(); goToMove(state.game.mainline.length - 1); });
  elements.flip.addEventListener('click', () => board?.flip());
  elements.previousGame.addEventListener('click', () => selectGame(state.gameIndex - 1));
  elements.nextGame.addEventListener('click', () => selectGame(state.gameIndex + 1));
  elements.tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab.dataset.replayTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      let targetIndex = index;
      if (event.key === 'ArrowLeft') targetIndex = (index - 1 + elements.tabs.length) % elements.tabs.length;
      if (event.key === 'ArrowRight') targetIndex = (index + 1) % elements.tabs.length;
      if (event.key === 'Home') targetIndex = 0;
      if (event.key === 'End') targetIndex = elements.tabs.length - 1;
      selectTab(elements.tabs[targetIndex].dataset.replayTab, true);
    });
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || !state.game || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.closest('[role="tab"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); stopAutoplay(); goToMove(state.moveIndex - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); stopAutoplay(); goToMove(state.moveIndex + 1); }
    if (event.key === 'PageUp') { event.preventDefault(); selectGame(state.gameIndex - 1); }
    if (event.key === 'PageDown') { event.preventDefault(); selectGame(state.gameIndex + 1); }
  });
  window.addEventListener('beforeunload', () => {
    stopAutoplay();
    state.worker?.terminate();
    board?.destroy();
  }, { once: true });

  selectTab('games');
  loadRequestedCollection();
}
