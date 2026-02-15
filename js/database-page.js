(function () {
  const listView = document.getElementById('ecoListView');
  const detailView = document.getElementById('ecoDetailView');
  const ecoList = document.getElementById('ecoList');
  const ecoTabs = document.getElementById('ecoTabs');
  const ecoSearch = document.getElementById('ecoSearch');

  const pathMatch = window.location.pathname.match(/^\/database\/eco\/([A-E]\d{2})$/i);
  const requestedCode = pathMatch ? pathMatch[1].toUpperCase() : null;

  let openings = [];
  let activeLetter = 'A';

  function normSan(san) {
    return String(san || '').replace(/\d+\.(\.\.)?/g, '').replace(/[+#?!]+/g, '').trim();
  }

  function representativeForCode(code) {
    const lines = openings.filter(o => o.eco === code);
    if (!lines.length) return null;
    return lines.slice().sort((a, b) => a.moves.length - b.moves.length)[0];
  }

  function renderTabs() {
    ecoTabs.innerHTML = ['A','B','C','D','E'].map(letter =>
      `<button class="eco-tab ${letter === activeLetter ? 'active' : ''}" data-letter="${letter}">${letter}</button>`
    ).join('');
    ecoTabs.querySelectorAll('.eco-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLetter = btn.dataset.letter;
        renderTabs();
        renderList();
      });
    });
  }

  function renderList() {
    const q = (ecoSearch.value || '').toLowerCase();
    const uniqueCodes = [...new Set(openings.map(o => o.eco))].filter(code => code && code.startsWith(activeLetter));
    const rows = uniqueCodes
      .map(code => representativeForCode(code))
      .filter(Boolean)
      .filter(row => !q || row.eco.toLowerCase().includes(q) || row.name.toLowerCase().includes(q))
      .sort((a, b) => a.eco.localeCompare(b.eco))
      .map(row => `<a class="eco-row" href="/database/eco/${row.eco}"><span class="eco-code">${row.eco}</span><span>${row.name}</span></a>`)
      .join('');
    ecoList.innerHTML = rows || '<div class="eco-row"><span>No entries</span></div>';
  }

  async function renderDetail(code) {
    const rep = representativeForCode(code);
    if (!rep) {
      document.getElementById('ecoTitle').textContent = `${code} not found`;
      return;
    }

    document.getElementById('ecoTitle').textContent = `${rep.eco} - ${rep.name}`;
    document.getElementById('ecoMoves').textContent = `Defining moves: ${rep.moves.join(' ')}`;

    const repMoves = rep.moves.map(normSan);
    const related = openings
      .filter(o => o.eco !== code && o.moves.length > rep.moves.length)
      .filter(o => repMoves.every((m, i) => normSan(o.moves[i]) === m))
      .slice(0, 12);

    const relatedEl = document.getElementById('ecoRelated');
    relatedEl.innerHTML = related.length
      ? related.map(r => `<li><a href="/database/eco/${r.eco}">${r.eco} - ${r.name}</a></li>`).join('')
      : '<li>No related lines found.</li>';

    let theoryText = 'No dedicated coach theory file yet for this ECO.';
    try {
      const theoryRes = await fetch(`/data/openings/eco/${code}.json`, { cache: 'no-cache' });
      if (theoryRes.ok) {
        const theory = await theoryRes.json();
        const lines = [];
        if (Array.isArray(theory.principles)) lines.push(...theory.principles);
        if (Array.isArray(theory.plansWhite) && theory.plansWhite[0]) lines.push(`White: ${theory.plansWhite[0]}`);
        if (Array.isArray(theory.plansBlack) && theory.plansBlack[0]) lines.push(`Black: ${theory.plansBlack[0]}`);
        theoryText = lines.join('\n');
      }
    } catch (e) {
      // ignore
    }

    document.getElementById('ecoTheory').textContent = theoryText;
  }

  async function init() {
    const res = await fetch('/data/openings.json', { cache: 'no-cache' });
    openings = await res.json();

    if (requestedCode) {
      listView.style.display = 'none';
      detailView.style.display = 'block';
      await renderDetail(requestedCode);
      return;
    }

    renderTabs();
    renderList();
    ecoSearch.addEventListener('input', renderList);
  }

  init().catch(err => {
    ecoList.innerHTML = `<div class="eco-row"><span>Failed to load ECO data: ${err.message}</span></div>`;
  });
})();
