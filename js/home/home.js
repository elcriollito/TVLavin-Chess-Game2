(() => {
  'use strict';
  // Home-owned navigation history only; no access to another feature's state.
  const tools = {
    play: ['Play', '/play'], puzzles: ['Puzzles', '/puzzles'],
    analyze: ['Analyze', '/analyze'], openings: ['Openings', '/opening-database'],
    endgames: ['Endgames', '/endgame-tablebase'], arena: ['Engine Arena', '/arena'],
    tv: ['Chess TV', '/spectator-tv']
  };
  const key = 'caissa.home.recent-tools.v1';
  let recent = [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(saved)) recent = [...new Set(saved.filter(id => Object.hasOwn(tools, id)))].slice(0, 4);
  } catch { /* The Home remains usable when storage is unavailable. */ }
  function renderRecent() {
    const container = document.getElementById('recent-tools');
    container.replaceChildren();
    for (const id of recent) {
      const link = document.createElement('a');
      link.href = `https://www.caissa-chess.org${tools[id][1]}`;
      link.textContent = tools[id][0];
      link.dataset.tool = id;
      container.append(link);
    }
    document.getElementById('recent').hidden = recent.length === 0;
  }
  document.addEventListener('click', event => {
    const id = event.target.closest('a[data-tool]')?.dataset.tool;
    if (!id || !Object.hasOwn(tools, id)) return;
    recent = [id, ...recent.filter(item => item !== id)].slice(0, 4);
    try { localStorage.setItem(key, JSON.stringify(recent)); } catch { /* Optional persistence. */ }
    renderRecent();
  });
  document.getElementById('clear-recent').addEventListener('click', () => {
    recent = [];
    try { localStorage.removeItem(key); } catch { /* Optional persistence. */ }
    renderRecent();
    document.getElementById('journey-title').tabIndex = -1;
    document.getElementById('journey-title').focus();
  });
  renderRecent();
  const names = { k:'K', q:'Q', r:'R', b:'B', n:'N', p:'P' };
  document.querySelectorAll('[data-fen]').forEach(board => {
    board.dataset.fen.split('/').forEach((row, rank) => {
      let file = 0;
      for (const token of row) {
        const empty = /[1-8]/.test(token);
        const count = empty ? Number(token) : 1;
        for (let i = 0; i < count; i++) {
          const square = document.createElement('span');
          square.className = `square${(rank + file) % 2 ? ' dark' : ''}`;
          if (!empty) {
            const piece = document.createElement('img');
            const color = token === token.toUpperCase() ? 'w' : 'b';
            piece.src = `/scanner/recognition/datasets/piece-sets/assets/kosal/original/${color}${names[token.toLowerCase()]}.svg`;
            piece.alt = ''; piece.draggable = false;
            square.append(piece);
          }
          board.append(square); file++;
        }
      }
    });
  });
})();
