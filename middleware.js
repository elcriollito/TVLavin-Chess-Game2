import { createPrivateRunOperationalConfig } from './js/endgame-trainer/v2/private-run-operational-config.js';

export const config = {
    matcher: ['/', '/api/endgame/private-run-availability']
};

export default function middleware(request) {
    const url = new URL(request.url);
    if (url.pathname === '/api/endgame/private-run-availability') {
        if (request.method !== 'GET') {
            return Response.json({ error: 'Method not allowed' }, {
                status: 405,
                headers: { 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
            });
        }
        return Response.json(createPrivateRunOperationalConfig(process.env), {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, max-age=0',
                'Pragma': 'no-cache',
                'Referrer-Policy': 'no-referrer',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    }
    if (url.searchParams.get('action') === 'help') {
        return Response.redirect(new URL('/help', url), 308);
    }
    if (url.searchParams.get('section') !== 'yahooClassic') return;

    return Response.redirect(new URL('/yahoo-classic', url), 308);
}
