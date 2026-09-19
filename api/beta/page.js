import { createBetaProgramService, betaPrivateHeaders, safeBetaReturnPath } from '../_lib/beta-program-service.js';
import { renderBetaCenter, renderBetaDenied } from '../_lib/beta-center-document.js';

export function createBetaCenterHandler({ service = createBetaProgramService() } = {}) {
  return async function handler(req, res) {
    betaPrivateHeaders(res);
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
    const access = await service.listForRequest(req);
    if (!access.ok) {
      if (!access.authenticated && access.status === 401) {
        const target = encodeURIComponent(safeBetaReturnPath(req));
        res.setHeader('Location', `/signin?redirect_url=${target}`);
        return res.status(302).end();
      }
      return res.status(access.status || 403).send(renderBetaDenied());
    }
    service.audit({ userId: access.user.id, eventType: 'beta_center_viewed' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(req.method === 'HEAD' ? '' : renderBetaCenter(access.experiments, access.activitySummaries));
  };
}

export default createBetaCenterHandler();
