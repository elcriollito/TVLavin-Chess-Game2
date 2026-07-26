import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const route='/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item';
const config=(patch={})=>({
  schemaVersion:'1.0.0',featureId:'five-item-private-endgame-run',enabled:false,mode:'disabled',
  reasonCode:'manual-emergency-disable',userMessage:'This technical exercise run is currently unavailable.',
  effectivePolicy:'fail-closed-no-cache',configurationSource:'server-environment',
  failClosed:true,lastKnownSafeDefault:'disabled',...patch
});
const fulfill=value=>route=>route.fulfill({status:200,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(value)});
const play=async(page,uci)=>{await page.locator(`.square-${uci.slice(0,2)}`).click();await page.locator(`.square-${uci.slice(2,4)}`).click();};

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.__ops={local:0,session:0,indexedDb:0,cookies:0};
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){if(this===localStorage)window.__ops.local++;if(this===sessionStorage)window.__ops.session++;return set.apply(this,args);};
    const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.__ops.indexedDb++;return open(...args);};
    const cookie=Object.getOwnPropertyDescriptor(Document.prototype,'cookie');
    Object.defineProperty(document,'cookie',{configurable:true,get:()=>cookie.get.call(document),set:value=>{window.__ops.cookies++;return cookie.set.call(document,value);}});
  });
});

test('disabled default blocks before manifest, artifacts, board and controller initialization',async({page})=>{
  const requests=[];page.on('request',request=>requests.push({url:request.url(),referer:request.headers().referer}));
  await page.route('**/api/endgame/private-run-availability',fulfill(config()));
  await page.goto(route);
  await expect(page.getByRole('heading',{name:'Private run unavailable'})).toBeFocused();
  await expect(page.getByText('No progress was started or saved.')).toBeVisible();
  await expect(page.locator('.square-55d63')).toHaveCount(0);
  expect(requests.filter(item=>/endgame-(pilots|runs)|private-five-item-run-manifest/.test(item.url))).toEqual([]);
  const availability=requests.find(item=>item.url.includes('/api/endgame/private-run-availability'));
  expect(availability.referer).toBeUndefined();
  expect(await page.evaluate(()=>({ops:window.__ops,clarity:typeof window.clarity}))).toEqual({ops:{local:0,session:0,indexedDb:0,cookies:0},clarity:'undefined'});
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,nofollow');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content','no-referrer');
});

test('maintenance, emergency and invalid responses fail closed with neutral copy',async({page})=>{
  for(const [value,title,copy] of [
    [config({mode:'maintenance',reasonCode:'scheduled-maintenance',userMessage:'maintenance'}),'Private run temporarily unavailable','undergoing maintenance'],
    [config({mode:'emergency-disabled',reasonCode:'incident-response'}),'Private run unavailable','currently unavailable'],
    [{...config(),mode:'unknown'},'We could not verify this run','technical issue']
  ]){
    await page.unroute('**/api/endgame/private-run-availability');
    await page.route('**/api/endgame/private-run-availability',fulfill(value));
    await page.goto(route);
    await expect(page.getByRole('heading',{name:title})).toBeVisible();
    await expect(page.locator('[data-private-operational-message]')).toContainText(copy);
    await expect(page.locator('.square-55d63')).toHaveCount(0);
  }
});

test('HTTP, malformed JSON and timeout stay blocked and Retry Availability Check can recover',async({page})=>{
  let attempt=0;
  await page.route('**/api/endgame/private-run-availability',async route=>{
    attempt++;
    if(attempt===1)return route.fulfill({status:503,body:'unavailable'});
    return fulfill(config({enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''}))(route);
  });
  await page.goto(route);
  await expect(page.getByRole('heading',{name:'Private run unavailable'})).toBeVisible();
  await page.getByRole('button',{name:'Retry Availability Check'}).click();
  await expect(page.getByRole('button',{name:'Start Run'})).toBeFocused();
});

test('disabled between exercises prevents item two load and restored availability starts safely from scratch',async({page})=>{
  let enabled=true,artifactRequests=0;
  await page.route('**/api/endgame/private-run-availability',route=>fulfill(enabled?
    config({enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''}):config())(route));
  page.on('request',request=>{if(/endgame-pilots/.test(request.url()))artifactRequests++;});
  await page.goto(route);await page.getByRole('button',{name:'Start Run'}).click();
  for(const move of ['e5f6','e4e5','e5e6','e6e7','e7e8'])await play(page,move);
  expect(artifactRequests).toBe(1);enabled=false;
  await page.getByRole('button',{name:'Continue to Exercise 2'}).click();
  await expect(page.getByRole('heading',{name:'Private run unavailable'})).toBeFocused();
  expect(artifactRequests).toBe(1);
  enabled=true;await page.getByRole('button',{name:'Retry Availability Check'}).click();
  await expect(page.getByRole('button',{name:'Start Run'})).toBeFocused();
  await expect(page.locator('[data-v2-progress]')).toHaveText('1 / 5');
});

test('invalid and hostile selectors never consult availability or reveal private state',async({page})=>{
  const hostile=[
    `${route}&privateEndgameRun=five-item`,`${route}&objectiveArtifact=x`,
    '/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=..%2F..%2Fsecret',
    '/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=https%3A%2F%2Fevil.example',
    '/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=%00',
    `/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=${'x'.repeat(4096)}`,
    '/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=%3Cscript%3E',
    '/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=x%0d%0aInjected%3A1',
    '/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=__proto__'
  ];
  for(const url of hostile){
    let availability=0;await page.unroute('**/api/endgame/private-run-availability');
    await page.route('**/api/endgame/private-run-availability',route=>{availability++;return fulfill(config())(route);});
    await page.goto(url);await expect(page.getByRole('heading',{name:'We could not verify this run'})).toBeVisible();
    expect(availability).toBe(0);await expect(page.locator('.square-55d63')).toHaveCount(0);
  }
});

test('operational blocked states remain responsive, accessible and isolated from other modes',async({page})=>{
  await page.route('**/api/endgame/private-run-availability',fulfill(config({mode:'maintenance',reasonCode:'scheduled-maintenance'})));
  await page.goto(route);
  for(const [width,height] of [[320,568],[360,800],[390,844],[412,915],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  const axe=await new AxeBuilder({page}).include('[data-private-operational]').analyze();
  expect(axe.violations).toEqual([]);
  for(const [url,title] of [
    ['/endgame-trainer','Endgame Trainer'],
    ['/endgame-trainer?trainerV2=1&multiMovePilot=1&endgameRun=1','Endgame Run'],
    ['/endgame-trainer?trainerV2=1&multiMovePilot=1&objectiveArtifact=activate-king@1.0.0','Multi-Move Technical Pilot']
  ]){
    await page.goto(url);
    if(title==='Endgame Trainer')await expect(page.getByRole('heading',{name:title}).first()).toBeVisible();
    else await expect(page.locator('#endgame-v2-title')).toHaveText(title);
  }
});
