import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

test('direct public beta needs no invite, session, account, cookie, or Supabase', async ({ page }) => {
  const requests=[]; page.on('request',request=>requests.push(request.url())); await page.goto('/play/beta',{waitUntil:'networkidle'});
  await expect(page.locator('body[data-caissa-play-v2-entry="public-beta"]')).toHaveCount(1);
  await expect(page.getByText('Public Beta',{exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'Report an issue'})).toBeVisible();
  expect(requests.some(url=>/supabase|\/api\/play-beta\/(?:redeem|session|status|logout|feedback)/i.test(url))).toBe(false);
  expect((await page.context().cookies()).some(cookie=>cookie.name==='__Host-caissa_play_beta')).toBe(false);
});

test('Games Bots Coach work while Players invite QA and direct HTML fail closed', async ({ page }) => {
  for(const [path,tab] of [['/play/beta','Play Game'],['/play/beta/games','Play Game'],['/play/beta/bots','Play Bots'],['/play/beta/coach','Play Coach']]){await page.goto(path);await expect(page.getByRole('tab',{name:tab})).toHaveAttribute('aria-selected','true');await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);}
  const closed=['/play/beta/players','/play/beta/invite','/play/beta/qa/promotion','/play/beta/qa/ipad-analyze-diagnostic','/play/beta/qa/bug-diary'];
  const documents=['/play-v2.html','/play-v2-public-beta.html','/play-v2-invite.html','/play-v2-promotion-qa.html','/play-v2-ipad-analyze-diagnostic.html'];
  for(const document of documents)closed.push(document,`${document}?token=fabricated#authorize`,`${document}/descendant`,document.replace('.html','%2Ehtml'));
  for(const path of closed){const response=await page.goto(path);expect([200,404],path).toContain(response.status());if(response.status()===200)await expect(page).toHaveTitle(/Play Beta Unavailable/);await expect(page.locator('script')).toHaveCount(0);await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);}
});

test('real public document starts exactly one Games session and accepts one legal move', async ({ page }) => {
  await page.goto('/play/beta'); const play=page.getByRole('button',{name:'Play',exact:true}); await expect(play).toBeEnabled(); await play.click();
  await expect(page.locator('body')).toHaveClass(/caissa-play-game-active/); await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
  await playMove(page,'e2','e4'); await expect.poll(()=>page.evaluate(()=>window.App?.game?.history?.().length)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(()=>window.CaissaSimplifiedPlayShellInstance.inspect().gamesPanel.diagnostics.successfulStarts)).toBe(1);
});

test('manual report is local and both Discord destinations require explicit clicks', async ({ page, context }) => {
  await context.route('https://discord.gg/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Discord handoff</title>'}));
  await context.route('https://discord.com/channels/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Discord channel</title>'}));
  const external=[]; page.on('request',request=>{if(new URL(request.url()).origin!=='http://127.0.0.1:8000')external.push(request.url());}); await page.goto('/play/beta');
  await page.getByRole('button',{name:'Report an issue'}).click(); await page.getByLabel('What happened?').fill('The board shifted after rotation.'); await page.getByLabel('What did you expect?').fill('The board should remain stable.'); await page.getByRole('button',{name:'Preview report'}).click();
  expect(external).toEqual([]); const json=await page.locator('.caissa-manual-qa__preview').textContent(); expect(JSON.parse(json).contract).toBe('PlayV2ManualQaReport@1.0.0');
  for(const [name,url] of [[/Join feedback Discord/,'https://discord.gg/g5vTsSrDA'],[/Open #play-v2-feedback/,'https://discord.com/channels/1535886419279482922/1535886421775097938']]){const popupPromise=context.waitForEvent('page');await page.getByRole('link',{name}).click();const popup=await popupPromise;expect(popup.url()).toBe(url);await popup.close();}
});

test('manual report accepts innocuous input, maps errors honestly, and Clear resets every state',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedReport=value;}}}));
  await page.goto('/play/beta');await page.getByRole('button',{name:'Report an issue'}).click();const happened=page.getByLabel('What happened?'),expected=page.getByLabel('What did you expect?'),preview=page.getByRole('button',{name:'Preview report'}),clear=page.getByRole('button',{name:'Clear',exact:true}),status=page.locator('.caissa-manual-qa [role=status]'),copy=page.getByRole('button',{name:'Copy JSON'}),download=page.getByRole('button',{name:'Download JSON'});
  await happened.fill('draft');await clear.click();await expect(happened).toHaveValue('');await expect(copy).toBeDisabled();await expect(download).toBeDisabled();
  await happened.fill('it does not play');await preview.click();await expect(status).toHaveText('Complete the required fields.');await clear.click();await expect(status).toHaveText('Report cleared.');await expect(happened).toHaveValue('');
  await happened.fill('it does not play');await expected.fill('The game should start.');await preview.click();await expect(status).toHaveText('Sanitized preview ready. Review it before sharing.');await expect(copy).toBeEnabled();await expect(download).toBeEnabled();const reportJson=await page.locator('.caissa-manual-qa__preview').textContent(),reportValue=JSON.parse(reportJson);expect(reportValue.observation).toBe('it does not play');expect(reportValue.surface).toBe('play');await copy.click();expect(await page.evaluate(()=>window.__copiedReport)).toBe(reportJson);const downloadEvent=page.waitForEvent('download');await download.click();const reportDownload=await downloadEvent;const stream=await reportDownload.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);expect(Buffer.concat(chunks).toString('utf8')).toBe(reportJson);
  await clear.click();await expect(happened).toHaveValue('');await expect(expected).toHaveValue('');await expect(page.locator('.caissa-manual-qa__preview')).toBeHidden();await expect(copy).toBeDisabled();await expect(download).toBeDisabled();
  await happened.fill('tester@example.test');await expected.fill('The game should start.');await preview.click();await expect(status).toHaveText('Remove sensitive or prohibited information.');
});

test('manual report preserves board geometry, focus, reduced motion, forced colors, and 200 percent reflow',async({page})=>{
  await page.setViewportSize({width:640,height:900});await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});await page.goto('/play/beta');const launcher=page.getByRole('button',{name:'Report an issue'});const before=await page.locator('#chessboard').boundingBox();await launcher.focus();await launcher.click();await expect(page.getByLabel('What happened?')).toBeFocused();const during=await page.locator('#chessboard').boundingBox();expect(during).toEqual(before);await page.keyboard.press('Escape');await expect(launcher).toBeFocused();await page.addStyleTag({content:'html{zoom:2}'});await launcher.click();const dialog=await page.getByRole('dialog').boundingBox();expect(dialog.x).toBeGreaterThanOrEqual(0);expect(dialog.y).toBeGreaterThanOrEqual(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&matchMedia('(forced-colors: active)').matches)).toBe(true);
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:834,height:1194},{width:1194,height:834},{width:1366,height:768}]) test(`public beta feedback remains contained ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport); await page.goto('/play/beta'); await page.getByRole('button',{name:'Report an issue'}).click(); const box=await page.getByRole('dialog').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(viewport.width); expect(box.y+box.height).toBeLessThanOrEqual(viewport.height); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('Classic and Legacy remain outside public beta',async({page})=>{for(const path of ['/','/play','/yahoo-classic']){await page.goto(path);await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);}});

test('public Bots owns one Worker from Play through PostGame and tears down cleanly',async({page})=>{await instrumentPlay(page);await page.goto('/play/beta/bots');expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);await page.getByLabel(/Casual, Unrated/).check();await page.locator('[data-bot-primary]').click();await expect.poll(()=>page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);page.once('dialog',dialog=>dialog.accept());await page.locator('[data-active-game-action="resign"]').click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);await page.locator('[data-post-game-action="new-game"]').click();expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);});

test('public completed game preserves PostGame Analyze Back and explicit Mentor',async({page})=>{
  await instrumentPlay(page,{autoReply:false});await page.goto('/play/beta');await page.getByRole('button',{name:'Play',exact:true}).click();await loadPosition(page,positions.checkmateInOne.fen);await playMove(page,positions.checkmateInOne.from,positions.checkmateInOne.to);await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
  await page.locator('[data-post-game-action="analyze"]').click();await expect(page.locator('#analyzeSection')).toHaveClass(/caissa-play-v2-inline-analyze/);
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('.board-b72b1')].filter(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;}).length)).toBe(1);
  await page.getByRole('button',{name:'Back to game result'}).click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();await page.locator('[data-post-game-action="mentor-review"]').click();await expect(page.locator('[data-native-mentor-review]')).toBeVisible();await expect(page.getByRole('button',{name:'Report an issue'})).toBeVisible();
});
