import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

test('official Play needs no invite, session, account, cookie, or Supabase', async ({ page }) => {
  const requests=[]; page.on('request',request=>requests.push(request.url())); await page.goto('/play',{waitUntil:'networkidle'});
  await expect(page.locator('body[data-caissa-play-v2-entry="official"]')).toHaveCount(1);
  await expect(page.getByText('Public Beta',{exact:true})).toHaveCount(0); await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);
  await expect(page.locator('.caissa-manual-qa-launcher, .caissa-manual-qa')).toHaveCount(0);
  expect(requests.some(url=>/supabase|\/api\/play-beta\/(?:redeem|session|status|logout|feedback)/i.test(url))).toBe(false);
  expect((await page.context().cookies()).some(cookie=>cookie.name==='__Host-caissa_play_beta')).toBe(false);
});

test('homepage enters official Play and canonical navigation is responsive', async ({ page, request }) => {
  const root=await request.get('/',{maxRedirects:0});expect(root.status()).toBe(308);expect(root.headers().location).toBe('/play');
  await page.setViewportSize({width:1366,height:768});await page.goto('/');await expect(page).toHaveURL(/\/play$/);
  const nav=page.getByRole('navigation',{name:'CAISSA main navigation'});await expect(nav).toBeVisible();
  await expect(nav.getByRole('link',{name:'Play',exact:true})).toHaveAttribute('aria-current','page');
  expect(await nav.locator('.nav-item').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none')[0]?.textContent.trim())).toBe('Play');
  const restored=[['CAISSA Classic','/yahoo-classic'],['Academy','/academy'],['Endgame Trainer','/endgame-trainer'],['Endgame Library','/endgame-library'],['FICS','/fics'],['Chess TV','/spectator-tv']];
  for(const[label,href]of restored){const link=nav.getByRole('link',{name:label,exact:true});await expect(link).toHaveCount(1);await expect(link).toHaveAttribute('href',href);}
  await expect(nav.getByRole('link',{name:'Mentor',exact:true})).toHaveCount(0);
  const desktopBoard=await page.locator('#chessboard').boundingBox();expect(Math.abs(desktopBoard.width-desktopBoard.height)).toBeLessThanOrEqual(1);expect(desktopBoard.width).toBeGreaterThan(400);
  await expect(page.getByText('Internal preview',{exact:true})).toHaveCount(0);await expect(page.getByText('Public Beta',{exact:true})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});const launcher=page.getByRole('button',{name:'Open navigation menu'});await expect(launcher).toBeVisible();await launcher.click();await expect(nav).toBeVisible();await page.keyboard.press('Escape');
  await expect(launcher).toBeFocused();expect(await nav.locator('.nav-item').evaluateAll(nodes=>nodes.filter(node=>getComputedStyle(node).display!=='none')[0]?.textContent.trim())).toBe('Play');const mobileBoard=await page.locator('#chessboard').boundingBox();expect(Math.abs(mobileBoard.width-mobileBoard.height)).toBeLessThanOrEqual(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

test('restored global destinations remain lazy and Discord opens only by explicit click',async({page,context})=>{
  await context.route('https://discord.gg/TM7GJPUVfr',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>CAISSA Discord</title>'}));
  const requests=[];page.on('request',request=>requests.push(request.url()));await page.goto('/play',{waitUntil:'networkidle'});const nav=page.getByRole('navigation',{name:'CAISSA main navigation'});
  expect(requests.some(url=>/\/(?:academy|endgame-(?:trainer|library)|yahoo-classic|fics|spectator-tv)(?:[/?#]|$)/.test(url))).toBe(false);expect(requests.some(url=>/(?:fics-client|fics-style|spectator-tv-)/i.test(url))).toBe(false);expect(requests.some(url=>/^wss?:/i.test(url))).toBe(false);expect(requests.some(url=>url==='https://discord.gg/TM7GJPUVfr')).toBe(false);
  const discord=nav.getByRole('link',{name:'CAISSA Discord',exact:true});await expect(discord).toHaveAttribute('href','https://discord.gg/TM7GJPUVfr');await expect(discord).toHaveAttribute('target','_blank');await expect(discord).toHaveAttribute('rel',/noopener/);await expect(discord).toHaveAttribute('rel',/noreferrer/);
  const popupPromise=context.waitForEvent('page');await discord.click();const popup=await popupPromise;expect(popup.url()).toBe('https://discord.gg/TM7GJPUVfr');await popup.close();
  for(const[label,route]of[['CAISSA Classic','/yahoo-classic'],['Academy','/academy'],['Endgame Trainer','/endgame-trainer'],['Endgame Library','/endgame-library']]){await nav.getByRole('link',{name:label,exact:true}).click();await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/','\\/')}$`));await page.goBack();await expect(page).toHaveURL(/\/play$/);}
  await nav.getByRole('link',{name:'FICS',exact:true}).click();await expect(page).toHaveURL(/\/fics$/);await expect(page.locator('#ficsSection')).toHaveClass(/active/);await expect(page.locator('#ficsConnectionStatus')).toBeVisible();await page.goBack();await expect(page).toHaveURL(/\/play$/);
  await nav.getByRole('link',{name:'Chess TV',exact:true}).click();await expect(page).toHaveURL(/\/spectator-tv$/);await expect(page.locator('#spectatorSection')).toHaveClass(/active/);await expect(page.locator('#spectatorSection')).toBeVisible();await page.goBack();await expect(page).toHaveURL(/\/play$/);
});

test('Games Bots Coach work while Players invite QA and direct HTML fail closed', async ({ page }) => {
  for(const [path,tab] of [['/play','Play Game'],['/play/games','Play Game'],['/play/bots','Play Bots'],['/play/coach','Play Coach']]){await page.goto(path);await expect(page.getByRole('tab',{name:tab})).toHaveAttribute('aria-selected','true');await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);await expect(page.locator('.caissa-manual-qa-launcher, .caissa-manual-qa')).toHaveCount(0);}
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

test('Classic remains isolated from official Play',async({page})=>{await page.goto('/yahoo-classic');await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);});

test('public Bots owns one Worker from Play through PostGame and tears down cleanly',async({page})=>{await instrumentPlay(page);await page.goto('/play/bots');expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);await page.getByLabel(/Casual, Unrated/).check();await page.locator('[data-bot-primary]').click();await expect.poll(()=>page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(1);page.once('dialog',dialog=>dialog.accept());await page.locator('[data-active-game-action="resign"]').click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);await page.locator('[data-post-game-action="new-game"]').click();expect(await page.evaluate(()=>window.CaissaPlayV2BotWorkerReadiness.getSnapshot().activeWorkerCount)).toBe(0);});

test('public completed game preserves PostGame Analyze Back and explicit Mentor',async({page})=>{
  await instrumentPlay(page,{autoReply:false});await page.goto('/play');await page.locator('[data-games-primary]').click();await loadPosition(page,positions.checkmateInOne.fen);await playMove(page,positions.checkmateInOne.from,positions.checkmateInOne.to);await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
  const hierarchy=await page.evaluate(()=>{const style=selector=>{const node=document.querySelector(selector),css=getComputedStyle(node);return{background:css.backgroundColor,color:css.color,fontSize:css.fontSize,fontWeight:css.fontWeight,wrap:css.whiteSpace,overflow:node.scrollWidth>node.clientWidth};};return{analyze:style('[data-post-game-action="analyze"]'),rematch:style('[data-post-game-action="rematch"]'),newGame:style('[data-post-game-action="new-game"]'),mentor:style('[data-post-game-action="mentor-review"]')};});
  expect(hierarchy.rematch).toEqual(hierarchy.newGame);expect(Number(hierarchy.rematch.fontWeight)).toBeGreaterThanOrEqual(700);expect(hierarchy.rematch.wrap).toBe('nowrap');expect(hierarchy.rematch.overflow).toBe(false);expect(hierarchy.analyze.background).not.toBe(hierarchy.rematch.background);expect(hierarchy.mentor.background).not.toBe(hierarchy.rematch.background);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);for(const selector of['[data-post-game-action="analyze"]','[data-post-game-action="rematch"]','[data-post-game-action="new-game"]','[data-post-game-action="mentor-review"]'])expect(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.locator('[data-post-game-action="analyze"]').click();await expect(page.locator('#analyzeSection')).toHaveClass(/caissa-play-v2-inline-analyze/);
  await expect.poll(()=>page.evaluate(()=>[...document.querySelectorAll('.board-b72b1')].filter(node=>{const style=getComputedStyle(node),box=node.getBoundingClientRect();return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;}).length)).toBe(1);
  await page.getByRole('button',{name:'Back to game result'}).click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();await page.locator('[data-post-game-action="mentor-review"]').click();await expect(page.locator('[data-native-mentor-review]')).toBeVisible();await expect(page.getByRole('button',{name:'Report an issue'})).toHaveCount(0);
});
