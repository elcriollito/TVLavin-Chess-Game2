import { createScannerHandoff, scannerHandoffHeaders } from '../../_lib/scanner-handoff.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
    return;
  }
  try {
    const handoff = createScannerHandoff();
    for (const [name, value] of Object.entries(scannerHandoffHeaders(handoff))) res.setHeader(name, value);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 200;
    res.end(JSON.stringify(handoff));
  } catch (_) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.statusCode = 503;
    res.end(JSON.stringify({ error: 'SCANNER_HANDOFF_UNAVAILABLE' }));
  }
}
