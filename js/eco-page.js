(function () {
  const listView = document.getElementById('ecoListView');
  const detailView = document.getElementById('ecoDetailView');
  const ecoTabs = document.getElementById('ecoTabs');
  const ecoList = document.getElementById('ecoList');
  const ecoSearch = document.getElementById('ecoSearch');
  const ecoFallback = document.getElementById('ecoFallback');

  const codeMatch = window.location.pathname.match(/^\/eco\/([A-E]\d{2})$/i);
  const requestedCode = codeMatch ? codeMatch[1].toUpperCase() : null;

  let ecoCodes = [];
  let openings = [];
  let ecoDetails = [];
  let activeLetter = 'A';

  function normalizeSan(san) {
    return String(san || '').replace(/\d+\.(\.\.)?/g, '').replace(/[+#?!]+/g, '').trim();
  }

  function isCodeQuery(q) {
    return /^[A-E]?\d{0,2}$/i.test(q);
  }

  function loadTabs() {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    ecoTabs.innerHTML = letters.map(letter =>
      `<button class="eco-tab ${letter === activeLetter ? 'active' : ''}" data-letter="${letter}">${letter}</button>`
    ).join('');

    ecoTabs.querySelectorAll('.eco-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLetter = btn.dataset.letter;
        loadTabs();
        renderList();
      });
    });
  }

  function renderList() {
    const q = (ecoSearch.value || '').trim();
    const qLower = q.toLowerCase();
    let rows = ecoCodes.filter(row => row.code.startsWith(activeLetter));

    if (q) {
      if (isCodeQuery(q)) {
        const qCode = q.toUpperCase();
        rows = rows.filter(row => row.code.startsWith(qCode) || row.code === qCode);
      } else {
        rows = rows.filter(row => row.name.toLowerCase().includes(qLower));
      }
    }

    rows.sort((a, b) => a.code.localeCompare(b.code));

    ecoList.innerHTML = rows.length
      ? rows.map(row => {
        const moves = (row.moves && String(row.moves).trim()) ? String(row.moves).trim() : '-';
        return `<a class="eco-row" href="/eco/${row.code}">
          <span class="eco-code">${row.code}</span>
          <span class="eco-name">${row.name}</span>
          <span class="eco-moves" title="${moves.replace(/"/g, '&quot;')}">${moves}</span>
        </a>`;
      }).join('')
      : '<div class="eco-row"><span class="eco-code">--</span><span class="eco-name">No matching ECO codes.</span><span class="eco-moves">-</span></div>';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pieceImageFromFenChar(ch) {
    const white = ch === ch.toUpperCase();
    const map = {
      p: 'P',
      n: 'N',
      b: 'B',
      r: 'R',
      q: 'Q',
      k: 'K'
    };
    const piece = map[ch.toLowerCase()];
    if (!piece) return '';
    return `/img/chesspieces/wikipedia/${white ? 'w' : 'b'}${piece}.png`;
  }

  function renderMiniBoardFromFen(fen) {
    const boardEl = document.getElementById('ecoMiniBoard');
    const fallbackEl = document.getElementById('ecoMiniBoardFallback');
    if (!boardEl || !fallbackEl) return;

    boardEl.innerHTML = '';

    if (!fen || !String(fen).trim()) {
      fallbackEl.style.display = 'block';
      boardEl.style.display = 'none';
      return;
    }

    const placement = String(fen).split(' ')[0];
    const ranks = placement.split('/');
    if (ranks.length !== 8) {
      fallbackEl.style.display = 'block';
      boardEl.style.display = 'none';
      return;
    }

    fallbackEl.style.display = 'none';
    boardEl.style.display = 'grid';

    let squareIndex = 0;
    for (const rank of ranks) {
      for (const token of rank) {
        if (/\d/.test(token)) {
          const empties = Number(token);
          for (let i = 0; i < empties; i += 1) {
            const sq = document.createElement('div');
            const row = Math.floor(squareIndex / 8);
            const col = squareIndex % 8;
            sq.className = `eco-sq ${(row + col) % 2 === 0 ? 'dark' : 'light'}`;
            boardEl.appendChild(sq);
            squareIndex += 1;
          }
        } else {
          const sq = document.createElement('div');
          const row = Math.floor(squareIndex / 8);
          const col = squareIndex % 8;
          sq.className = `eco-sq ${(row + col) % 2 === 0 ? 'dark' : 'light'}`;

          const pieceSrc = pieceImageFromFenChar(token);
          if (pieceSrc) {
            const img = document.createElement('img');
            img.className = 'eco-piece';
            img.src = pieceSrc;
            img.alt = '';
            sq.appendChild(img);
          }

          boardEl.appendChild(sq);
          squareIndex += 1;
        }
      }
    }
  }

  async function renderDetail(code) {
    const row = ecoCodes.find(r => r.code === code);
    const detail = ecoDetails.find(d => d.code === code) || null;
    document.getElementById('ecoDetailTitle').textContent = row ? `${row.code} - ${row.name}` : `${code} - Unknown ECO`;

    const lines = openings.filter(o => o.eco === code);
    const defining = lines.length
      ? lines.slice().sort((a, b) => a.moves.length - b.moves.length)[0]
      : null;

    document.getElementById('ecoDetailMoves').textContent = defining
      ? `Defining moves: ${defining.moves.join(' ')}`
      : (detail && detail.moves ? `Defining moves: ${detail.moves}` : 'Moves not added yet');

    const tensPrefix = `${code[0]}${code[1]}`;
    const related = ecoCodes.filter(r => r.code !== code && r.code.startsWith(tensPrefix)).slice(0, 20);
    const relatedEl = document.getElementById('ecoDetailRelated');
    relatedEl.innerHTML = related.length
      ? related.map(r => `<li><a href="/eco/${r.code}">${r.code} - ${r.name}</a></li>`).join('')
      : '<li>No related lines found.</li>';

    let theoryText = 'Theory coming soon.';
    try {
      const tRes = await fetch(`/data/openings/eco/${code}.json`, { cache: 'no-cache' });
      if (tRes.ok) {
        const theory = await tRes.json();
        const parts = [];
        if (Array.isArray(theory.principles)) parts.push(...theory.principles);
        if (Array.isArray(theory.plansWhite) && theory.plansWhite[0]) parts.push(`White: ${theory.plansWhite[0]}`);
        if (Array.isArray(theory.plansBlack) && theory.plansBlack[0]) parts.push(`Black: ${theory.plansBlack[0]}`);
        if (parts.length) theoryText = parts.join('\n');
      }
    } catch (err) {
      // fallback text already set
    }

    document.getElementById('ecoDetailTheory').textContent = theoryText;

    renderMiniBoardFromFen(detail && detail.fen ? detail.fen : '');

    const stats = detail && detail.stats ? detail.stats : { white: 0, draw: 0, black: 0, games: 0 };
    const show = (value) => Number(value) > 0 ? `${value}%` : 'TBD';
    document.getElementById('ecoStatGames').textContent = Number(stats.games) > 0 ? String(stats.games) : 'TBD';
    document.getElementById('ecoStatWhite').textContent = show(stats.white);
    document.getElementById('ecoStatDraw').textContent = show(stats.draw);
    document.getElementById('ecoStatBlack').textContent = show(stats.black);

    const continuationsEl = document.getElementById('ecoContinuations');
    const list = detail && Array.isArray(detail.continuations) && detail.continuations.length
      ? detail.continuations.slice(0, 5)
      : [
          { san: 'TBD', label: 'Main line', percent: 0 },
          { san: 'TBD', label: 'Sideline', percent: 0 },
          { san: 'TBD', label: 'Flexible setup', percent: 0 },
          { san: 'TBD', label: 'Positional line', percent: 0 },
          { san: 'TBD', label: 'Tactical option', percent: 0 }
        ];

    continuationsEl.innerHTML = list.map((item) => {
      const san = escapeHtml(item.san || 'TBD');
      const label = escapeHtml(item.label || '');
      const percent = Number(item.percent) > 0 ? `${item.percent}%` : 'TBD%';
      return `<li><span>${san}</span> - <span>${label || 'Line'}</span> - <strong>${percent}</strong></li>`;
    }).join('');
  }

  async function init() {
    try {
      const [codesRes, openingsRes, detailsRes] = await Promise.all([
        fetch('/data/eco/eco_codes.json', { cache: 'no-cache' }),
        fetch('/data/openings.json', { cache: 'no-cache' }),
        fetch('/data/eco/eco_details.json', { cache: 'no-cache' })
      ]);

      if (!codesRes.ok || !openingsRes.ok) {
        throw new Error(`Dataset fetch failed: codes ${codesRes.status}, openings ${openingsRes.status}`);
      }

      ecoCodes = await codesRes.json();
      openings = await openingsRes.json();
      ecoDetails = detailsRes.ok ? await detailsRes.json() : [];

      if (requestedCode) {
        listView.style.display = 'none';
        detailView.style.display = 'block';
        await renderDetail(requestedCode);
        return;
      }

      loadTabs();
      renderList();
      ecoSearch.addEventListener('input', renderList);
    } catch (err) {
      console.error('[ECO] Failed to load dataset', err);
      ecoFallback.style.display = 'block';
      ecoFallback.textContent = 'ECO dataset failed to load.';
      ecoList.innerHTML = '<div class="eco-row"><span class="eco-code">ERR</span><span>ECO dataset failed to load.</span></div>';
    }
  }

  init();
})();
