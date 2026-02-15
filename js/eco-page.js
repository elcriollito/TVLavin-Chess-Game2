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

  async function renderDetail(code) {
    const row = ecoCodes.find(r => r.code === code);
    document.getElementById('ecoDetailTitle').textContent = row ? `${row.code} - ${row.name}` : `${code} - Unknown ECO`;

    const lines = openings.filter(o => o.eco === code);
    const defining = lines.length
      ? lines.slice().sort((a, b) => a.moves.length - b.moves.length)[0]
      : null;

    document.getElementById('ecoDetailMoves').textContent = defining
      ? `Defining moves: ${defining.moves.join(' ')}`
      : 'Moves not added yet';

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
  }

  async function init() {
    try {
      const [codesRes, openingsRes] = await Promise.all([
        fetch('/data/eco/eco_codes.json', { cache: 'no-cache' }),
        fetch('/data/openings.json', { cache: 'no-cache' })
      ]);

      if (!codesRes.ok || !openingsRes.ok) {
        throw new Error(`Dataset fetch failed: codes ${codesRes.status}, openings ${openingsRes.status}`);
      }

      ecoCodes = await codesRes.json();
      openings = await openingsRes.json();

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
