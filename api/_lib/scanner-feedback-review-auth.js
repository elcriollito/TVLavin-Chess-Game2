import { authenticateBrowserRequest } from './auth.js';
import { createBetaProgramStore } from './beta-program-store.js';
import { canReviewPublicFeedback } from '../../scanner/public/scanner-public-contract.js';

export function createScannerFeedbackReviewAuthorizer({ authenticate = authenticateBrowserRequest, store = null } = {}) {
  const users = () => store || createBetaProgramStore();
  return async function authorize(req) {
    try {
      const auth = await authenticate(req);
      if (!auth.authenticated) return auth;
      const user = await users().getUserByClerkId(auth.userId);
      if (!user || !canReviewPublicFeedback(user)) {
        return { ok: false, authenticated: true, status: 403, code: 'REVIEWER_ACCESS_DENIED' };
      }
      return { ok: true, authenticated: true, user };
    } catch (_) {
      return { ok: false, authenticated: false, status: 503, code: 'REVIEWER_ACCESS_UNAVAILABLE' };
    }
  };
}
