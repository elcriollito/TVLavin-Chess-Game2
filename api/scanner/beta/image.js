import { createScannerBetaService } from '../../../api/_lib/scanner-beta-service.js';
import { createBetaProgramService } from '../../../api/_lib/beta-program-service.js';

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
  const authorizeExperiment = createBetaProgramService().authorizeExperiment;
  const access = await authorizeExperiment(req, 'scanner');
  if (!access?.ok) return res.status(access?.status || 403).json({ error: access?.code || 'BETA_ACCESS_DENIED' });
  try { req.body = await bytes(req, 12_000_000); }
  catch (_) { return res.status(413).json({ error: 'IMAGE_SIZE_INVALID' }); }
  return createScannerBetaService({ authorizeExperiment: async () => access }).image(req, res);
}
