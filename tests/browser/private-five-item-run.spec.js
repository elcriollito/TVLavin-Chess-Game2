import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const route='/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item';
const play=async(page,uci)=>{await page.locator(`.square-${uci.slice(0,2)}`).click();await page.locator(`.square-${uci.slice(2,4)}`).click();};
const routes=[
  ['e5f6','e4e5','e5e6','e6e7','e7e8'],
  ['d1c2','c2b1','b1a1','a1a2'],
  ['c4d5','d3c4','c4d4'],
  ['a2a3','a3a4','a4a5','a5a6'],
  ['c1b2','b2b3','b3c4']
];
const complete=async(page,index)=>{for(const move of routes[index])await play(page,move);};

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.__privateRunAudit={local:0,session:0,indexedDb:0,account:0,analytics:0,telemetry:0,cookies:0};
    const local=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(this===window.localStorage)window.__privateRunAudit.local++;
      if(this===window.sessionStorage)window.__privateRunAudit.session++;
      return local.call(this,key,value);
    };
    const open=indexedDB.open.bind(indexedDB);
    indexedDB.open=function(...args){window.__privateRunAudit.indexedDb++;return open(...args);};
    const cookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
    Object.defineProperty(document,'cookie',{configurable:true,get:()=>cookie.get.call(document),set:value=>{window.__privateRunAudit.cookies++;return cookie.set.call(document,value);}});
  });
});

test('five-item happy path waits for Continue and renders the exact ephemeral summary',async({page})=>{
  const analytics=[];page.on('request',r=>{if(/clarity\.ms|analytics|telemetry/i.test(r.url()))analytics.push(r.url());});
  await page.goto(route);
  await expect(page.getByRole('heading',{name:'Private technical run'})).toBeVisible();
  await expect(page.locator('[data-v2-item-label]')).toContainText('Exercise 1 of 5');
  await page.getByRole('button',{name:'Start Run'}).click();
  const titles=['Promote','Stop Promotion','Convert Material Advantage','Hold Draw','Activate King'];
  for(let index=0;index<5;index++){
    await expect(page.locator('[data-v2-objective]')).toHaveText(titles[index]);
    await complete(page,index);
    await expect(page.locator('[data-v2-feedback]')).toContainText(index===4?'Exercise complete':'Exercise complete');
    await expect(page.locator('[data-v2-objective]')).toHaveText(titles[index]);
    await page.getByRole('button',{name:index===4?'Complete Run':`Continue to Exercise ${index+2}`}).click();
  }
  await expect(page.getByRole('heading',{name:'Run complete'})).toBeVisible();
  await expect(page.locator('[data-private-run-summary-list] li')).toHaveText(titles.map(title=>`${title} — completed`));
  await expect(page.locator('.endgame-v2__summary > p')).toContainText('Independent completion: yes');
  expect(await page.evaluate(()=>window.__privateRunAudit)).toEqual({local:0,session:0,indexedDb:0,account:0,analytics:0,telemetry:0,cookies:0});
  expect(analytics).toEqual([]);
  expect(await page.evaluate(()=>typeof window.clarity)).toBe('undefined');
  expect(await page.context().cookies()).toEqual([]);
});

test('objective miss, accepted alternative, concept miss and chess failure never advance',async({page})=>{
  await page.goto(route);await page.getByRole('button',{name:'Start Run'}).click();
  await complete(page,0);await page.getByRole('button',{name:'Continue to Exercise 2'}).click();
  await complete(page,1);await page.getByRole('button',{name:'Continue to Exercise 3'}).click();
  await play(page,'e4d5');await expect(page.locator('[data-v2-feedback]')).toContainText('remains winning');
  await expect(page.locator('[data-v2-progress]')).toHaveText('3 / 5');
  await complete(page,2);await page.getByRole('button',{name:'Continue to Exercise 4'}).click();
  await play(page,'e4e3');await expect(page.locator('[data-v2-feedback]')).toContainText('draw remains intact');
  await complete(page,3);await page.getByRole('button',{name:'Continue to Exercise 5'}).click();
  await play(page,'c1c2');await expect(page.locator('[data-v2-feedback]')).toContainText('also keeps');
  await play(page,'c1b1');await expect(page.locator('[data-v2-feedback]')).toContainText('still wins');
  await play(page,'d3d4');await expect(page.locator('[data-v2-feedback]')).toContainText('gives up');
  await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('[data-v2-progress]')).toHaveText('5 / 5');
});

test('Stage 3 is sticky, restart restores independence, and refresh clears the run',async({page})=>{
  await page.goto(route);await page.getByRole('button',{name:'Start Run'}).click();
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Hint'}).click();
  await play(page,'e5d5');await page.getByRole('button',{name:'Retry',exact:true}).click();
  for(let index=0;index<5;index++){await complete(page,index);await page.getByRole('button',{name:index===4?'Complete Run':`Continue to Exercise ${index+2}`}).click();}
  await expect(page.locator('.endgame-v2__summary > p')).toContainText('Independent completion: no');
  await page.reload();
  await expect(page.getByRole('button',{name:'Start Run'})).toBeVisible();
  await expect(page.locator('[data-v2-progress]')).toHaveText('1 / 5');
  await page.getByRole('button',{name:'Start Run'}).click();
  await page.getByRole('button',{name:'Restart Run'}).click();
  await expect(page.locator('[data-v2-progress]')).toHaveText('1 / 5');
});

test('three modes stay isolated and every mixed or malformed selector is neutral',async({page})=>{
  await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1&objectiveArtifact=activate-king@1.0.0');
  await expect(page.getByRole('heading',{name:'Multi-Move Technical Pilot'})).toBeVisible();
  await page.goto('/endgame-trainer?trainerV2=1&multiMovePilot=1&endgameRun=1');
  await expect(page.getByRole('heading',{name:'Endgame Run'})).toBeVisible();
  for(const search of [
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=unknown',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item&privateEndgameRun=five-item',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item&objectiveArtifact=activate-king@1.0.0',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item&endgameRun=1',
    '?trainerV2=1&multiMovePilot=1&objectiveArtifact=x&endgameRun=1'
  ]){
    await page.goto(`/endgame-trainer${search}`);
    await expect(page.locator('[data-v2-feedback]')).toContainText('not learner failure');
    await expect(page.getByRole('button',{name:'Start Run'})).toBeHidden();
  }
});

test('desktop/mobile geometry, keyboard surface, aria-live and Exit remain accessible',async({page})=>{
  await page.goto(route);await page.getByRole('button',{name:'Start Run'}).click();
  for(const width of [320,375,390,768,1024,1440,1920]){
    await page.setViewportSize({width,height:844});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('[data-v2-feedback]')).toHaveAttribute('aria-live','polite');
  expect((await new AxeBuilder({page}).include('[data-endgame-v2-shell]').analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Exit'}).click();
  await expect(page).toHaveURL(/trainerV2=1$/);
});
