import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { previewArenaEnabled } from './eae013.js';

const indexDocument = fileURLToPath(new URL('../index.html', import.meta.url));

export function renderPreviewDocument(document, relayOrigin) {
  const relay = new URL(relayOrigin);
  if (relay.protocol !== 'https:' || !relay.hostname.endsWith('.vercel.app') || relay.pathname !== '/')
    throw new Error('EAE015A_RELAY_ORIGIN_INVALID');
  const meta = document.match(/<meta http-equiv="Content-Security-Policy" content="[^"]+">/i)?.[0];
  if (!meta || !/connect-src [^;]+;/.test(meta)) throw new Error('EAE015A_META_CSP_MISSING');
  const amended = meta.replace(/connect-src ([^;]+);/, (directive, sources) =>
    sources.includes(relay.origin) ? directive : `connect-src ${sources} ${relay.origin};`);
  return document.replace(meta, amended);
}

export function createPreviewPageHandler({ loadDocument = () => readFile(indexDocument, 'utf8') } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const host = String(req.headers.host || '').toLowerCase();
    if (!previewArenaEnabled(process.env, host)) return res.status(404).end();
    const document = renderPreviewDocument(await loadDocument(), process.env.EAE015A_RELAY_ORIGIN);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(req.method === 'HEAD' ? '' : document);
  };
}

export default createPreviewPageHandler();
