import { createScannerPublicService } from '../../_lib/scanner-public-service.js';

export const config = { api: { bodyParser: false } };
const MAX_IMAGE_BYTES = 12_000_000;
const IMAGE_READ_TIMEOUT_MS = 15_000;

function declaredBodyLength(req) {
  const raw = req.headers?.['content-length'];
  if (raw === undefined) return null;
  if (Array.isArray(raw) || !/^\d+$/.test(String(raw))) throw new Error('IMAGE_SIZE_INVALID');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('IMAGE_SIZE_INVALID');
  return value;
}

export async function readBytes(req, limit, timeoutMs = IMAGE_READ_TIMEOUT_MS) {
  const declared = declaredBodyLength(req);
  if (declared !== null && (declared === 0 || declared > limit)) throw new Error('IMAGE_SIZE_INVALID');
  const bytes = Buffer.allocUnsafe(declared ?? limit);
  let size = 0;
  let timeout;
  const bodyRead = (async () => {
    for await (const value of req) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (size + chunk.length > limit || size + chunk.length > bytes.length) throw new Error('IMAGE_SIZE_INVALID');
      chunk.copy(bytes, size);
      size += chunk.length;
    }
    if (!size || (declared !== null && size !== declared)) throw new Error('IMAGE_SIZE_INVALID');
    return bytes.subarray(0, size);
  })();
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      req.destroy?.();
      reject(new Error('IMAGE_READ_TIMEOUT'));
    }, timeoutMs);
  });
  try { return await Promise.race([bodyRead, deadline]); }
  finally { clearTimeout(timeout); }
}

export default async function handler(req, res) {
  const service = createScannerPublicService();
  const access = await service.authorizeImage(req, res);
  if (!access) return;
  try { req.body = await readBytes(req, MAX_IMAGE_BYTES); }
  catch (error) {
    if (error?.message === 'IMAGE_READ_TIMEOUT') return res.status(408).json({ error: 'IMAGE_READ_TIMEOUT' });
    return res.status(413).json({ error: 'IMAGE_SIZE_INVALID' });
  }
  return service.image(req, res, { access });
}
