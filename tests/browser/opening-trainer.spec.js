import { test, expect } from '@playwright/test';

const movesPgn = '[Event "Sicilian Showcase"]\n[White "CAISSA White"]\n[Black "CAISSA Black"]\n[Result "*"]\n[ECO "B20"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 *';

async function fixtureRoutes(page) {
  await page.route('https://en.wikibooks.org/**', async route => {
    const parsed = new URL(route.request().url());
    const name = parsed.searchParams.get('page') || '';
    const payload = name
      ? {parse:{text:'<div class="mw-parser-output"><p>Wikibooks explains the opening ideas, piece development, and center control.</p><h2>Opening plan</h2><p>Review the plans on the board as you replay the opening.</p></div>'}}
      : {error:{code:'missingtitle'}};
    await route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(payload)});
  });
  await page.route('**/api/pgn/opening*', async route => {
    const url = new URL(route.request().url());
    const file = url.searchParams.get('file');
    if(!file){
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        access:'free',openings:[{id:'opening-sicilian',title:'Sicilian Defense',file:'Sicilian.zip'}]
      })});
    }
    return route.fulfill({status:200,contentType:'application/x-chess-pgn',body:movesPgn});
  });
}

async function openPilot(page) {
  await fixtureRoutes(page);
  await page.goto('/opening-trainer');
  await expect(page.getByRole('heading',{name:/Opening Trainer/})).toBeVisible();
  await expect(page.locator('#ot-board .caissa-board__square')).toHaveCount(64);
  await expect(page.locator('#ot-board .caissa-board__piece')).toHaveCount(32);
  await page.locator('#ot-auto-wiki').uncheck();
}
async function tapMove(page,from,to) {
  await page.locator('#ot-board .caissa-board__square[data-square="'+from+'"]').click();
  await page.locator('#ot-board .caissa-board__square[data-square="'+to+'"]').click();
  await expect(page.locator('#ot-board .caissa-board__piece[data-square="'+to+'"]')).toHaveCount(1);
}

test('starts with one large board and all five tabs; navigation preserves geometry',async ({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await openPilot(page);
  await expect(page.locator('.ot-tabs button')).toHaveCount(5);
  const boardRect=await page.locator('#ot-board').boundingBox();
  const panelRect=await page.locator('.ot-panel').boundingBox();
  const footBefore=await page.locator('.ot-panel-foot-wrap').boundingBox();
  expect(boardRect).toBeTruthy();
  expect(panelRect).toBeTruthy();
  expect(footBefore).toBeTruthy();
  expect(panelRect.x).toBeGreaterThan(boardRect.x + boardRect.width);
  await page.getByRole('tab',{name:'Opening'}).click();
  await page.getByRole('tab',{name:'WikiBook'}).click();
  await page.getByRole('tab',{name:'Analysis'}).click();
  const footAfter=await page.locator('.ot-panel-foot-wrap').boundingBox();
  const boardAfter=await page.locator('#ot-board').boundingBox();
  expect(Math.abs(footAfter.y-footBefore.y)).toBeLessThan(3);
  expect(Math.abs(boardAfter.width-boardRect.width)).toBeLessThan(3);
  await tapMove(page,'e2','e4');
  await expect(page.locator('#ot-analysis-notation')).toContainText('e4');
  await page.locator('#ot-first').click();
  await expect(page.locator('#ot-board .caissa-board__piece[data-square="e2"]')).toHaveCount(1);
  await page.locator('#ot-next').click();
  await expect(page.locator('#ot-board .caissa-board__piece[data-square="e4"]')).toHaveCount(1);
});

test('Save & Train remembers Black responses without suggesting them first',async ({page})=>{
  await openPilot(page);
  await tapMove(page,'e2','e4');
  await tapMove(page,'e7','e5');
  await page.locator('#ot-save-train').click();
  await expect(page.locator('#ot-save-dialog')).toBeVisible();
  await page.locator('#ot-save-name').fill('My King Pawn');
  await page.locator('#ot-save-side').selectOption('black');
  await page.locator('#ot-confirm-save-train').click();
  await expect(page.getByRole('tab',{name:'Practice'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#ot-practice-session')).toBeVisible();
  await expect(page.locator('#ot-board .caissa-board__piece[data-square="e4"]')).toHaveCount(1);
  await expect(page.locator('#ot-practice-status')).not.toContainText('e5');
  await tapMove(page,'e7','e5');
  await expect(page.locator('#ot-practice-status')).toContainText(/line complete/i);
  expect(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('caissa.opening-trainer.repertoires.v1')))).toBe(true);
});

test('ECO lookup, explorer, WikiBook and game search share one board',async ({page})=>{
  await openPilot(page);
  await page.getByRole('tab',{name:'Opening'}).click();
  await page.locator('#ot-eco-search').fill('Sicilian');
  await expect(page.locator('#ot-eco-results button').first()).toBeVisible();
  await page.locator('#ot-eco-results button').first().click();
  await expect(page.locator('#ot-opening-name')).toContainText(/Sicilian/i);
  await page.locator('#ot-explorer-mode').click();
  await expect(page.locator('#ot-explorer-content')).toBeVisible();
  await page.getByRole('tab',{name:'WikiBook'}).click();
  await expect(page.locator('#ot-wiki-copy')).toContainText(/opening ideas/i);
  await expect(page.locator('#ot-wiki-source')).toHaveAttribute('href',/wikibooks/);
  await page.getByRole('tab',{name:'Games'}).click();
  await page.locator('#ot-game-search').fill('Sicilian');
  await page.locator('#ot-game-categories button').first().click();
  await expect(page.locator('#ot-game-results button').filter({hasText:'CAISSA White'})).toHaveCount(1);
  await page.locator('#ot-game-results button').filter({hasText:'CAISSA White'}).click();
  await expect(page.locator('#ot-games-notation')).toBeVisible();
  await expect(page.locator('#ot-game-moves')).toContainText('c5');
});

for(const viewport of [{width:885,height:611},{width:390,height:844}]){
  test('mobile/tablet workspace stays usable at '+viewport.width+'×'+viewport.height,async ({page})=>{
    await page.setViewportSize(viewport);
    await openPilot(page);
    const board=await page.locator('#ot-board').boundingBox();
    const panel=await page.locator('.ot-panel').boundingBox();
    const foot=await page.locator('.ot-panel-foot-wrap').boundingBox();
    expect(board.width).toBeLessThanOrEqual(viewport.width);
    expect(panel.y).toBeGreaterThan(board.y+board.height-5);
    expect(foot).toBeTruthy();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width+3);
    await page.getByRole('tab',{name:'Practice'}).click();
    await expect(page.locator('#ot-repertoire-list')).toBeVisible();
    await page.getByRole('tab',{name:'Analysis'}).click();
    await tapMove(page,'e2','e4');
    await expect(page.locator('#ot-analysis-notation')).toContainText('e4');
  });
}


test('Auto WikiBook follows exact theory only when not tab-locked',async ({page})=>{
  await openPilot(page);
  await page.locator('#ot-auto-wiki').check();
  await page.locator('#ot-lock-tab').check();
  await tapMove(page,'e2','e4');
  await expect(page.getByRole('tab',{name:'Analysis'})).toHaveAttribute('aria-selected','true');
  await page.locator('#ot-lock-tab').uncheck();
  await tapMove(page,'e7','e5');
  await expect(page.getByRole('tab',{name:'WikiBook'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#ot-wiki-copy')).toContainText(/opening ideas/);
});

test('1600×1000 desktop board stays dominant; tabs cannot dislodge fixed footer',async ({page})=>{
  await page.setViewportSize({width:1600,height:1000});
  await openPilot(page);
  const board=await page.locator('#ot-board').boundingBox();
  const panel=await page.locator('.ot-panel').boundingBox();
  const foot=await page.locator('.ot-panel-foot-wrap').boundingBox();
  expect(board.width).toBeGreaterThan(450);
  expect(panel.x).toBeGreaterThan(board.x+board.width);
  await page.getByRole('tab',{name:'Practice'}).click();
  await page.getByRole('tab',{name:'Games'}).click();
  await page.getByRole('tab',{name:'WikiBook'}).click();
  const moved=await page.locator('.ot-panel-foot-wrap').boundingBox();
  expect(Math.abs(moved.y-foot.y)).toBeLessThan(3);
});
