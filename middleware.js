import { createPrivateRunOperationalConfig } from './js/endgame-trainer/v2/private-run-operational-config.js';
import {
    PLAY_V2_BETA_ENTRY,
    PLAY_V2_BETA_STAGE_ENV,
    resolvePlayV2BetaEntry
} from './js/play/play-v2-beta-entry-gate.js';
import {
    PLAY_V2_PUBLIC_BETA_DOCUMENT,
    PLAY_V2_UNAVAILABLE_DOCUMENT
} from './api/_lib/play-v2-public-beta-document.js';

export const config = {
    matcher: [
        '/',
        '/api/endgame/private-run-availability',
        '/play',
        '/play/:path*',
        '/play/beta/:path*',
        '/api/play-beta/:path*',
        '/play-v2(.*)'
    ]
};

const directPlayV2Documents = Object.freeze(new Set([
    '/play-v2.html',
    '/play-v2-public-beta.html',
    '/play-v2-invite.html',
    '/play-v2-promotion-qa.html',
    '/play-v2-ipad-analyze-diagnostic.html'
]));

const playHeaders = Object.freeze({
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; script-src-elem 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' https://img.clerk.com data:; font-src 'self'; worker-src 'self'; connect-src 'self' https://api.chess.com https://lichess.org https://caissa-game-fetcher.elcriollito.workers.dev https://*.clerk.accounts.dev https://api.clerk.com https://clerk-telemetry.com; frame-src 'self' https://*.clerk.accounts.dev; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'Pragma': 'no-cache',
    'X-Robots-Tag': 'index, follow',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
});
const unavailableHeaders = Object.freeze({ ...playHeaders, 'X-Robots-Tag': 'noindex, nofollow, noarchive' });

const retiredBetaRedirects = Object.freeze(new Map([
    ['/play/beta', '/play'],
    ['/play/beta/games', '/play/games'],
    ['/play/beta/bots', '/play/bots'],
    ['/play/beta/coach', '/play/coach']
]));

function resolveVercelPlayEnvironment(environment) {
    if (environment.VERCEL_ENV !== 'preview' || environment[PLAY_V2_BETA_STAGE_ENV] !== undefined) {
        return environment;
    }
    return { [PLAY_V2_BETA_STAGE_ENV]: PLAY_V2_BETA_ENTRY.currentStage };
}

export default function middleware(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
        if (url.searchParams.get('section') === 'yahooClassic') {
            return Response.redirect(new URL('/yahoo-classic', url), 308);
        }
        return Response.redirect(new URL('/play', url), 308);
    }
    let decodedPath = url.pathname;
    try { decodedPath = decodeURIComponent(decodedPath); } catch (_) { /* malformed paths remain fail-closed */ }
    const normalizedPath = decodedPath.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const directDocument = [...directPlayV2Documents].some(path =>
        normalizedPath === path || normalizedPath.startsWith(`${path}/`)
    );
    if (directDocument) {
        return new Response(PLAY_V2_UNAVAILABLE_DOCUMENT, { status: 404, headers: unavailableHeaders });
    }
    if (url.pathname === '/api/play-beta' || url.pathname.startsWith('/api/play-beta/')) {
        return Response.json({ error: 'PLAY_BETA_ENDPOINT_UNAVAILABLE' }, {
            status: 404,
            headers: { 'Cache-Control': 'private, no-store, max-age=0', 'Referrer-Policy': 'no-referrer' }
        });
    }
    if (url.pathname === '/play/beta' || url.pathname.startsWith('/play/beta/')) {
        const destination = retiredBetaRedirects.get(url.pathname);
        if (request.method === 'GET' && destination) return Response.redirect(new URL(destination, url), 308);
        return new Response(PLAY_V2_UNAVAILABLE_DOCUMENT, { status: 404, headers: unavailableHeaders });
    }
    if (url.pathname === '/play' || url.pathname.startsWith('/play/')) {
        const entry = resolvePlayV2BetaEntry(url.pathname, resolveVercelPlayEnvironment(process.env));
        const readOnlyRequest = request.method === 'GET' || request.method === 'HEAD';
        if (!readOnlyRequest || !entry.authorized) {
            return new Response(PLAY_V2_UNAVAILABLE_DOCUMENT, { status: 404, headers: unavailableHeaders });
        }
        const build = /^[a-f0-9]{7,40}$/i.test(process.env.VERCEL_GIT_COMMIT_SHA || '')
            ? process.env.VERCEL_GIT_COMMIT_SHA.toLowerCase() : 'unknown';
        const document = PLAY_V2_PUBLIC_BETA_DOCUMENT.replace(
            '</head>', `    <meta name="caissa-build" content="${build}">\n</head>`
        );
        return new Response(request.method === 'HEAD' ? null : document, { status: 200, headers: playHeaders });
    }
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
    return undefined;
}
