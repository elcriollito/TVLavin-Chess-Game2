import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const origin = String(process.env.CAISSA_CAPTURE_ORIGIN || '').replace(/\/$/u, '');
const outputDirectory = String(process.env.CAISSA_CAPTURE_OUTPUT || 'docs/visual-evidence');
const prefix = String(process.env.CAISSA_CAPTURE_PREFIX || 'ux-hfx-002');
const useLiveConfig = process.env.CAISSA_CAPTURE_USE_LIVE_CONFIG === '1';
assert.match(origin, /^https?:\/\//u, 'CAISSA_CAPTURE_ORIGIN is required');
assert.match(prefix, /^[a-z0-9-]+$/u, 'A safe capture prefix is required');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
try {
    await page.route('**/js/caissa-auth.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `window.CAISSA_AUTH={isLoaded:true,isSignedIn:true,userId:'capture_owner',fullName:'Capture Owner',email:'capture@example.test',getToken:async()=> 'capture-token',whenReady:async()=>window.CAISSA_AUTH};`
    }));
    await page.route('**/api/online**', route => {
        const request = route.request();
        const url = new URL(request.url());
        if (request.method() === 'GET' && url.searchParams.get('action') === 'config') {
            if (useLiveConfig) return route.continue();
            return route.fulfill({ json: {
                protocolVersion: '1.0.0', rollout: 'preview', enabled: true,
                capabilities: {
                    matchmaking: true, rated: true, tournaments: true, arenaS001: true,
                    tournamentCreation: true, arena100: true, tournamentRated: true,
                    dailyTournaments: true, dailyRated: true, weeklyArenas: true
                }, realtime: null
            } });
        }
        return route.fulfill({ json: {
            protocolVersion: '1.0.0', eventType: 'presence.snapshot', serverTimestamp: new Date().toISOString(),
            data: { state: {
                profile: { display_name: 'Capture Owner' }, ticket: null, game: null,
                recentGames: [], players: [], challenges: [],
                permissions: { tournamentOrganizer: true },
                arena: { tournaments: [], current: null },
                daily: { tournaments: [], current: null, games: [], game: null, recentGames: [] }
            } }
        } });
    });
    await page.goto(`${origin}/online/tournaments?directory=1`, { waitUntil: 'domcontentloaded' });
    await page.locator('#directory-tab-create').click();
    await page.locator('#tournament-directory-dialog').screenshot({
        path: `${outputDirectory}/${prefix}-live.png`
    });
    await page.locator('#arena-create-type').selectOption('daily');
    await page.locator('#tournament-directory-dialog').screenshot({
        path: `${outputDirectory}/${prefix}-daily.png`
    });
    console.log(`CAPTURE_PASS ${prefix}`);
} finally {
    await browser.close();
}
