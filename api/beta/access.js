import { authenticateRequest, respondAuthFailure, setCorsHeaders } from '../_lib/auth.js';
import { createBetaProgramService } from '../_lib/beta-program-service.js';

export function createBetaAccessHandler({ service = createBetaProgramService({ authenticate: authenticateRequest }) } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    if (!setCorsHeaders(req, res, ['GET'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed.' });
    const access = await service.listForRequest(req);
    if (!access.ok) {
      if (!access.authenticated && [401, 503].includes(access.status)) return respondAuthFailure(res, access);
      return res.status(access.status || 403).json({ authorized: false });
    }
    return res.status(200).json({ authorized: true, activeExperimentCount: access.experiments.length });
  };
}

export default createBetaAccessHandler();
