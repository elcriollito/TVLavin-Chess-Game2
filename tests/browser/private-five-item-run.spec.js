import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const route='/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item';
const titles=['Promote the Pawn','Stop the Pawn','Trade to Simplify','Hold the Draw','Activate the King'];
const routes=[
  ['e5f6','e4e5','e5e6','e6e7','e7e8'],
  ['d1c2','c2b1','b1a1','a1a2'],
  ['c4d5','d3c4','c4d4'],
  ['a2a3','a3a4','a4a5','a5a6'],
  ['c1b2','b2b3','b3c4']
];
const play=async(page,uci)=>{await page.locator(`.square-${uci.slice(0,2)}`).click();await page.locator(`.square-${uci.slice(2,4)}`).click();};
const complete=async(page,index)=>{for(const move of routes[index])await play(page,move);};
const start=async page=>{await page.goto(route);await page.getByRole('button',{name:'Start Run'}).click();};

test.beforeEach(async({page})=>{
  await page.route('**/api/endgame/private-run-availability',route=>route.fulfill({
    status:200,contentType:'application/json',
    headers:{'Cache-Control':'no-store'},
    body:JSON.stringify({
      schemaVersion:'1.0.0',featureId:'five-item-private-endgame-run',enabled:true,mode:'enabled',
      reasonCode:'operational',userMessage:'',effectivePolicy:'fail-closed-no-cache',
      configurationSource:'server-environment',failClosed:true,lastKnownSafeDefault:'disabled'
    })
  }));
  await page.addInitScript(()=>{
    window.__privateRunAudit={local:0,session:0,indexedDb:0,cookies:0,confirm:0};
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){if(this===localStorage)window.__privateRunAudit.local++;if(this===sessionStorage)window.__privateRunAudit.session++;return set.apply(this,args);};
    const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.__privateRunAudit.indexedDb++;return open(...args);};
    window.confirm=()=>{window.__privateRunAudit.confirm++;return false;};
    const cookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
    Object.defineProperty(document,'cookie',{configurable:true,get:()=>cookie.get.call(document),set:value=>{window.__privateRunAudit.cookies++;return cookie.set.call(document,value);}});
  });
});

test('human header, full happy path and ephemeral summary are exact',async({page})=>{
  const analytics=[];page.on('request',request=>{if(/clarity\.ms|analytics|telemetry/i.test(request.url()))analytics.push(request.url());});
  await page.goto(route);
  await expect(page.getByRole('heading',{name:'Private Endgame Run'})).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/objectiveArtifact|artifactId|fingerprint|SHA-256|privateEndgameRun/);
  await page.getByRole('button',{name:'Start Run'}).click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  for(let index=0;index<5;index++){
    await expect(page.locator('[data-v2-item-label]')).toHaveText(`Exercise ${index+1} of 5`);
    await expect(page.locator('[data-v2-objective]')).toHaveText(titles[index]);
    await expect(page.locator('[data-private-run-mission]')).not.toBeEmpty();
    await expect(page.locator('[data-private-run-turn]')).toMatchAriaSnapshot(`- paragraph: White to move.`);
    await complete(page,index);
    await expect(page.locator('[data-private-feedback-status]')).toHaveText('Exercise complete');
    await page.getByRole('button',{name:index===4?'View Run Summary':`Continue to Exercise ${index+2}`}).click();
  }
  await expect(page.locator('#v2-summary-title')).toBeFocused();
  await expect(page.locator('[data-private-run-summary-list] li')).toHaveText(titles.map(title=>`${title} — completed`));
  await expect(page.locator('[data-private-run-summary-note]')).toContainText('Independent completion: Yes');
  await expect(page.locator('[data-private-run-summary-note]')).toContainText('No progress was saved.');
  expect(await page.evaluate(()=>window.__privateRunAudit)).toEqual({local:0,session:0,indexedDb:0,cookies:0,confirm:0});
  expect(analytics).toEqual([]);expect(await page.evaluate(()=>typeof window.clarity)).toBe('undefined');expect(await page.context().cookies()).toEqual([]);
});

test('opponent reply is announced once in human notation and returns to the learner turn',async({page})=>{
  await start(page);await play(page,'e5f6');
  await expect(page.locator('[data-private-feedback-status]')).toHaveText('Good move');
  await expect(page.locator('[data-private-feedback-explanation]')).toHaveText('Black played Kb6. White to move. You are still following the lesson route.');
});

test('feedback categories retain exact artifact feedback and truthful hierarchy',async({page})=>{
  await start(page);await complete(page,0);await page.getByRole('button',{name:'Continue to Exercise 2'}).click();
  await complete(page,1);await page.getByRole('button',{name:'Continue to Exercise 3'}).click();
  await play(page,'e4d5');
  await expect(page.locator('[data-private-feedback-status]')).toHaveText('Result preserved');
  await expect(page.locator('[data-v2-feedback]')).toContainText('remains winning');
  await expect(page.locator('[data-private-feedback-panel]')).not.toContainText('incorrect');
  await complete(page,2);await page.getByRole('button',{name:'Continue to Exercise 4'}).click();
  await play(page,'e4e3');await expect(page.locator('[data-private-feedback-status]')).toHaveText(/Also winning|Result preserved|Still playable/);
  await complete(page,3);await page.getByRole('button',{name:'Continue to Exercise 5'}).click();
  await play(page,'c1c2');await expect(page.locator('[data-v2-feedback]')).toContainText('also keeps');
  await play(page,'c1b1');await expect(page.locator('[data-private-feedback-status]')).toHaveText(/Still playable|Result preserved/);
  await play(page,'d3d4');await expect(page.locator('[data-private-feedback-status]')).toHaveText('The result changed');
  await expect(page.getByRole('button',{name:'Try Again'}).first()).toBeVisible();
});

test('hints warn before Stage 3 and independence remains sticky until full restart',async({page})=>{
  await start(page);
  await page.getByRole('button',{name:'Get a Hint'}).click();
  await expect(page.getByRole('button',{name:'Hint 2 of 3'})).toBeVisible();
  await page.getByRole('button',{name:'Hint 2 of 3'}).click();
  await page.getByRole('button',{name:'Show Move'}).click();
  await expect(page.getByRole('dialog')).toContainText('This will remove independent-completion eligibility');
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Show Move'})).toBeFocused();
  await page.getByRole('button',{name:'Show Move'}).click();await page.getByRole('dialog').getByRole('button',{name:'Show Move'}).click();
  await expect(page.locator('[data-private-run-independence]')).toContainText('Not eligible');
  await page.getByRole('button',{name:'Restart Exercise'}).click();
  await expect(page.locator('[data-private-run-independence]')).toContainText('Not eligible');
  await page.getByRole('button',{name:'Restart Run'}).click();await page.getByRole('dialog').getByRole('button',{name:'Restart Run'}).click();
  await expect(page.locator('[data-private-run-independence]')).toContainText('Eligible');
});

test('restart and exit use accessible contextual confirmations and never window.confirm',async({page})=>{
  await start(page);await play(page,'e5f6');
  await page.getByRole('button',{name:'Restart Run'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Restart the full run?'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(()=>document.querySelector('[data-private-run-dialog]').contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button',{name:'Keep Playing'}).click();
  await expect(page.getByRole('button',{name:'Restart Run'})).toBeFocused();
  await page.getByRole('button',{name:'Exit Run'}).click();
  await expect(dialog).toContainText('private session is not saved');
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Exit Run'})).toBeFocused();
  expect(await page.evaluate(()=>window.__privateRunAudit.confirm)).toBe(0);
});

test('responsive, keyboard, reduced-motion and accessibility surfaces pass',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await start(page);
  for(const [width,height] of [[320,568],[360,800],[390,844],[412,915],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('[data-private-feedback-panel]')).toHaveAttribute('aria-live','polite');
  await expect(page.locator('[data-v2-feedback]')).not.toHaveAttribute('aria-live',/.+/);
  await expect(page.locator('[data-board]')).toHaveAttribute('aria-label',/arrow keys/);
  const results=await new AxeBuilder({page}).include('[data-endgame-v2-shell]').analyze();
  expect(results.violations.filter(item=>['critical','serious'].includes(item.impact))).toEqual([]);
});

test('mixed selectors fail neutral and refresh clears all progress',async({page})=>{
  await start(page);await play(page,'e5f6');await page.reload();
  await expect(page.getByRole('button',{name:'Start Run'})).toBeVisible();
  for(const search of [
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=unknown',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item&objectiveArtifact=x',
    '?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item&endgameRun=1'
  ]){
    await page.goto(`/endgame-trainer${search}`);
    await expect(page.getByRole('heading',{name:'We could not load the trainer'})).toBeVisible();
    await expect(page.locator('[data-trainer-load-error]')).toContainText('technical issue');
  }
});
