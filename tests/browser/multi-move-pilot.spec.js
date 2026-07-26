import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const play=async(page,uci)=>{await page.locator(`.square-${uci.slice(0,2)}`).click();await page.locator(`.square-${uci.slice(2,4)}`).click();};
test('hidden flag completes both approved branches with one board and no Worker',async({page})=>{await page.addInitScript(()=>{const W=window.Worker;window.__workers=0;window.Worker=class extends W{constructor(...a){window.__workers++;super(...a)}}});await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1');await expect(page.getByRole('heading',{name:'Multi-Move Technical Pilot'})).toBeVisible();await page.getByRole('button',{name:'Start Pilot'}).click();for(const move of ['e5f6','e4e5','e5e6','e6e7','e7e8'])await play(page,move);await expect(page.locator('[data-v2-feedback]')).toContainText('Promoted');await page.getByRole('button',{name:'Retry'}).click();for(const move of ['e5e6','e4e5','e6d5','e5e6','e6e7','e7e8'])await play(page,move);await expect(page.locator('[data-v2-feedback]')).toContainText('Promoted');expect(await page.locator('[data-board]').count()).toBe(1);expect(await page.evaluate(()=>window.__workers)).toBe(0);});
test('miss, failure, hint, retry, exit, Axe and responsive work',async({page})=>{await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1');await page.getByRole('button',{name:'Start Pilot'}).click();await play(page,'e5f5');await expect(page.locator('[data-v2-feedback]')).toContainText('may preserve');await play(page,'e5d5');await expect(page.locator('[data-v2-feedback]')).toContainText('gives up');await page.getByRole('button',{name:'Retry'}).click();await page.getByRole('button',{name:'Hint'}).click();for(const width of [320,375,390,768,1024,1440]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);}expect((await new AxeBuilder({page}).include('[data-endgame-v2-shell]').analyze()).violations).toEqual([]);await page.getByRole('button',{name:/Exit/}).click();await expect(page).toHaveURL(/trainerV2=1$/);});
test('Quick Challenge, V1 and Guided precedence remain unchanged',async({page})=>{await page.goto('/endgame-trainer?trainerV2=1');await expect(page.getByRole('button',{name:'Start Challenge'})).toBeVisible();await page.goto('/endgame-trainer');await expect(page.locator('[data-action="prepare"]')).toBeVisible();await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1&studyUnit=direct-opposition&release=rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84');await expect(page.locator('[data-library-study]')).toBeVisible();});
test('stop-promotion selector completes both reviewed capture routes',async({page})=>{
  await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1&pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0');
  await expect(page.locator('[data-v2-objective]')).toHaveText('Stop the a-pawn');
  await page.getByRole('button',{name:'Start Pilot'}).click();
  for(const move of ['d1c1','c1b1','b1a1','a1a2'])await play(page,move);
  await expect(page.locator('[data-v2-feedback]')).toContainText('Captured');
  await page.getByRole('button',{name:'Retry'}).click();
  for(const move of ['d1c2','c2b1','b1a1','a1a2'])await play(page,move);
  await expect(page.locator('[data-v2-feedback]')).toContainText('Captured');
});
test('stop-promotion distinguishes drawing mission miss, loss, hint and responsive layouts',async({page})=>{
  const url='/endgame-trainer?trainerV2=1&multiMovePilot=1&pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0';
  await page.goto(url);await page.getByRole('button',{name:'Start Pilot'}).click();await play(page,'d1d2');
  await expect(page.locator('[data-v2-feedback]')).toContainText('may still draw');
  await page.getByRole('button',{name:'Retry'}).click();await play(page,'d1e1');
  await expect(page.locator('[data-v2-feedback]')).toContainText('loses the theoretical draw');
  await page.getByRole('button',{name:'Retry'}).click();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Hint'}).click();
  await expect(page.locator('[data-v2-feedback]')).toContainText('Next move: Kc1 or Kc2');
  for(const width of [320,375,390,768,820,1024,1280,1440,1920]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);}
  expect((await new AxeBuilder({page}).include('[data-endgame-v2-shell]').analyze()).violations).toEqual([]);
});
test('private objective allowlist completes offline with zero Clarity requests or analytics storage',async({page})=>{
  const analyticsRequests=[];
  page.on('request',request=>{if(/clarity\.ms/i.test(request.url()))analyticsRequests.push(request.url());});
  await page.addInitScript(()=>{
    window.__analyticsWrites=[];
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(/clarity|analytics-consent/i.test(String(key)))window.__analyticsWrites.push(String(key));return original.call(this,key,value);};
  });
  const routes={
    'convert-material-advantage@1.0.0':['c4d5','d3c4','c4d4'],
    'hold-draw@1.0.0':['a2a3','a3a4','a4a5','a5a6'],
    'activate-king@1.0.0':['c1b2','b2b3','b3c4']
  };
  for(const [id,moves] of Object.entries(routes)){
    await page.goto(`/endgame-trainer?trainerV2=1&multiMovePilot=1&objectiveArtifact=${id}`);
    await page.getByRole('button',{name:'Start Pilot'}).click();
    for(const move of moves)await play(page,move);
    await expect(page.locator('[data-v2-feedback]')).toHaveAttribute('data-tone','success');
    expect(await page.evaluate(()=>window.__analyticsWrites)).toEqual([]);
    expect(await page.context().cookies()).toEqual([]);
  }
  expect(analyticsRequests).toEqual([]);
  for(const suffix of ['unknown@1.0.0','','activate-king@1.0.0&objectiveArtifact=hold-draw@1.0.0']){
    await page.goto(`/endgame-trainer?trainerV2=1&multiMovePilot=1&objectiveArtifact=${suffix}`);
    await page.getByRole('button',{name:'Start Pilot'}).click();
    await expect(page.locator('[data-v2-feedback]')).toContainText('technically unavailable');
  }
  expect(analyticsRequests).toEqual([]);
});
