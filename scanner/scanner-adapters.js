(function (global) {
  'use strict';

  const VERSION = '1.1.0';

  function createLichessAnalysisUrl(fen) {
    const normalized = typeof fen === 'string' ? fen.trim().replace(/\s+/g, '_') : '';
    if (!normalized) return '';
    return 'https://lichess.org/analysis/standard/' + normalized;
  }

  function prepareCaissaAnalyzeHandoff(fen, options = {}) {
    const transport = global.CaissaAnalyzeHandoff?.createTransport?.();
    if (!transport || typeof fen !== 'string' || !fen.trim()) {
      return Object.freeze({ ok: false, status: 'unavailable', reasonCode: 'HANDOFF_UNAVAILABLE' });
    }
    const created = transport.create({
      source: 'scanner',
      intent: 'analyze-position',
      payload: {
        finalFen: fen.trim(),
        selectedPly: 0,
        boardOrientation: options.orientation === 'black' ? 'black' : 'white',
        recordStatus: 'active',
        mode: 'scanner'
      },
      provenance: { sourceSection: 'scanner' }
    });
    if (!created.ok) return created;
    const stored = transport.store(created.value);
    if (!stored.ok) return stored;
    const url = new URL('/analyze', global.location.origin);
    url.searchParams.set('handoff', created.value.token);
    return Object.freeze({ ok: true, status: 'ready', value: Object.freeze({ url: url.toString(), handoff: created.value }) });
  }

  function handoffToAnalyze(fen, options = {}) {
    const prepared = prepareCaissaAnalyzeHandoff(fen, options);
    if (prepared.ok) global.location.assign(prepared.value.url);
    return prepared;
  }

  global.CaissaScannerAdapters = Object.freeze({
    schemaVersion: VERSION,
    createLichessAnalysisUrl,
    prepareCaissaAnalyzeHandoff,
    handoffToAnalyze
  });
})(window);
