import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page));

test('resignation finalizes one valid Games record and clean PostGame', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    const proof = await page.evaluate(() => {
        window.confirm = () => true;
        window.resignGame();
        const snapshot = window.CaissaPlayCompatibility.getSnapshot();
        let record = null; let validation = null; let error = null;
        try {
            record = window.CaissaGameRecord.buildFromPlay();
            validation = window.CaissaGameRecord.validate(record);
        } catch (caught) { error = String(caught); }
        return { snapshot, record, validation, error,
            lifecycle: window.CaissaGameLifecycle.getSnapshot(),
            lifecycleHistory: window.CaissaGameLifecycle.getHistory(),
            startSyncPresent: window.newGame.toString().includes("'GAME_STARTED'"),
            postGame: window.CaissaPostGameExperienceInstance.getSnapshot() };
    });
    expect(proof.error).toBeNull();
    expect(proof.validation.valid, JSON.stringify(proof.validation.errors)).toBe(true);
    expect(proof.record.result).toMatchObject({ value: '0-1', termination: 'resignation', complete: true });
    expect(proof.record.timing.timeControl).toEqual({ initialSeconds: 60, incrementSeconds: 0 });
    expect(proof.record.notation.pgn).toContain('[TimeControl "60+0"]');
    expect(proof.startSyncPresent).toBe(true);
    expect(proof.lifecycle.state, JSON.stringify(proof.lifecycleHistory)).toBe('completed');
    expect(proof.postGame.visible).toBe(true);
    expect(proof.postGame.diagnostics.displays).toBe(1);
    await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost');
    await expect(page.locator('[data-post-game-reason]')).toHaveText('By Resignation');
    await expect(page.locator('[data-post-game-result]')).toBeFocused();
    await expect(page.locator('#chessboard .board-b72b1')).toBeVisible();
    await expect(page.locator('[data-post-game-action]')).toHaveText(['Rematch','New Game','Analyze This Game','Review with Mentor','Copy PGN','Download PGN','Save PGN Locally']);
});

test('result-first actions preserve the record, fail recoverably, and Analyze uses an opaque handoff', async ({ page }) => {
    await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click();
    await page.evaluate(() => { window.confirm=()=>true; window.resignGame(); });
    const before=await page.evaluate(()=>window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId);
    await page.locator('[data-post-game-action="analyze"]').click(); await expect(page.locator('#analyzeSection')).toHaveClass(/active/);
    const analyzeUrl=new URL(page.url()); expect(analyzeUrl.search).not.toMatch(/fen|pgn/i); expect(analyzeUrl.searchParams.get('handoff')).toMatch(/^[a-f0-9]{32}$/);
    const handoff=await page.evaluate(()=>window.CaissaAnalyzeHandoff.resolve()); expect(handoff.ok).toBe(true);
    await page.goBack(); await expect(page.locator('[data-post-game-result]')).toHaveText('You Lost');
    expect(await page.evaluate(()=>window.CaissaPostGameExperienceInstance.getSnapshot().gameRecordId)).toBe(before);
    const failure=await page.evaluate(()=>{ const host=document.createElement('div'); document.body.appendChild(host); const source=window.CaissaPostGameExperience.create({
        compatibility:{execute:()=>({ok:false})}, records:{validate:()=>({valid:true})}, persistence:{getConsent:()=>({value:{state:'denied'}})}, navigation:{} }); source.mount({host});
        const record=window.CaissaGameRecord.buildFromPlay(); source.hydrateFromGame({record,snapshot:window.CaissaPlayCompatibility.getSnapshot()}); const owned=source.getSnapshot().gameRecordId; const result=source.rematch();
        const proof={ok:result.ok,visible:source.getSnapshot().visible,recordPreserved:source.getSnapshot().gameRecordId===owned,feedback:host.querySelector('[data-post-game-feedback]').textContent}; source.dispose(); host.remove(); return proof; });
    expect(failure).toMatchObject({ok:false,visible:true,recordPreserved:true}); expect(failure.feedback).toContain('try again');
});

test('New Game returns to clean setup without starting or changing product mode', async ({ page }) => {
    await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click(); await page.evaluate(()=>{window.confirm=()=>true;window.resignGame();});
    await page.locator('[data-post-game-action="new-game"]').click(); await expect(page.locator('[data-games-primary]')).toBeVisible();
    const state=await page.evaluate(()=>({active:window.App.gameActive,mode:window.CaissaSimplifiedPlayShellInstance.getSnapshot().mode,post:window.CaissaPostGameExperienceInstance.getSnapshot().visible}));
    expect(state).toEqual({active:false,mode:'games',post:false});
});

test('result-first surface is responsive, forced-color safe, and serious-violation free', async ({ page }) => {
    await page.setViewportSize({width:320,height:568}); await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click();
    await page.evaluate(()=>{window.confirm=()=>true;window.resignGame();}); const panel=page.locator('[data-play-v2-post-game-core]');
    for(const viewport of [{width:320,height:568},{width:768,height:1024},{width:1440,height:900}]) { await page.setViewportSize(viewport); await expect(panel).toBeVisible();
        expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1); await expect(page.locator('#chessboard .board-b72b1')).toBeVisible(); }
    await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'}); await expect(panel).toBeVisible();
    await page.evaluate(()=>{document.documentElement.style.zoom='2';}); expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const axe=await new AxeBuilder({page}).include('[data-play-v2-post-game-core]').analyze(); expect(axe.violations.filter(item=>['critical','serious'].includes(item.impact))).toEqual([]);
});

test('PGN actions share the finalized record and local save remains consent controlled', async ({ page }) => {
    await page.goto('/play/games?simplified=1'); await page.locator('[data-games-primary]').click(); await page.evaluate(()=>{window.confirm=()=>true;window.resignGame();
        window.__copiedPgn=null; navigator.clipboard.writeText=async value=>{window.__copiedPgn=value;}; });
    await page.locator('[data-post-game-action="copy-pgn"]').click(); await expect(page.locator('[data-post-game-feedback]')).toHaveText('PGN copied.');
    await expect(page.locator('[data-post-game-action="download-pgn"]')).toBeEnabled();
    expect(await page.evaluate(()=>window.__copiedPgn)).toContain('[Result "0-1"]');
    await page.evaluate(()=>{window.__download={clicked:false,revoked:null};URL.createObjectURL=()=> 'blob:caissa-test';URL.revokeObjectURL=value=>{window.__download.revoked=value;};
        HTMLAnchorElement.prototype.click=function(){window.__download.clicked=true;window.__download.name=this.download;};});
    await page.locator('[data-post-game-action="download-pgn"]').click(); expect(await page.evaluate(()=>window.__download)).toMatchObject({clicked:true,revoked:'blob:caissa-test'});
    await expect(page.locator('[data-post-game-action="save-game"]')).toBeDisabled(); await page.locator('[data-post-game-consent]').check();
    await expect(page.locator('[data-post-game-action="save-game"]')).toBeEnabled(); await page.locator('[data-post-game-action="save-game"]').click();
    expect((await page.evaluate(()=>window.CaissaPostGameExperienceInstance.getSnapshot())).persistence.saved).toBe(true);
    const failed=await page.evaluate(async()=>{const host=document.createElement('div');document.body.appendChild(host);const source=window.CaissaPostGameExperience.create({
        clipboard:{writeText:()=>Promise.reject(new Error('denied'))},records:{validate:()=>({valid:true})},persistence:{getConsent:()=>({value:{state:'denied'}})}});source.mount({host});
        source.hydrateFromGame({record:window.CaissaGameRecord.buildFromPlay(),snapshot:window.CaissaPlayCompatibility.getSnapshot()});const result=await source.copyPgn();const feedback=host.querySelector('[data-post-game-feedback]').textContent;source.dispose();host.remove();return {ok:result.ok,feedback};});
    expect(failed.ok).toBe(false); expect(failed.feedback).toContain('try again');
});

test('promotion is choice-required and keyboard-selectable for every piece in both orientations', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    const cases = [
        { color: 'white', fen: '7k/P7/8/8/8/8/8/7K w - - 0 1', from: 'a7', to: 'a8' },
        { color: 'black', fen: '7K/8/8/8/8/8/p7/7k b - - 0 1', from: 'a2', to: 'a1' }
    ];
    for (const item of cases) for (const piece of ['q', 'r', 'b', 'n']) {
        await page.evaluate(({ item }) => {
            window.App.game.load(item.fen); window.App.board.position(item.fen, false);
            window.App.board.orientation(item.color); window.App.isFlipped = item.color === 'black';
            window.App.moveHistory = []; window.App.currentMoveIndex = -1;
            window.App.pendingPromotion = null; window.App.gameActive = true; window.App.isPlayerTurn = true;
            window.makeMoveFromSquares(item.from, item.to);
        }, { item });
        await expect(page.locator('#promotionModal')).toHaveClass(/show/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#promotionModal')).toHaveClass(/show/);
        const choice = page.locator(`.promotion-btn[data-piece="${piece}"]`);
        await choice.focus(); await page.keyboard.press('Enter');
        await expect(page.locator('#promotionModal')).not.toHaveClass(/show/);
        expect(await page.evaluate(() => window.App.game.history()[0])).toMatch(new RegExp(`=${piece.toUpperCase()}`));
        await expect(page.locator('#chessboard')).toBeFocused();
    }
});
