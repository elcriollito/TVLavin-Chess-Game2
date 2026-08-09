import { test, expect } from '@playwright/test';

for (const viewport of [{width:390,height:844},{width:1366,height:768}]) {
  test(`invite landing consumes fragment without persistence ${viewport.width}x${viewport.height}`, async ({page}) => {
    await page.setViewportSize(viewport);
    let body='';
    await page.route('**/api/play-beta/redeem', async route => { body=route.request().postData()||''; await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"redirect":"/play/beta"}'}); });
    await page.route('**/play/beta', route => route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Authorized</title><h1>Play</h1>'}));
    await page.goto(`/play/beta/invite#${'D'.repeat(43)}`);
    await expect(page).toHaveURL(/\/play\/beta$/); expect(JSON.parse(body).token).toBe('D'.repeat(43));
    expect(page.url()).not.toContain('#');
    const stored=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},history:history.state}));
    expect(JSON.stringify(stored)).not.toContain('D'.repeat(43));
  });
}

test('missing invitation stays on accessible fail-closed landing', async ({page}) => {
  await page.goto('/play/beta/invite');
  await expect(page.getByRole('status')).toContainText('missing or invalid');
  await expect(page.getByRole('link',{name:'Return to CAISSA Classic'})).toBeVisible();
});

test('normal Play and direct internal HTML stay outside invite authorization', async ({request}) => {
  expect((await request.get('/play')).status()).toBe(200);
  const direct=await request.get('/play-v2.html'); expect(await direct.text()).toContain('Play Beta Unavailable');
});

test('authorized invite feedback is explicit, bounded and same-origin', async ({page}) => {
  let submitted=null;
  await page.route('**/api/play-beta/session', route=>route.fulfill({status:200,contentType:'application/json',body:`{"authorized":true,"coach":false,"csrf":"${'C'.repeat(43)}"}`}));
  await page.route('**/api/play-beta/feedback', async route=>{submitted=JSON.parse(route.request().postData());expect(route.request().headers()['x-caissa-beta-csrf']).toBe('C'.repeat(43));await route.fulfill({status:201,contentType:'application/json',body:'{"ok":true,"reference":"ABC123"}'});});
  await page.goto('/play/beta/invite');
  await page.evaluate(()=>{document.documentElement.innerHTML='<head></head><body data-caissa-play-v2-entry="invite-only"></body>';history.replaceState(null,'','/play/beta/games');});
  await page.addScriptTag({url:'/js/play/play-v2-invite-client.js?v=1.0.0'});
  await page.getByRole('button',{name:'Send Beta Feedback'}).click();
  await page.getByLabel('Comment').fill('The setup label is unclear.');
  await page.getByLabel('I consent to sending this feedback for private beta review.').check();
  await page.getByRole('button',{name:'Send feedback'}).click();
  await expect(page.getByRole('status')).toContainText('ABC123');
  expect(submitted).toMatchObject({category:'Bug',mode:'games',comment:'The setup label is unclear.',consent:true});
});

test('status kill switch disposes the shell before fail-closed navigation', async ({page}) => {
  let disposals=0; await page.exposeFunction('recordDispose',()=>{disposals++});
  await page.route('**/api/play-beta/session', route=>route.fulfill({status:200,contentType:'application/json',body:`{"authorized":true,"csrf":"${'C'.repeat(43)}"}`}));
  await page.route('**/api/play-beta/status', route=>route.fulfill({status:401,contentType:'application/json',body:'{"enabled":false}'}));
  await page.goto('/play/beta/invite');
  await page.evaluate(()=>{document.documentElement.innerHTML='<head></head><body data-caissa-play-v2-entry="invite-only"></body>';window.__heartbeat=null;window.setInterval=fn=>{window.__heartbeat=fn;return 1};window.CaissaSimplifiedPlayShellInstance={dispose(){window.recordDispose()}};history.replaceState(null,'','/play/beta');});
  await page.addScriptTag({url:'/js/play/play-v2-invite-client.js?v=1.0.0'});
  await expect.poll(()=>page.evaluate(()=>typeof window.__heartbeat)).toBe('function');
  await page.evaluate(()=>window.__heartbeat());
  await expect.poll(()=>disposals).toBe(1);
});

test('status transport failure also fails closed and disposes once', async ({page}) => {
  let disposals=0, teardown=null; await page.exposeFunction('recordTransportDispose',value=>{disposals++;teardown=value});
  await page.route('**/api/play-beta/session', route=>route.fulfill({status:200,contentType:'application/json',body:`{"authorized":true,"csrf":"${'C'.repeat(43)}"}`}));
  await page.route('**/api/play-beta/status', route=>route.abort('failed'));
  await page.goto('/play/beta/invite');
  await page.evaluate(()=>{document.documentElement.innerHTML='<head></head><body data-caissa-play-v2-entry="invite-only"></body>';window.__heartbeat=null;window.__teardown={clock:0,worker:0,lifecycle:0,board:0};window.setInterval=fn=>{window.__heartbeat=fn;return 1};window.CaissaClockService={stop(){},dispose(){window.__teardown.clock++}};window.CaissaEngineRequestIsolation={cancelSession(){},dispose(){}};window.CaissaPlayV2BotWorkerReadiness={teardown(){window.__teardown.worker++}};window.CaissaGameLifecycle={dispose(){window.__teardown.lifecycle++}};window.App={boardAdapter:{dispose(){window.__teardown.board++}}};window.CaissaSimplifiedPlayShellInstance={dispose(){window.recordTransportDispose({...window.__teardown})}};history.replaceState(null,'','/play/beta');});
  await page.addScriptTag({url:'/js/play/play-v2-invite-client.js?v=1.0.0'});
  await expect.poll(()=>page.evaluate(()=>typeof window.__heartbeat)).toBe('function');
  await page.evaluate(()=>window.__heartbeat());
  await expect.poll(()=>disposals).toBe(1);
  expect(teardown).toEqual({clock:1,worker:1,lifecycle:1,board:1});
});
