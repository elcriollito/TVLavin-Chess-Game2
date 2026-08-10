import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

test('official Play needs no invite, session, account, cookie, or Supabase', async ({ page }) => {
  const requests=[]; page.on('request',request=>requests.push(request.url())); await page.goto('/play',{waitUntil:'networkidle'});
  await expect(page.locator('body[data-caissa-play-v2-entry="official"]')).toHaveCount(1);
  await expect(page.getByText('Public Beta',{exact:true})).toHaveCount(0); await expect(page.getByRole('button',{name:'Report an issue'})).toBeVisible();
  expect(requests.some(url=>/supabase|\/api\/play-beta\/(?:redeem|session|status|logout|feedback)/i.test(url))).toBe(false);
  expect((await page.context().cookies()).some(cookie=>cookie.name==='__Host-caissa_play_beta')).toBe(false);
});

test('homepage enters official Play and canonical navigation is responsive', async ({ page, request }) => {
  const root=await request.get('/',{maxRedirects:0});expect(root.status()).toBe(308);expect(root.headers().location).toBe('/play');
  await page.setViewportSize({width:1366,height:768});await page.goto('/');await expect(page).toHaveURL(/\/play$/);
  const nav=page.getByRole('navigation',{name:'CAISSA main navigation'});await expect(nav).toBeVisible();
  await expect(nav.getByRole('button',{name:'Play',exact:true})).toHaveAttribute('aria-current','page');
  expect(await nav.locator('.nav-item').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none')[0]?.textContent.trim())).toBe('Play');
  await expect(nav.getByText(/FICS|Academy|Endgame|CAISSA Classic|Spectator TV/)).toHaveCount(0);
  const desktopBoard=await page.locator('#chessboard').boundingBox();expect(Math.abs(desktopBoard.width-desktopBoard.height)).toBeLessThanOrEqual(1);expect(desktopBoard.width).toBeGreaterThan(400);
  await expect(page.getByText('Internal preview',{exact:true})).toHaveCount(0);await expect(page.getByText('Public Beta',{exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});const launcher=page.getByRole('button',{name:'Open navigation menu'});await expect(launcher).toBeVisible();await launcher.click();await expect(nav).toBeVisible();await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();expect(await nav.locator('.nav-item').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none')[0]?.textContent.trim())).toBe('Play');const mobileBoard=await page.locator('#chessboard').boundingBox();expect(Math.abs(mobileBoard.width-mobileBoard.height)).toBeLessThanOrEqual(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('Games Bots Coach work while Players invite QA and direct HTML fail closed', async ({ page }) => {
  for(const [path,tab] of [['/play','Play Game'],['/play/games','Play Game'],['/play/bots','Play Bots'],['/play/coach','Play Coach']]){await page.goto(path);await expect(page.getByRole('tab',{name:tab})).toHaveAttribute('aria-selected','true');await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);}
  const closed=['/play/players','/play/invite','/play/qa/promotion','/play/qa/ipad-analyze-diagnostic','/play/qa/bug-diary'];
  const documents=['/play-v2.html','/play-v2-public-beta.html','/play-v2-invite.html','/play-v2-promotion-qa.html','/play-v2-ipad-analyze-diagnostic.html'];
  for(const document of documents)closed.push(document,`${document}?token=fabricated#authorize`,`${document}/descendant`,document.replace('.html','%2Ehtml'));
  for(const path of closed){const response=await page.goto(path);expect([200,404],path).toContain(response.status());if(response.status()===200)await expect(page).toHaveTitle(/Play Beta Unavailable/);await expect(page.locator('script')).toHaveCount(0);await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);}
});

test('real public document starts exactly one Games session and accepts one legal move', async ({ page }) => {
  await page.goto('/play'); const play=page.locator('[data-games-primary]'); await expect(play).toBeEnabled(); await play.click();
  await expect(page.locator('body')).toHaveClass(/caissa-play-game-active/); await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
  await playMove(page,'e2','e4'); await expect.poll(()=>page.evaluate(()=>window.App?.game?.history?.().length)).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(()=>window.CaissaSimplifiedPlayShellInstance.inspect().gamesPanel.diagnostics.successfulStarts)).toBe(1);
});

test('manual report is local and only the existing-member Discord channel remains', async ({ page, context }) => {
  await context.route('https://discord.com/channels/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Discord channel</title>'}));
  const external=[]; page.on('request',request=>{if(new URL(request.url()).origin!=='http://127.0.0.1:8000')external.push(request.url());}); await page.goto('/play');
  await page.getByRole('button',{name:'Report an issue'}).click();await expect(page.getByText('Your report stays on this device. Copy or download the JSON, then post it in #play-v2-feedback.')).toBeVisible();await expect(page.getByText(/does not expire automatically/)).toBeVisible();await page.getByRole('button',{name:'Close',exact:true}).click();expect(external).toEqual([]);
  await page.getByRole('button',{name:'Report an issue'}).click(); await page.getByLabel('What happened?').fill('The board shifted after rotation.'); await page.getByLabel('What did you expect?').fill('The board should remain stable.'); await page.getByRole('button',{name:'Preview report'}).click();
  expect(external).toEqual([]); const json=await page.locator('.caissa-manual-qa__preview').textContent(); expect(JSON.parse(json).contract).toBe('PlayV2ManualQaReport@1.0.0');
  await expect(page.getByRole('link',{name:/Join feedback Discord/})).toHaveCount(0);const popupPromise=context.waitForEvent('page');await page.getByRole('link',{name:/Open #play-v2-feedback/}).click();const popup=await popupPromise;expect(popup.url()).toBe('https://discord.com/channels/1535886419279482922/1535886421775097938');await popup.close();
});

test('manual report accepts innocuous input, maps errors honestly, and Clear resets every state',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedReport=value;}}}));
  await page.goto('/play');await page.getByRole('button',{name:'Report an issue'}).click();const happened=page.getByLabel('What happened?'),expected=page.getByLabel('What did you expect?'),preview=page.getByRole('button',{name:'Preview report'}),clear=page.getByRole('button',{name:'Clear',exact:true}),status=page.locator('.caissa-manual-qa [role=status]'),copy=page.getByRole('button',{name:'Copy JSON'}),download=page.getByRole('button',{name:'Download JSON'});
  await happened.fill('draft');await clear.click();await expect(happened).toHaveValue('');await expect(copy).toBeDisabled();await expect(download).toBeDisabled();
  await happened.fill('it does not play');await preview.click();await expect(status).toHaveText('Complete the required fields.');await clear.click();await expect(status).toHaveText('Report cleared.');await expect(happened).toHaveValue('');
  await happened.fill('it does not play');await expected.fill('The game should start.');await preview.click();await expect(status).toHaveText('Sanitized preview ready. Review it before sharing.');await expect(copy).toBeEnabled();await expect(download).toBeEnabled();const reportJson=await page.locator('.caissa-manual-qa__preview').textContent(),reportValue=JSON.parse(reportJson);expect(reportValue.observation).toBe('it does not play');expect(reportValue.surface).toBe('play');await copy.click();expect(await page.evaluate(()=>window.__copiedReport)).toBe(reportJson);const downloadEvent=page.waitForEvent('download');await download.click();const reportDownload=await downloadEvent;const stream=await reportDownload.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);expect(Buffer.concat(chunks).toString('utf8')).toBe(reportJson);
  await clear.click();await expect(happened).toHaveValue('');await expect(expected).toHaveValue('');await expect(page.locator('.caissa-manual-qa__preview')).toBeHidden();await expect(copy).toBeDisabled();await expect(download).toBeDisabled();
  await happened.fill('tester@example.test');await expected.fill('The game should start.');await preview.click();await expect(status).toHaveText('Remove sensitive or prohibited information.');
});

test('manual report preserves board geometry, focus, reduced motion, forced colors, and 200 percent reflow',async({page})=>{
  await page.setViewportSize({width:640,height:900});await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});await page.goto('/play');const launcher=page.getByRole('button',{name:'Report an issue'});const before=await page.locator('#chessboard').boundingBox();await launcher.focus();await launcher.click();await expect(page.getByLabel('What happened?')).toBeFocused();const during=await page.locator('#chessboard').boundingBox();expect(during).toEqual(before);await page.keyboard.press('Escape');await expect(launcher).toBeFocused();await page.addStyleTag({content:'html{zoom:2}'});await launcher.click();const dialog=await page.getByRole('dialog').boundingBox();expect(dialog.x).toBeGreaterThanOrEqual(0);expect(dialog.y).toBeGreaterThanOrEqual(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&matchMedia('(forced-colors: active)').matches)).toBe(true);
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:834,height:1194},{width:1194,height:834},{width:1366,height:768}]) test(`public beta feedback remains contained ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport); await page.goto('/play'); await page.getByRole('button',{name:'Report an issue'}).click(); const box=await page.getByRole('dialog').boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(viewport.width); expect(box.y+box.height).toBeLessThanOrEqual(viewport.height); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('Classic remains isolated from official Play',async({page})=>{await page.goto('/yahoo-classic');await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);});

test('public Bots owns one Worker from Play through PostGame and tears down cleanly',async({page})=>{await instrumentPlay(page);await page.goto('/play/bots');expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);await page.getByLabel(/Casual, Unrated/).check();await page.locator('[data-bot-primary]').click();await expect.poll(()=>page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);page.once('dialog',dialog=>dialog.accept());await page.locator('[data-active-game-action="resign"]').click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);await page.locator('[data-post-game-action="new-game"]').click();expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);});

test('public completed game preserves PostGame Analyze Back and explicit Mentor',async({page})=>{
  await instrumentPlay(page,{autoReply:false});await page.goto('/play');await page.locator('[data-games-primary]').click();await loadPosition(page,positions.checkmateInOne.fen);await playMove(page,positions.checkmateInOne.from,positions.checkmateInOne.to);await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
  const hierarchy=await page.evaluate(()=>{const style=selector=>{const node=document.querySelector(selector),css=getComputedStyle(node);return{background:css.backgroundColor,color:css.color,fontSize:css.fontSize,fontWeight:css.fontWeight,wrap:css.whiteSpace,overflow:node.scrollWidth>node.clientWidth};};return{analyze:style('[data-post-game-action="analyze"]'),rematch:style('[data-post-game-action="rematch"]'),newGame:style('[data-post-game-action="new-game"]'),mentor:style('[data-post-game-action="mentor-review"]')};});
  expect(hierarchy.rematch).toEqual(hierarchy.newGame);expect(Number(hierarchy.rematch.fontWeight)).toBeGreaterThanOrEqual(700);expect(hierarchy.rematch.wrap).toBe('nowrap');expect(hierarchy.rematch.overflow).toBe(false);expect(hierarchy.analyze.background).not.toBe(hierarchy.rematch.background);expect(hierarchy.mentor.background).not.toBe(hierarchy.rematch.background);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);for(const selector of['[data-post-game-action="analyze"]','[data-post-game-action="rematch"]','[data-post-game-action="new-game"]','[data-post-game-action="mentor-review"]'])expect(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.locator('[data-post-game-action="analyze"]').click();await expect(page.locator('#analyzeSection')).toHaveClass(/caissa-play-v2-inline-analyze/);
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('.board-b72b1')].filter(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;}).length)).toBe(1);
  await page.getByRole('button',{name:'Back to game result'}).click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();await page.locator('[data-post-game-action="mentor-review"]').click();await expect(page.locator('[data-native-mentor-review]')).toBeVisible();await expect(page.getByRole('button',{name:'Report an issue'})).toBeVisible();
});
