import { createClient } from '@supabase/supabase-js';
import { authenticateRequest, respondAuthFailure, setCorsHeaders } from '../../../_lib/auth.js';
import { MentorEconomicService, validOperationId } from '../../../_lib/mentor-economic-service.js';

const defaultDb = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

export function createMentorResultConfirmHandler(deps = {}) {
  const authenticate = deps.authenticate || authenticateRequest;
  const db = deps.db === undefined ? defaultDb : deps.db;
  const env = deps.env || process.env;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!setCorsHeaders(req, res, ['POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ code: 'INVALID_REQUEST', error: 'Request rejected.' });
    const auth = await authenticate(req);
    if (!auth.authenticated) return respondAuthFailure(res, auth);
    const operationId = req.query?.operationId;
    if (!validOperationId(operationId)) return res.status(400).json({ code: 'INVALID_REQUEST', error: 'Request rejected.' });
    const result = await new MentorEconomicService({ db, env }).confirm({ operationId, clerkId: auth.userId });
    return result.ok ? res.status(200).json({ code: 'DELIVERY_CONFIRMED' }) : res.status(404).json({ code: 'NOT_FOUND', error: 'Result unavailable.' });
  };
}
export default createMentorResultConfirmHandler();
