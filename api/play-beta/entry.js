import { readFile } from 'node:fs/promises';
import { createPlayBetaService } from '../_lib/play-beta-service.js';
import { applyPrivateHeaders } from '../_lib/play-beta-policy.js';

const entryPath = new URL('../../play-v2.html', import.meta.url);
const unavailablePath = new URL('../../play-v2-unavailable.html', import.meta.url);
const read = path => readFile(path, 'utf8');

export default async function handler(req, res) {
    applyPrivateHeaders(res, 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if (req.method !== 'GET') return res.status(405).send(await read(unavailablePath));
    try {
        const mode = ['games', 'bots', 'coach'].includes(req.query?.mode) ? req.query.mode : null;
        const access = await createPlayBetaService().authorizeEntry(req, mode ? `/play/beta/${mode}` : '');
        if (!access.authorized) return res.status(404).send(await read(unavailablePath));
        let html = await read(entryPath);
        html = html.replace('data-caissa-play-v2-entry="qa-only"',
            `data-caissa-play-v2-entry="invite-only" data-caissa-beta-coach="${access.coach ? 'true' : 'false'}"`);
        return res.status(200).send(html);
    } catch (_) {
        return res.status(503).send(await read(unavailablePath));
    }
}
