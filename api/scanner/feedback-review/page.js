import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createScannerFeedbackReviewAuthorizer } from '../../_lib/scanner-feedback-review-auth.js';
import { betaPrivateHeaders } from '../../_lib/beta-program-service.js';

const documentPath = fileURLToPath(new URL('../../_private/scanner-feedback-review-index.html', import.meta.url));

export function createScannerFeedbackReviewPageHandler({
  authorize = createScannerFeedbackReviewAuthorizer(),
  loadDocument = () => readFile(documentPath, 'utf8')
} = {}) {
  return async function handler(req, res) {
    betaPrivateHeaders(res);
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const access = await authorize(req);
    if (!access.ok) {
      if (!access.authenticated && access.status === 401) {
        res.setHeader('Location', '/signin?redirect_url=%2Fscanner%2Ffeedback-review');
        return res.status(302).end();
      }
      return res.status(access.status || 403).send('<!doctype html><title>Access denied</title><h1>Access denied</h1>');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(req.method === 'HEAD' ? '' : await loadDocument());
  };
}

export default createScannerFeedbackReviewPageHandler();
