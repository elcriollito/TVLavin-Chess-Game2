/**
 * Vercel Serverless Function: POST /api/credits/add
 *
 * Disabled security boundary. Credit grants are fulfilled only by trusted
 * server-side events such as the signature-verified Stripe webhook.
 */

import { setCorsHeaders } from '../_lib/auth.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    return res.status(403).json({
        code: 'CREDIT_GRANTS_DISABLED',
        error: 'Credit grants are not available through this endpoint.'
    });
}
