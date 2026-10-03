import { insightsConfiguration } from '../_lib/insights-config.js';
// Public configuration flags only; never return keys, URLs or user data.
export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' });
    return res.status(200).json(insightsConfiguration());
}
