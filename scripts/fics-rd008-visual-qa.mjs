import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';

const baseUrl = process.env.FICS_QA_BASE_URL || 'http://localhost:8000/fics';
const outputDir = path.resolve('test-results/fics-rd008-visual');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const browserErrors = [];
const measurements = [];

function fixture() {
    const chess = new Chess();
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'];
    const history = moves.map((san, index) => {
        const move = chess.move(san);
        return { moveNumber: Math.floor(index / 2) + 1, color: index % 2 ? 'black' : 'white', san: move.san, fen: chess.fen() };
    });
    return { history, finalFen: chess.fen() };
}

async function open(viewport, mode = 'playing') {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => {
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
        localStorage.setItem('caissa_onboarding_completed', 'true');
    });
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CaissaFICSShell?.getSnapshot().mounted === true);
    const game = fixture();
    await page.evaluate(({ mode, game }) => {
        const client = window.CaissaFICSClient;
        const ended = mode === 'ended';
        const observing = mode === 'observing';
        Object.assign(client, {
            connected: true, authenticated: true, connectionState: 'connected', ficsUsername: 'Alexander',
            gameActive: !ended && !observing, isObserving: observing && !ended,
            myColor: observing ? null : 'white', currentFen: game.finalFen,
            pgnStartFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            moveHistory: game.history, pgnResult: ended ? '1-0' : '*',
            liveGame: { ...client.createEmptyLiveGameState(mode), gameNumber: '808',
                whiteName: 'Alexander', blackName: 'CaissaGuest', whiteRating: '1800', blackRating: '1760',
                whiteClock: 287, blackClock: 281, relation: observing ? 0 : 1,
                userColor: observing ? null : 'white', currentFen: game.finalFen,
                gameActive: !ended && !observing, observedGame: observing && !ended,
                status: ended ? 'ended' : mode,
                result: ended ? '1-0' : null,
                resultModel: ended ? { result: '1-0', winner: 'Alexander', loser: 'CaissaGuest',
                    terminationReason: 'CHECKMATE', terminal: true, summary: 'Alexander won by checkmate.' } : null }
        });
        client.updatePlayerBars?.();
        window.CaissaFICSShell.refresh();
    }, { mode, game });
    return { context, page };
}

async function capture(page, name, workspaceOnly = false) {
    await page.locator('#ficsSection').scrollIntoViewIfNeeded();
    await page.waitForTimeout(80);
    const result = await page.evaluate(() => {
        const section = document.getElementById('ficsSection');
        const board = section.querySelector('[data-fics-shell-region="board"]').getBoundingClientRect();
        const workspace = section.querySelector('[data-fics-shell-region="workspace"]').getBoundingClientRect();
        return { name: '', overflow: section.scrollWidth - section.clientWidth, boardWidth: Math.round(board.width), workspaceWidth: Math.round(workspace.width) };
    });
    result.name = name;
    measurements.push(result);
    if (workspaceOnly) {
        await page.locator('.fics-rd2-workspace').screenshot({ path: path.join(outputDir, `${name}.png`) });
    } else {
        await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false });
    }
}

const playing = await open({ width: 1600, height: 1000 });
await capture(playing.page, '01-desktop-playing');
await playing.page.locator('[data-fics-game-ply="4"]').click();
await capture(playing.page, '02-desktop-historical');
await playing.page.evaluate(() => {
    const client = window.CaissaFICSClient;
    const last = client.moveHistory.at(-1);
    client.moveHistory.push({ moveNumber: 6, color: 'white', san: 'Re1', fen: last.fen });
    window.CaissaFICSShell.refresh();
});
await capture(playing.page, '03-desktop-newer-live');
await playing.page.getByRole('button', { name: 'Return to live position' }).click();
await capture(playing.page, '04-desktop-live-final');
await playing.page.getByRole('tab', { name: 'Tables' }).click();
await capture(playing.page, '05-desktop-tables-game-available');
await playing.context.close();

const observing = await open({ width: 1600, height: 1000 }, 'observing');
await capture(observing.page, '06-desktop-observing');
await observing.context.close();

const ended = await open({ width: 1600, height: 1000 }, 'ended');
await capture(ended.page, '07-desktop-game-over-analyze');
await ended.context.close();

const mobile = await open({ width: 390, height: 844 }, 'playing');
await capture(mobile.page, '08-mobile-game', true);
await mobile.page.locator('[data-fics-game-ply="3"]').click();
await capture(mobile.page, '09-mobile-notation-tap', true);
await mobile.context.close();

const mobileEnded = await open({ width: 390, height: 844 }, 'ended');
await capture(mobileEnded.page, '10-mobile-game-over-analyze', true);
await mobileEnded.context.close();

await browser.close();
const report = { baseUrl, captures: measurements.length, measurements, browserErrors };
fs.writeFileSync(path.join(outputDir, 'measurements.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (browserErrors.length || measurements.some(item => item.overflow > 1)) process.exitCode = 1;
