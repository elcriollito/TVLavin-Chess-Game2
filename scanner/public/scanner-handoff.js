(function (global) {
  'use strict';

  const CONFIG_URL = '/api/scanner/public/handoff';
  const QR_URL = '/api/scanner/public/handoff-qr';

  function validConfig(value) {
    if (!value || value.schemaVersion !== 'caissa-scanner-handoff/1') return false;
    if (!['production', 'preview', 'development'].includes(value.environment)) return false;
    try {
      const url = new URL(value.url);
      return url.protocol === 'https:' && url.pathname === '/scanner';
    } catch (_) {
      return false;
    }
  }

  function apply(config, documentRef = document) {
    if (!validConfig(config)) throw new Error('SCANNER_HANDOFF_CONFIG_INVALID');
    const cta = documentRef.getElementById('scannerMobileCta');
    const input = documentRef.getElementById('scannerCanonicalUrl');
    const qr = documentRef.getElementById('scannerHandoffQr');
    const copy = documentRef.getElementById('copyScannerUrlBtn');
    if (cta) {
      cta.href = config.url;
      cta.removeAttribute('aria-disabled');
    }
    if (input) input.value = config.url;
    if (qr) {
      qr.src = QR_URL;
      qr.alt = 'QR code for ' + (config.environment === 'preview' ? 'the protected CAISSA Scanner preview' : 'CAISSA Scanner');
    }
    if (copy) copy.disabled = false;
    const root = documentRef.documentElement;
    root.dataset.scannerHandoffEnvironment = config.environment;
    root.dataset.scannerHandoffReady = 'true';
    if (config.environment === 'preview' && config.buildIdentity) {
      if (config.buildIdentity.sourceSha) root.dataset.scannerBuildSha = config.buildIdentity.sourceSha;
      if (config.buildIdentity.publicStage) root.dataset.scannerPublicStage = config.buildIdentity.publicStage;
    }
    return config.url;
  }

  async function load(fetchImpl = global.fetch, documentRef = document) {
    const response = await fetchImpl(CONFIG_URL, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('SCANNER_HANDOFF_CONFIG_UNAVAILABLE');
    return apply(await response.json(), documentRef);
  }

  global.CaissaScannerHandoff = Object.freeze({ load, apply, validConfig, CONFIG_URL, QR_URL });
  if (typeof document !== 'undefined') {
    load().catch(() => {
      document.documentElement.dataset.scannerHandoffReady = 'false';
    });
  }
})(window);
