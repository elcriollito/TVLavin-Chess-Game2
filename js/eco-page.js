(function () {
  const listView = document.getElementById('ecoListView');
  const ecoTabs = document.getElementById('ecoTabs');
  const ecoList = document.getElementById('ecoList');
  const ecoSearch = document.getElementById('ecoSearch');
  const ecoFallback = document.getElementById('ecoFallback');
  const detailPanel = document.getElementById('ecoDetailPanel');

  let ecoCodes = [];
  let openings = [];
  let ecoDetails = [];
  let activeLetter = 'A';
  let selectedCode = null;

  function parseCode(input) {
    const value = String(input || '').toUpperCase();
    return /^[A-E]\d{2}$/.test(value) ? value : null;
  }

  function getCodeFromUrl() {
    const pathMatch = window.location.pathname.match(/^\/eco\/([A-E]\d{2})$/i);
    if (pathMatch) {
      return parseCode(pathMatch[1]);
    }
    const hashMatch = window.location.hash.match(/^#([A-E]\d{2})$/i);
    return hashMatch ? parseCode(hashMatch[1]) : null;
  }

  function isCodeQuery(q) {
    return /^[A-E]?\d{0,2}$/i.test(q);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function loadTabs() {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    ecoTabs.innerHTML = letters.map((letter) =>
      `<button class="eco-tab ${letter === activeLetter ? 'active' : ''}" data-letter="${letter}">${letter}</button>`
    ).join('');

    ecoTabs.querySelectorAll('.eco-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeLetter = btn.dataset.letter;
        loadTabs();
        renderList();
      });
    });
  }

  function getFilteredRows() {
    const q = (ecoSearch.value || '').trim();
    const qLower = q.toLowerCase();
    let rows = ecoCodes.filter((row) => row.code.startsWith(activeLetter));

    if (q) {
      if (isCodeQuery(q)) {
        const qCode = q.toUpperCase();
        rows = rows.filter((row) => row.code.startsWith(qCode) || row.code === qCode);
      } else {
        rows = rows.filter((row) => row.name.toLowerCase().includes(qLower));
      }
    }

    return rows.sort((a, b) => a.code.localeCompare(b.code));
  }

  function renderList() {
    const rows = getFilteredRows();

    ecoList.innerHTML = rows.length
      ? rows.map((row) => {
          const moves = (row.moves && String(row.moves).trim()) ? String(row.moves).trim() : '-';
          const selectedClass = row.code === selectedCode ? ' is-selected' : '';
          return `<a class="eco-row${selectedClass}" data-code="${row.code}" href="/eco/${row.code}">
            <span class="eco-code">${row.code}</span>
            <span class="eco-name">${escapeHtml(row.name)}</span>
            <span class="eco-moves" title="${escapeHtml(moves)}">${escapeHtml(moves)}</span>
          </a>`;
        }).join('')
      : '<div class="eco-row"><span class="eco-code">--</span><span class="eco-name">No matching ECO codes.</span><span class="eco-moves">-</span></div>';
  }

  function pieceImageFromFenChar(ch) {
    const white = ch === ch.toUpperCase();
    const map = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
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

  function renderDefaultDetail() {
    const titleEl = document.getElementById('ecoDetailTitle');
    const movesEl = document.getElementById('ecoDetailMoves');
    const relatedEl = document.getElementById('ecoDetailRelated');
    const theoryEl = document.getElementById('ecoDetailTheory');
    const continuationsEl = document.getElementById('ecoContinuations');

    if (titleEl) titleEl.textContent = 'Select an opening';
    if (movesEl) movesEl.textContent = 'Pick an ECO code from the left list to see details.';
    if (relatedEl) relatedEl.innerHTML = '<li>Select an ECO code to load related lines.</li>';
    if (theoryEl) theoryEl.textContent = 'Theory summary will appear here.';

    renderMiniBoardFromFen('');

    document.getElementById('ecoStatGames').textContent = 'TBD';
    document.getElementById('ecoStatLastPlayed').textContent = 'TBD';
    document.getElementById('ecoStatWhite').textContent = 'TBD';
    document.getElementById('ecoStatDraw').textContent = 'TBD';
    document.getElementById('ecoStatBlack').textContent = 'TBD';

    document.getElementById('ecoWdlWhiteBar').style.width = '33%';
    document.getElementById('ecoWdlDrawBar').style.width = '34%';
    document.getElementById('ecoWdlBlackBar').style.width = '33%';

    if (continuationsEl) {
      continuationsEl.innerHTML = [
        'Main line',
        'Positional plan',
        'Tactical option',
        'Sideline',
        'Flexible setup'
      ].map((label) => `<li><span>TBD</span> - <span>${label}</span> - <strong>TBD%</strong></li>`).join('');
    }
  }

  async function renderDetail(code) {
    const normalized = parseCode(code);
    if (!normalized) {
      renderDefaultDetail();
      return;
    }

    const row = ecoCodes.find((r) => r.code === normalized) || null;
    const detail = ecoDetails.find((d) => d.code === normalized) || null;

    if (!row) {
      console.warn(`[ECO] Code ${normalized} not found in eco_codes.json`);
    }
    if (!detail) {
      console.warn(`[ECO] Code ${normalized} missing in eco_details.json, using fallback rendering`);
    }

    const titleEl = document.getElementById('ecoDetailTitle');
    const movesEl = document.getElementById('ecoDetailMoves');
    const relatedEl = document.getElementById('ecoDetailRelated');
    const theoryEl = document.getElementById('ecoDetailTheory');
    const continuationsEl = document.getElementById('ecoContinuations');

    const displayName = (row && row.name) || (detail && detail.name) || 'Unknown ECO';
    if (titleEl) titleEl.textContent = `${normalized} - ${displayName}`;

    const lines = openings.filter((o) => o.eco === normalized && Array.isArray(o.moves));
    const defining = lines.length ? lines.slice().sort((a, b) => a.moves.length - b.moves.length)[0] : null;
    const fallbackMoves = (detail && detail.moves) || (row && row.moves) || '';
    if (movesEl) {
      movesEl.textContent = defining
        ? `Defining moves: ${defining.moves.join(' ')}`
        : (fallbackMoves ? `Defining moves: ${fallbackMoves}` : 'Moves not added yet');
    }

    const tensPrefix = `${normalized[0]}${normalized[1]}`;
    const related = ecoCodes
      .filter((r) => r.code !== normalized && r.code.startsWith(tensPrefix))
      .slice(0, 20);
    if (relatedEl) {
      relatedEl.innerHTML = related.length
        ? related.map((r) => `<li><a href="/eco/${r.code}" data-code="${r.code}">${r.code} - ${escapeHtml(r.name)}</a></li>`).join('')
        : '<li>No related lines found.</li>';
    }

    let theoryText = 'Theory coming soon.';
    try {
      const tRes = await fetch(`/data/openings/eco/${normalized}.json`, { cache: 'no-cache' });
      if (tRes.ok) {
        const theory = await tRes.json();
        const parts = [];
        if (Array.isArray(theory.principles)) parts.push(...theory.principles);
        if (Array.isArray(theory.plansWhite) && theory.plansWhite[0]) parts.push(`White: ${theory.plansWhite[0]}`);
        if (Array.isArray(theory.plansBlack) && theory.plansBlack[0]) parts.push(`Black: ${theory.plansBlack[0]}`);
        if (parts.length) theoryText = parts.join('\n');
      }
    } catch (err) {
      // Keep fallback
    }
    if (theoryEl) theoryEl.textContent = theoryText;

    renderMiniBoardFromFen(detail && detail.fen ? detail.fen : '');

    const stats = detail && detail.stats ? detail.stats : { white: 0, draw: 0, black: 0, games: 0 };
    const whitePct = Number(stats.white) || 0;
    const drawPct = Number(stats.draw) || 0;
    const blackPct = Number(stats.black) || 0;
    const totalPct = whitePct + drawPct + blackPct;
    const showPct = (v) => (Number(v) > 0 ? `${v}%` : 'TBD');

    document.getElementById('ecoStatGames').textContent = Number(stats.games) > 0 ? String(stats.games) : 'TBD';
    document.getElementById('ecoStatLastPlayed').textContent = stats.lastPlayed ? String(stats.lastPlayed) : 'TBD';
    document.getElementById('ecoStatWhite').textContent = showPct(whitePct);
    document.getElementById('ecoStatDraw').textContent = showPct(drawPct);
    document.getElementById('ecoStatBlack').textContent = showPct(blackPct);

    if (totalPct > 0) {
      document.getElementById('ecoWdlWhiteBar').style.width = `${(whitePct / totalPct) * 100}%`;
      document.getElementById('ecoWdlDrawBar').style.width = `${(drawPct / totalPct) * 100}%`;
      document.getElementById('ecoWdlBlackBar').style.width = `${(blackPct / totalPct) * 100}%`;
    } else {
      document.getElementById('ecoWdlWhiteBar').style.width = '33%';
      document.getElementById('ecoWdlDrawBar').style.width = '34%';
      document.getElementById('ecoWdlBlackBar').style.width = '33%';
    }

    const continuationList = detail && Array.isArray(detail.continuations) && detail.continuations.length
      ? detail.continuations.slice(0, 5)
      : [
          { san: 'TBD', label: 'Main line', percent: 0 },
          { san: 'TBD', label: 'Sideline', percent: 0 },
          { san: 'TBD', label: 'Flexible setup', percent: 0 },
          { san: 'TBD', label: 'Positional line', percent: 0 },
          { san: 'TBD', label: 'Tactical option', percent: 0 }
        ];

    if (continuationsEl) {
      continuationsEl.innerHTML = continuationList.map((item) => {
        const san = escapeHtml(item.san || 'TBD');
        const label = escapeHtml(item.label || 'Line');
        const percent = Number(item.percent) > 0 ? `${item.percent}%` : 'TBD%';
        return `<li><span>${san}</span> - <span>${label}</span> - <strong>${percent}</strong></li>`;
      }).join('');
    }
  }

  function selectCode(code, options = {}) {
    const { pushHistory = true, scrollMobile = false } = options;
    const normalized = parseCode(code);

    selectedCode = normalized;

    if (normalized) {
      activeLetter = normalized[0];
      loadTabs();
    }

    renderList();

    if (!normalized) {
      renderDefaultDetail();
      if (pushHistory) {
        history.pushState({}, '', '/eco');
      }
      return;
    }

    renderDetail(normalized);

    if (pushHistory) {
      history.pushState({}, '', `/eco/${normalized}`);
    }

    if (scrollMobile && window.matchMedia('(max-width: 840px)').matches && detailPanel) {
      detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function bindEvents() {
    ecoSearch.addEventListener('input', renderList);

    ecoList.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-code]');
      if (!link) return;
      event.preventDefault();
      selectCode(link.dataset.code, { pushHistory: true, scrollMobile: true });
    });

    document.getElementById('ecoDetailRelated').addEventListener('click', (event) => {
      const link = event.target.closest('a[data-code]');
      if (!link) return;
      event.preventDefault();
      selectCode(link.dataset.code, { pushHistory: true, scrollMobile: true });
    });

    window.addEventListener('popstate', () => {
      const code = getCodeFromUrl();
      selectCode(code, { pushHistory: false, scrollMobile: false });
    });
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

      if (detailsRes.ok) {
        ecoDetails = await detailsRes.json();
      } else {
        ecoDetails = [];
        console.warn(`[ECO] eco_details.json failed to load (${detailsRes.status}), using fallback detail rendering`);
      }

      loadTabs();
      bindEvents();

      const codeFromUrl = getCodeFromUrl();
      if (codeFromUrl) {
        selectCode(codeFromUrl, { pushHistory: false, scrollMobile: false });
      } else {
        renderList();
        renderDefaultDetail();
      }
    } catch (err) {
      console.error('[ECO] Failed to load dataset', err);
      if (listView) {
        ecoFallback.style.display = 'block';
        ecoFallback.textContent = 'ECO dataset failed to load.';
        ecoList.innerHTML = '<div class="eco-row"><span class="eco-code">ERR</span><span class="eco-name">ECO dataset failed to load.</span><span class="eco-moves">-</span></div>';
      }
      renderDefaultDetail();
    }
  }

  init();
})();
