import { createScannerBetaService } from '../../../api/_lib/scanner-beta-service.js';

export const config = { api: { bodyParser: false } };

async function bytes(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('IMAGE_SIZE_INVALID');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  try { req.body = await bytes(req, 12_000_000); }
  catch (_) { return res.status(413).json({ error: 'IMAGE_SIZE_INVALID' }); }
  return createScannerBetaService().image(req, res);
}
