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
    const summaryAction = page.locator('[data-post-game-action="mentor-summary"]');
    await expect(replayAction).toBeDisabled();
    await expect(summaryAction).toBeDisabled();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    const prepared = await page.evaluate(() => {
        const postGame = window.CaissaPostGameExperienceInstance;
        const requestId = postGame.getSnapshot().mentor.request.requestId;
        const positions = [
            {
                schemaVersion: '1.1.0', positionId: 'position:0', ply: 0,
                evaluation: { type: 'cp', cp: 50, mate: null, perspective: 'white' },
                bestMove: { uci: 'd2d4' }, principalVariation: ['d2d4', 'd7d5'],
                playedMove: null, mover: null, sideToMove: 'white', phase: 'middlegame',
                material: { whiteMinusBlack: 0 }, terminal: false
            },
            {
                schemaVersion: '1.1.0', positionId: 'position:1', ply: 1,
                evaluation: { type: 'cp', cp: 150, mate: null, perspective: 'white' },
                bestMove: { uci: 'e7e5' }, principalVariation: ['e7e5'],
                playedMove: { uci: 'e2e4', san: 'e4' }, mover: 'white',
                sideToMove: 'black', phase: 'middlegame',
                material: { whiteMinusBlack: 0 }, terminal: false
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
    expect(prepared.snapshot.mentor.knowledgeMapping.mappings[0].conceptId).toBe('candidate-moves');
    await expect(page.locator('[data-post-game-concepts]')).toContainText('candidate moves');
    await expect(replayAction).toBeEnabled();
    await replayAction.click();
    const view = page.locator('.caissa-guided-replay');
    await expect(view).toBeVisible();
    await expect(view.locator('.guided-replay-board')).toHaveCount(1);
    await expect(view).not.toContainText('d2d4');
    expect(await page.locator('.guided-replay-board').getAttribute('aria-label'))
        .toBe('Guided Replay chessboard');

    const illegal = await page.evaluate(() => {
        const id = window.CaissaPostGameExperienceInstance.getSnapshot().mentor.guidedReplaySession.sessionId;
        return window.CaissaMentorGuidedReplay.submitMove(id, 'e2e5');
    });
    expect(illegal.reasonCode).toBe('ILLEGAL_MOVE');
    expect(illegal.value.attempts).toHaveLength(0);

    await view.locator('input[name="move"]').fill('d2d4');
    await view.locator('form').evaluate(form => form.requestSubmit());
    await expect(view.locator('.caissa-guided-replay__feedback'))
        .toContainText('Legal move recorded');
    await expect(view.locator('.caissa-guided-replay__knowledge')).toBeEmpty();
    await expect(view).not.toContainText('Reference move: d2d4');
    await view.locator('[data-guided-replay-action="reveal"]').click();
    await expect(view.locator('.caissa-guided-replay__reference')).toContainText('Reference move: d2d4');
    await expect(view.locator('.caissa-guided-replay__feedback'))
        .toContainText('matches the stored engine reference');
    await expect(view.locator('.caissa-guided-replay__knowledge')).toContainText('candidate moves');
    await expect(view.locator('.caissa-guided-replay__knowledge')).not.toContainText('Open ');
    await expect(summaryAction).toBeEnabled();
    await summaryAction.click();
    const summary = page.locator('[data-mentor-summary]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Reviewed strength');
    await expect(summary).toContainText('candidate moves');
    await expect(summary).not.toContainText('Improvement area');
    await expect(summary).toContainText('Next action');
    await expect(summary).toContainText('Rematch goal');
    await expect(summary).toBeFocused();
    await summaryAction.click();
    for (const viewport of [
        { width: 320, height: 568 }, { width: 375, height: 667 },
        { width: 390, height: 844 }, { width: 412, height: 915 },
        { width: 768, height: 1024 }, { width: 1024, height: 768 },
        { width: 1366, height: 768 }, { width: 1440, height: 900 }
    ]) {
        await page.setViewportSize(viewport);
        const bounds = await summary.evaluate(node => ({
            left: node.getBoundingClientRect().left,
            right: node.getBoundingClientRect().right,
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth
        }));
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right - bounds.left).toBeLessThanOrEqual(viewport.width + 1);
        expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
    }
    expect(await summaryAction.evaluate(node => node.getBoundingClientRect().height))
        .toBeGreaterThanOrEqual(44);
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
        summary: window.CaissaMentorSummary.inspect(),
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
    expect(proof.summary.summariesCreated).toBe(1);
    expect(proof.summary.duplicateReuses).toBe(1);
    expect(proof.summary.engineRequests).toBe(0);
    expect(proof.summary.workers).toBe(0);
    expect(proof.summary.storageWrites).toBe(0);
    expect(proof.summary.memoryWrites).toBe(0);
    expect(proof.summary.masteryWrites).toBe(0);
    expect(proof.summary.recommendationsAssigned).toBe(0);
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

test('Mentor Summary preserves one trusted exact Knowledge link and generic-only fallback', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const result = await page.evaluate(() => {
        const requestId = 'mrr_browserexact123456';
        const request = {
            requestId, source: { type: 'bot-game', recordId: 'game:browser-exact' },
            mentor: { id: 'academyMentorCaissa', version: 1 },
            review: { explanationStyle: 'balanced' },
            knowledge: { releaseId: window.CaissaKnowledgeMappingPolicy.releaseId },
            game: { gameRecordRef: 'game:browser-exact', hasResultMismatch: false }
        };
        const analysisResult = {
            resultId: 'analysis-result:browser-exact', runId: 'run:browser-exact',
            requestId, status: 'complete', positions: []
        };
        const selectedMoments = [{
            candidateId: 'candidate:browser-exact:1', requestId, ply: 20,
            category: 'transition', confidence: 0.9,
            reasonCodes: ['MOVER_EVALUATION_LOSS', 'PHASE_TRANSITION']
        }];
        const selection = {
            selectionId: 'critical-selection:browser-exact',
            runId: analysisResult.runId, requestId,
            selectedCount: 1, selectedMoments, incomplete: false
        };
        const mappingResult = {
            schemaVersion: '1.0.0', mappingResultId: 'knowledge-result:browser-exact',
            mappingRequestId: `knowledge:${requestId}:browser-exact`,
            knowledgeReleaseId: window.CaissaKnowledgeMappingPolicy.releaseId,
            status: 'mapped', mappings: [{
                mappingId: 'mapping:browser-exact:1',
                sourceMomentId: selectedMoments[0].candidateId, replayStepId: null,
                conceptId: 'simplification', confidence: 0.9, confidenceBand: 'high',
                reasonCodes: ['FIXTURE'],
                knowledgeUnit: window.CaissaKnowledgeMappingPolicy.units['favorable-king-ending'],
                scaffolding: { promptTemplateId: null, explanationTemplateId: null }
            }], unmappedEvidenceCount: 0, partial: false, capabilities: {}, diagnostics: {}
        };
        const exact = window.CaissaMentorSummary.generate({
            request, analysisResult, selection, replaySession: null, mappingResult
        }, { createdAt: 1 });
        const generic = window.CaissaMentorSummary.generate({
            request: { ...request, requestId: 'mrr_browsergeneric12345',
                source: { ...request.source, recordId: 'game:browser-generic' } },
            analysisResult: { ...analysisResult, resultId: 'analysis-result:browser-generic',
                runId: 'run:browser-generic', requestId: 'mrr_browsergeneric12345' },
            selection: { ...selection, selectionId: 'critical-selection:browser-generic',
                runId: 'run:browser-generic', requestId: 'mrr_browsergeneric12345',
                selectedMoments: [{ ...selectedMoments[0],
                    candidateId: 'candidate:browser-generic:1',
                    requestId: 'mrr_browsergeneric12345' }] },
            replaySession: null, mappingResult: null
        }, { createdAt: 2 });
        return { exact, generic };
    });
    expect(result.exact.ok).toBe(true);
    expect(result.exact.value.prioritizedAction.type).toBe('review-concept');
    expect(result.exact.value.prioritizedAction.knowledgeUnit.publicUrl)
        .toBe('/endgame-library?unit=endgames%2Ffavorable-king-ending');
    expect(result.generic.ok).toBe(true);
    expect(result.generic.value.prioritizedAction.knowledgeUnit).toBeNull();
});
