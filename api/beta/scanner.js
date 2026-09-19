import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createBetaProgramService, betaPrivateHeaders, safeBetaReturnPath } from '../_lib/beta-program-service.js';
import { renderBetaDenied } from '../_lib/beta-center-document.js';

// Keep the protected document out of the public static tree. Vercel serves a
// physical index.html before applying rewrites, which would bypass this
// authorization handler for the exact /scanner/beta URL.
const scannerDocument = fileURLToPath(new URL('../_private/scanner-beta-index.html', import.meta.url));

export function createScannerBetaPageHandler({ service = createBetaProgramService(), loadDocument = () => readFile(scannerDocument, 'utf8') } = {}) {
  return async function handler(req, res) {
    betaPrivateHeaders(res);
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const access = await service.authorizeExperiment(req, 'scanner');
    if (!access.ok) {
      if (!access.authenticated && access.status === 401) {
        res.setHeader('Location', `/signin?redirect_url=${encodeURIComponent(safeBetaReturnPath(req, '/scanner/beta'))}`);
        return res.status(302).end();
      }
      return res.status(access.status || 403).send(renderBetaDenied());
    }
    service.audit({ userId: access.user.id, experimentId: 'scanner', eventType: 'experiment_opened' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(req.method === 'HEAD' ? '' : await loadDocument());
  };
}

export default createScannerBetaPageHandler();
