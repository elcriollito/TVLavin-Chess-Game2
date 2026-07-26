import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const config=(release='unreleased',patch={})=>({
  schemaVersion:'1.0.0',featureId:'five-item-private-endgame-run',enabled:false,mode:'disabled',
  reasonCode:'manual-emergency-disable',userMessage:'This technical exercise run is currently unavailable.',
  effectivePolicy:'fail-closed-no-cache',configurationSource:'server-environment',failClosed:true,
  lastKnownSafeDefault:'disabled',previewBoundary:{mode:release,configurationValid:true,
    source:'server-environment',safeDefault:'unreleased'},...patch
});
const fulfill=value=>route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});

test('production-default shell is closed, responsive, accessible and loads no runtime',async({page})=>{
  const requests=[];page.on('request',request=>requests.push(request.url()));
  await page.route('**/api/endgame/private-run-availability',fulfill(config()));
  await page.goto('/endgame-practice');
  await expect(page.getByRole('heading',{level:1,name:'CAISSA Endgame Practice'})).toBeVisible();
  await expect(page.getByText('Limited Preview').first()).toBeVisible();
  await expect(page.getByRole('link',{name:'Start Limited Preview'})).toBeHidden();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index, follow');
  expect(requests.filter(url=>/private-five-item-run-manifest|endgame-pilots|chessboard/.test(url))).toEqual([]);
  for(const [width,height] of [[320,568],[360,800],[390,844],[412,915],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]]){
    await page.setViewportSize({width,height});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  const axe=await new AxeBuilder({page}).analyze();
  expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact))).toEqual([]);
});

test('state matrix never lets runtime enabled bypass release',async({page})=>{
  for(const [value,title,start] of [
    [config('unreleased',{enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''}),'Limited Preview',false],
    [config('paused',{enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''}),'Preview paused',false],
    [config('internal-preview'),'Temporarily unavailable',false],
    [config('internal-preview',{enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''}),'Limited Preview',true],
    [config('limited-preview',{enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''}),'Limited Preview',true],
    [{...config(),previewBoundary:{...config().previewBoundary,configurationValid:false}},'We could not verify this preview',false]
  ]){
    await page.unroute('**/api/endgame/private-run-availability');
    await page.route('**/api/endgame/private-run-availability',fulfill(value));
    await page.goto('/endgame-practice');
    await expect(page.locator('[data-status-title]')).toHaveText(title);
    if(start)await expect(page.locator('[data-start]')).toBeVisible();
    else await expect(page.locator('[data-start]')).toBeHidden();
  }
});

test('authorized start performs full-page privacy transition and Exit returns to shell',async({page})=>{
  const calls=[];let activeRuntime=false;
  page.on('request',request=>{if(activeRuntime)calls.push(request.url());});
  await page.route('**/api/endgame/private-run-availability',fulfill(config('internal-preview',{
    enabled:true,mode:'enabled',reasonCode:'operational',userMessage:''
  })));
  await page.goto('/endgame-practice');
  activeRuntime=true;
  await page.getByRole('link',{name:'Start Limited Preview'}).click();
  await expect(page).toHaveURL(/previewEntry=endgame-practice/);
  await expect(page.getByRole('button',{name:'Start Run'})).toBeFocused();
  expect(await page.evaluate(()=>typeof window.clarity)).toBe('undefined');
  expect(calls.filter(url=>/clarity\.ms/i.test(url))).toEqual([]);
  await page.getByRole('button',{name:'Exit Run'}).click();
  await expect(page).toHaveURL(/\/endgame-practice$/);
  await expect(page.getByRole('heading',{level:1,name:'CAISSA Endgame Practice'})).toBeVisible();
});
