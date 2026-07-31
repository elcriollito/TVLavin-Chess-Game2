import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';
import { PLAY_INTEGRATION_SCENARIOS } from './fixtures/play-integration-scenarios.js';

test.beforeEach(async({page})=>instrumentPlay(page));

test('Games route configures one authoritative lifecycle with bounded resources',async({page})=>{
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-games-panel')).toBeVisible();
    await page.locator('[data-games-time="blitz-5"]').check();
    await page.locator('[data-games-color="black"]').check();
    await page.locator('[data-games-primary]').click();
    const proof=await page.evaluate(()=>({
        gameMode:App.gameMode,color:App.playerColor,time:App.timeControl,
        lifecycle:CaissaGameLifecycle.getSnapshot(),clock:CaissaClockService.getSnapshot(),
        boards:document.querySelectorAll('#playSection #chessboard .board-b72b1').length,
        workers:__caissaPlayHarness.snapshot().workersCreated,
        events:CaissaEventLifecycle.inspect()
    }));
    expect(proof).toMatchObject({gameMode:'engine',color:'black',time:300,boards:1,workers:1});
    expect(proof.lifecycle.state).toBe('active');
    expect(proof.clock.initialTimeMs).toBe(300000);
    expect(proof.events.activeTimers).toBe(0);
    expect(PLAY_INTEGRATION_SCENARIOS[0].scenarioId).toBe('games-start');
});

test('Players readiness preserves an active machine game and freezes human evaluation',async({page})=>{
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    const before=await page.evaluate(()=>({fen:App.game.fen(),board:App.boardAdapter.getSnapshot().adapterId,worker:__caissaPlayHarness.snapshot().workersCreated}));
    await page.evaluate(()=>CaissaPlayRouteController.navigate('/play/players?simplified=1'));
    await expect(page.locator('[data-players-panel]')).toBeVisible();
    const proof=await page.evaluate(before=>{
        const context=CaissaHumanFairPlay.createContext({
            provider:'fics',gameType:'human-rated',ratingMode:'rated',assistanceMode:'prohibited',playerRole:'player',
            authority:{server:'provider',clock:'provider',move:'provider',result:'provider',reconnect:'provider'},
            enginePolicy:'deny-request',evaluationPolicy:'frozen',postGamePolicy:'provider-terminal-required',sourceConfidence:'provider-confirmed'
        });
        const readiness=CaissaHumanGameReadiness.evaluate(context);
        CaissaEvaluationRailInstance.applyHumanPolicy(readiness);
        return {
            before,after:{fen:App.game.fen(),board:App.boardAdapter.getSnapshot().adapterId,worker:__caissaPlayHarness.snapshot().workersCreated},
            readiness,rail:CaissaEvaluationRailInstance.getSnapshot(),
            caissaRows:document.querySelectorAll('[data-player-id],[data-player-row]').length
        };
    },before);
    expect(proof.after).toEqual(before);
    expect(proof.caissaRows).toBe(0);
    expect(proof.rail.displayMode).not.toBe('numeric');
});

test('navigation, theme, accessibility, and shell ownership survive Back and Forward',async({page})=>{
    await page.goto('/play/games?simplified=1');
    const before=await page.evaluate(()=>({board:App.boardAdapter.getSnapshot().adapterId,listeners:CaissaEventLifecycle.inspect().activeListeners}));
    await page.evaluate(()=>CaissaPlayThemes.applyTheme('caissa-light'));
    await page.evaluate(()=>CaissaPlayRouteController.navigate('/classic'));
    await page.goBack();
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    const after=await page.evaluate(()=>({
        board:App.boardAdapter.getSnapshot().adapterId,
        listeners:CaissaEventLifecycle.inspect().activeListeners,
        liveRegions:document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
        theme:document.body.dataset.caissaPlayTheme,
        boards:document.querySelectorAll('#playSection #chessboard .board-b72b1').length
    }));
    expect(after).toMatchObject({board:before.board,listeners:before.listeners,liveRegions:2,theme:'caissa-light',boards:1});
});
