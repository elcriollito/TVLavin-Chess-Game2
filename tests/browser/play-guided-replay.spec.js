import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

test('core Guided Replay flow hides the answer, validates moves, reveals, restarts and restores PostGame', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    await page.locator('[data-games-primary]').click();
    await page.evaluate(() => {
        window.CaissaPlayCompatibility.execute('submitMove', { from: 'e2', to: 'e4' });
        window.confirm = () => true;
        window.resignGame();
    });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    const replayAction = page.locator('[data-post-game-action="guided-replay"]');
    await expect(replayAction).toBeDisabled();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    const prepared = await page.evaluate(() => {
        const postGame = window.CaissaPostGameExperienceInstance;
        const requestId = postGame.getSnapshot().mentor.request.requestId;
        const positions = [
            {
                schemaVersion: '1.1.0', positionId: 'position:0', ply: 0,
                evaluation: { type: 'cp', cp: 50, mate: null, perspective: 'white' },
                bestMove: { uci: 'e2e4' }, principalVariation: ['e2e4', 'e7e5'],
                playedMove: null, mover: null, sideToMove: 'white', phase: 'opening',
                material: { whiteMinusBlack: 0 }, terminal: false
            },
            {
                schemaVersion: '1.1.0', positionId: 'position:1', ply: 1,
                evaluation: { type: 'cp', cp: -150, mate: null, perspective: 'white' },
                bestMove: { uci: 'e7e5' }, principalVariation: ['e7e5'],
                playedMove: { uci: 'e2e4', san: 'e4' }, mover: 'white',
                sideToMove: 'black', phase: 'opening',
                material: { whiteMinusBlack: 0 }, terminal: true
            }
        ];
        const technical = {
            schemaVersion: '1.1.0', resultId: 'analysis-result:guided-browser',
            runId: 'run:guided-browser', requestId, status: 'complete',
            summary: { partial: false }, positions
        };
        const selected = postGame.selectCriticalMoments(technical);
        const replay = postGame.prepareGuidedReplay(technical, selected.value);
        return { selected, replay, snapshot: postGame.getSnapshot() };
    });
    expect(prepared.selected.ok).toBe(true);
    expect(prepared.replay.ok).toBe(true);
    expect(prepared.replay.value.currentStep.answer.referenceMove).toBeNull();
    expect(prepared.snapshot.mentor.knowledgeMapping.mappings).toHaveLength(1);
    expect(prepared.snapshot.mentor.knowledgeMapping.mappings[0].conceptId).toBe('defensive-awareness');
    await expect(page.locator('[data-post-game-concepts]')).toContainText('defensive awareness');
    await expect(replayAction).toBeEnabled();
    await replayAction.click();
    const view = page.locator('.caissa-guided-replay');
    await expect(view).toBeVisible();
    await expect(view.locator('.guided-replay-board')).toHaveCount(1);
    await expect(view).not.toContainText('e2e4');
    expect(await page.locator('.guided-replay-board').getAttribute('aria-label'))
        .toBe('Guided Replay chessboard');

    const illegal = await page.evaluate(() => {
        const id = window.CaissaPostGameExperienceInstance.getSnapshot().mentor.guidedReplaySession.sessionId;
        return window.CaissaMentorGuidedReplay.submitMove(id, 'e2e5');
    });
    expect(illegal.reasonCode).toBe('ILLEGAL_MOVE');
    expect(illegal.value.attempts).toHaveLength(0);

    await view.locator('input[name="move"]').fill('e2e4');
    await view.locator('form').evaluate(form => form.requestSubmit());
    await expect(view.locator('.caissa-guided-replay__feedback'))
        .toContainText('Legal move recorded');
    await expect(view.locator('.caissa-guided-replay__knowledge')).toBeEmpty();
    await expect(view).not.toContainText('Reference move: e2e4');
    await view.locator('[data-guided-replay-action="reveal"]').click();
    await expect(view.locator('.caissa-guided-replay__reference')).toContainText('Reference move: e2e4');
    await expect(view.locator('.caissa-guided-replay__feedback'))
        .toContainText('matches the stored engine reference');
    await expect(view.locator('.caissa-guided-replay__knowledge')).toContainText('defensive awareness');
    await expect(view.locator('.caissa-guided-replay__knowledge')).not.toContainText('Open ');
    await view.locator('[data-guided-replay-action="restart"]').click();
    await expect(view.locator('.caissa-guided-replay__feedback')).toHaveText('');
    await view.locator('[data-guided-replay-action="close"]').click();
    await expect(view).toBeHidden();
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await replayAction.click();
    await expect(view).toBeVisible();
    await view.locator('[data-guided-replay-action="close"]').click();

    const proof = await page.evaluate(() => ({
        replay: window.CaissaMentorGuidedReplay.inspect(),
        mapping: window.CaissaEducationalConceptMapper.inspect(),
        registry: window.CaissaKnowledgeMappingRegistry.inspect(),
        memory: window.CaissaMentorTrainingMemoryAdapter.inspect(),
        mastery: window.CaissaMentorMasteryAdapter.inspect(),
        recommendation: window.CaissaMentorRecommendationAdapter.inspect(),
        view: window.CaissaGuidedReplayView.inspect(),
        analyzeBoard: !!window.CaissaAnalyzeSection?.board,
        playBoards: document.querySelectorAll('#chessboard').length,
        replayBoards: document.querySelectorAll('.guided-replay-board').length,
        url: location.href
    }));
    expect(proof.replay.engineRequests).toBe(0);
    expect(proof.replay.storageWrites).toBe(0);
    expect(proof.replay.workers).toBe(0);
    expect(proof.mapping.mappingRequests).toBe(1);
    expect(proof.mapping.conceptsInferred).toBe(1);
    expect(proof.mapping.storageWrites).toBe(0);
    expect(proof.mapping.memoryWrites).toBe(0);
    expect(proof.mapping.masteryWrites).toBe(0);
    expect(proof.mapping.recommendationsCreated).toBe(0);
    expect(proof.registry.entries).toBe(1);
    expect(proof.memory.writes).toBe(0);
    expect(proof.mastery.writes).toBe(0);
    expect(proof.recommendation.writes).toBe(0);
    expect(proof.analyzeBoard).toBe(false);
    expect(proof.playBoards).toBe(1);
    expect(proof.replayBoards).toBe(1);
    expect(proof.url).not.toMatch(/e2e4|(?:pgn|fen)=/i);
});

test('Guided Replay remains bounded at desktop and mobile widths with no answer in accessibility text', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.goto('/play/games?simplified=1');
        const layout = await page.evaluate(() => ({
            promptTypes: window.CaissaGuidedReplayPrompts.promptTypes,
            answerPolicies: window.CaissaMentorGuidedReplay.answerPolicies,
            resources: window.CaissaMentorGuidedReplay.inspect()
        }));
        expect(layout.promptTypes).toEqual(['play-move', 'choose-move', 'reflect']);
        expect(layout.answerPolicies).toContain('hidden-until-attempt');
        expect(layout.resources.maxReplayBoards).toBe(1);
        expect(layout.resources.engineRequests).toBe(0);
    }
});
