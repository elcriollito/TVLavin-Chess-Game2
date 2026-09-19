import { createScannerBetaService } from '../../api/_lib/scanner-beta-service.js';
import { SCANNER_BETA, betaEnabled, privateHeaders, sameOrigin } from '../../api/_lib/scanner-beta-policy.js';
import { createScannerBetaLocalStore } from './local-store.mjs';
import { inferFrozenV05 } from './inference-adapter.mjs';

async function readBytes(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function responseAdapter(res) {
  return {
    setHeader: (name, value) => res.setHeader(name, value),
    status(status) {
      return { json(body) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(body));
        return body;
      } };
    }
  };
}

export function createScannerBetaHttpAdapter({ env = process.env, store = null } = {}) {
  const localStore = store || createScannerBetaLocalStore({ root: env.CAISSA_SCANNER_BETA_DATA_ROOT });
  const service = createScannerBetaService({ store: localStore, env });
  return Object.freeze({
    store: localStore,
    async handle(req, res, pathname) {
      if (!pathname.startsWith('/api/scanner/beta/')) return false;
      privateHeaders(res);
      const target = pathname.slice('/api/scanner/beta/'.length);
      const adapted = responseAdapter(res);
      if (target === 'status') { await service.status(req, adapted); return true; }
      if (!betaEnabled(env)) { adapted.status(404).json({ error: 'BETA_DISABLED' }); return true; }
      try {
        const limit = target === 'image' ? SCANNER_BETA.maxImageBytes : target === 'recognize' ? 2_000_000 : SCANNER_BETA.maxJsonBytes;
        const bytes = await readBytes(req, limit);
        req.body = target === 'image' ? bytes : JSON.parse(bytes.toString('utf8') || '{}');
      } catch (error) {
        adapted.status(String(error.message).includes('LARGE') ? 413 : 400).json({ error: String(error.message) });
        return true;
      }
      if (target === 'recognize') {
        if (req.method !== 'POST') adapted.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
        else if (!sameOrigin(req)) adapted.status(403).json({ error: 'ORIGIN_REJECTED' });
        else {
          try { adapted.status(200).json(await inferFrozenV05(req.body, { env })); }
          catch (error) { adapted.status(503).json({ error: String(error.message || 'INFERENCE_FAILED') }); }
        }
      }
      else if (target === 'scan') await service.scan(req, adapted);
      else if (target === 'feedback') await service.feedback(req, adapted);
      else if (target === 'image') await service.image(req, adapted);
      else adapted.status(404).json({ error: 'NOT_FOUND' });
      return true;
    }
  });
}
