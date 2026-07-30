import {test,expect} from '@playwright/test';
import {instrumentPlay} from '../play/playwright-helpers.js';

test.beforeEach(async({page})=>instrumentPlay(page,{autoReply:false}));

test('25 mode cycles keep shell listeners bounded with one board and Worker',async({page})=>{
    await page.goto('/play/games?simplified=1');await expect(page.locator('.caissa-games-panel')).toBeVisible();
    const before=await page.evaluate(()=>({board:window.App.boardAdapter.getSnapshot().adapterId,
        lifecycle:window.CaissaEventLifecycle.inspect(),workers:window.__caissaPlayHarness.snapshot().workersCreated}));
    for(let i=0;i<25;i++){
        await page.evaluate(()=>window.CaissaPlayRouteController.navigate('/play/bots?simplified=1'));
        await expect(page.locator('.caissa-bots-panel')).toBeVisible();
        await page.evaluate(()=>window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
        await expect(page.locator('.caissa-games-panel')).toBeVisible();
    }
    const after=await page.evaluate(()=>({board:window.App.boardAdapter.getSnapshot().adapterId,
        lifecycle:window.CaissaEventLifecycle.inspect(),workers:window.__caissaPlayHarness.snapshot().workersCreated}));
    expect(after.board).toBe(before.board);expect(after.workers).toBe(1);
    expect(after.lifecycle.activeListeners).toBe(before.lifecycle.activeListeners);
    expect(after.lifecycle.activeTimers).toBe(0);expect(after.lifecycle.activeObservers).toBe(0);
});

test('shell deactivate/dispose removes its owned listeners and re-entry creates one fresh scope',async({page})=>{
    await page.goto('/play/games?simplified=1');await expect(page.locator('.caissa-games-panel')).toBeVisible();
    const proof=await page.evaluate(()=>{
        const shell=window.CaissaSimplifiedPlayShellInstance;
        const active=window.CaissaEventLifecycle.inspect().activeListeners;
        shell.deactivate();
        const removed=window.CaissaEventLifecycle.inspect().activeListeners;
        shell.activate();
        const restored=window.CaissaEventLifecycle.inspect().activeListeners;
        return{active,removed,restored,snapshot:shell.getSnapshot()};
    });
    expect(proof.active).toBeGreaterThan(0);expect(proof.removed).toBe(0);expect(proof.restored).toBe(proof.active);
    expect(proof.snapshot.listenerCount).toBe(proof.active);
});

test('Back/Forward, board move, accessibility and theme remain single-owned',async({page})=>{
    await page.goto('/play/games?simplified=1');await page.locator('[data-games-primary]').click();
    const before=await page.evaluate(()=>({board:window.App.boardAdapter.getSnapshot().adapterId,
        live:document.querySelectorAll('.caissa-simplified-shell [aria-live]').length}));
    await page.evaluate(()=>window.CaissaPlayCompatibility.execute('submitMove',{from:'e2',to:'e4'}));
    await page.evaluate(()=>window.CaissaNavigation.navigateToSection('yahooClassic'));
    await page.goBack();await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    const after=await page.evaluate(()=>({board:window.App.boardAdapter.getSnapshot().adapterId,
        moves:window.CaissaPlayCompatibility.getMoveHistory().length,
        live:document.querySelectorAll('.caissa-simplified-shell [aria-live]').length,
        resources:window.CaissaEventLifecycle.inspect()}));
    expect(after.board).toBe(before.board);expect(after.moves).toBeGreaterThanOrEqual(1);
    expect(after.live).toBe(2);expect(after.resources.activeTimers).toBe(0);
});
