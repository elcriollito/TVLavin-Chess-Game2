import { test, expect } from '@playwright/test';
import { positions } from '../play/fixtures/positions.js';
import { instrumentPlay, loadPosition, playMove } from '../play/playwright-helpers.js';

test('internal QA keeps FICS Players and educational ownership outside Play v2',async({page})=>{
  await page.goto('/play?simplified=1');await expect(page.locator('body[data-caissa-play-v2-entry="qa-only"]')).toHaveCount(1);await expect(page.locator('#chessboard .board-b72b1')).toHaveCount(1);
  const resources=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[href]')].map(node=>node.src||node.href));
  expect(resources.filter(url=>/fics-client|fics-style|academy|guided[-_/]?replay|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library)|players-stack|caissa-clarity/i.test(url))).toEqual([]);
  await expect(page.getByRole('tab',{name:/Players|Academy|Lessons|Endgame Training/})).toHaveCount(0);
  expect(await page.evaluate(()=>({fics:window.CaissaPlayV2FicsIsolation.isModeAllowed('fics'),players:window.CaissaPlayV2FicsIsolation.isModeAllowed('players'),writes:{training:localStorage.getItem('caissa.trainingMemory'),mastery:localStorage.getItem('caissa.mastery')}}))).toEqual({fics:false,players:false,writes:{training:null,mastery:null}});
});

test('internal QA completed game retains clean PostGame Analyze and optional Mentor',async({page})=>{
  await instrumentPlay(page,{autoReply:false});await page.goto('/play?simplified=1');await page.locator('[data-games-primary]').click();await loadPosition(page,positions.checkmateInOne.fen);await playMove(page,positions.checkmateInOne.from,positions.checkmateInOne.to);await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
  await expect(page.locator('[data-post-game-action="analyze"]')).toBeVisible();await expect(page.locator('[data-post-game-action="mentor-review"]')).toBeVisible();await expect(page.locator('[data-post-game-action="analyze"]')).toHaveClass(/--primary/);await expect(page.locator('[data-post-game-action="rematch"]')).toHaveClass(/--secondary/);
  await page.locator('[data-post-game-action="analyze"]').click();await expect(page.locator('#analyzeSection')).toHaveClass(/caissa-play-v2-inline-analyze/);await page.getByRole('button',{name:'Back to game result'}).click();await expect(page.locator('[data-play-v2-post-game-core]')).toBeVisible();
});
