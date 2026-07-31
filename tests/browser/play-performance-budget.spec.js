import { test, expect } from '@playwright/test';

const profiles=[{name:'desktop',viewport:{width:1440,height:900}},{name:'mobile',viewport:{width:390,height:844}}];
for(const profile of profiles)test(`${profile.name} performance profile preserves hard budgets`,async({page,browserName})=>{
    await page.setViewportSize(profile.viewport);
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
    const before=await page.evaluate(()=>window.CaissaPlayPerformanceProbe.getSnapshot());
    for(let i=0;i<25;i++)await page.evaluate(i=>window.CaissaPlayRouteController.navigate(`/play/${i%2?'games':'bots'}?simplified=1`),i);
    await page.evaluate(()=>window.CaissaPlayRouteController.navigate('/play/games?simplified=1'));
    await expect(page.locator('#playSection #chessboard .board-b72b1')).toBeVisible();
    const result=await page.evaluate(before=>{
        const after=window.CaissaPlayPerformanceProbe.getSnapshot();
        return {before,after,evaluation:window.CaissaPlayPerformanceBudget.evaluateAll({
            'board-count':after.boards,'listener-growth':after.listeners-before.listeners,
            'active-timers':after.timers,'active-observers':after.observers,'live-region-count':after.liveRegions
        })};
    },before);
    expect(result.after.boards).toBe(1);
    expect(result.after.liveRegions).toBe(2);
    expect(result.after.listeners).toBe(result.before.listeners);
    expect(result.evaluation.releaseBlocked,`${browserName}/${profile.name}`).toBe(false);
});

test('shell disposal returns owned resources to zero',async({page})=>{
    await page.goto('/play/games?simplified=1');
    await expect(page.locator('.caissa-simplified-shell')).toBeVisible();
    await page.evaluate(()=>window.CaissaPlayRouteController.navigate('/classic'));
    await expect(page.locator('.caissa-simplified-shell')).toBeHidden();
    const lifecycle=await page.evaluate(()=>window.CaissaEventLifecycle.inspect());
    expect(lifecycle.activeListeners).toBe(0);
    expect(lifecycle.activeTimers).toBe(0);
    expect(lifecycle.activeObservers).toBe(0);
});
