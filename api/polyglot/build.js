import { setCorsHeaders } from '../_lib/auth.js';

// Normal conversion is intentionally browser-only. Keeping this route as an
// explicit tombstone prevents older clients from silently uploading private
// PGN files or consuming anonymous serverless compute.
export default async function handler(req, res) {
    if (!setCorsHeaders(req, res, ['POST'])) return;
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', '</tools/polyglot>; rel="alternate"');
    return res.status(410).json({
        error: 'The server-side Polyglot builder is retired. Use the private on-device converter at /tools/polyglot.'
    });
}
