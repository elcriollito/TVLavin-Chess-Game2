import { test, expect } from '@playwright/test';

test('internal stage reserves canonical beta routes for the direct public-beta gate',async({page})=>{
  for(const path of ['/play/beta','/play/beta/games','/play/beta/bots','/play/beta/coach','/play/beta/invite','/play/beta/players']){await page.goto(path);await expect(page).toHaveTitle(/Play Beta Unavailable/);await expect(page.locator('script')).toHaveCount(0);}
});

test('direct Play v2 documents and variants are runtime-free and fail closed',async({page})=>{
  const documents=['/play-v2.html','/play-v2-public-beta.html','/play-v2-invite.html','/play-v2-promotion-qa.html','/play-v2-ipad-analyze-diagnostic.html'];
  for(const document of documents)for(const path of [document,`${document}?token=fabricated#authorize`,`${document}/descendant`,document.replace('.html','%2Ehtml')]){
    const response=await page.goto(path);expect([200,404],path).toContain(response.status());if(response.status()===200)await expect(page).toHaveTitle(/Play Beta Unavailable/);await expect(page.locator('script')).toHaveCount(0);await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);expect(new URL(page.url()).pathname.toLowerCase()).not.toBe('/play/beta');
  }
});

test('internal local QA remains explicit while Classic and Legacy defaults remain unchanged',async({page})=>{
  await page.goto('/play?simplified=1');await expect(page.locator('body[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
  for(const path of ['/','/play','/yahoo-classic']){await page.goto(path);await expect(page.locator('body[data-caissa-play-v2-entry]')).toHaveCount(0);}
});
