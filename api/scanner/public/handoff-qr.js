import QRCode from 'qrcode';
import { createScannerHandoff, scannerHandoffHeaders } from '../../_lib/scanner-handoff.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    res.end('Method not allowed');
    return;
  }
  try {
    const handoff = createScannerHandoff();
    const png = await QRCode.toBuffer(handoff.url, {
      type: 'png',
      width: 208,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' }
    });
    for (const [name, value] of Object.entries(scannerHandoffHeaders(handoff))) res.setHeader(name, value);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', String(png.length));
    res.statusCode = 200;
    res.end(png);
  } catch (_) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.statusCode = 503;
    res.end('Scanner handoff unavailable');
  }
}
