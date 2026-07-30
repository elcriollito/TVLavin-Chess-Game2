import { test, expect } from '@playwright/test';
import { instrumentPlay } from '../play/playwright-helpers.js';

test.beforeEach(async ({ page }) => instrumentPlay(page, { autoReply: false }));

async function complete(page, route, startSelector) {
    await page.goto(`${route}?simplified=1`);
    await page.locator(startSelector).click();
    await page.evaluate(() => { window.confirm = () => true; window.resignGame(); });
    await expect(page.locator('.caissa-post-game')).toBeVisible();
    await page.locator('[data-post-game-action="mentor-review"]').click();
    await expect.poll(() => page.evaluate(() =>
        window.CaissaPostGameExperienceInstance.getSnapshot().mentor.request?.requestId)).toBeTruthy();
}

for (const scenario of [
    { name: 'Games', route: '/play/games', start: '[data-games-primary]' },
    { name: 'Bot', route: '/play/bots', start: '[data-bot-primary]' },
    { name: 'Coach', route: '/play/coach', start: '[data-coach-primary]' }
]) {
    test(`${scenario.name} request prepares and completes one deterministic technical pipeline run`, async ({ page }) => {
        await complete(page, scenario.route, scenario.start);
        const proof = await page.evaluate(async () => {
            const postGame = window.CaissaPostGameExperienceInstance;
            const preparedByPostGame = postGame.prepareTechnicalAnalysis();
            const requestId = postGame.getSnapshot().mentor.request.requestId;
            const engine = {
                analyze: async position => ({ ok: true, reasonCode: 'ENGINE_RESULT', value: {
                    score: position.ply % 2 ? 0.2 : -0.1, mate: null, pv: ['e2e4'],
                    depth: 8, nodes: 100, bestMove: 'e2e4', elapsedMs: 1
                } }),
                cancel: () => ({ ok: true }), dispose: () => ({ ok: true }),
                inspect: () => ({ activeSearches: 0, engineInstances: 0, workerPoolSize: 0 })
            };
            const pipeline = window.CaissaEducationalAnalysisPipeline.create({ engine });
            const prepared = pipeline.prepare(requestId);
            const completed = await pipeline.start(prepared.value.runId);
            return {
                preparedByPostGame, completed, result: pipeline.getResult(prepared.value.runId),
                postGame: postGame.getSnapshot(), pipeline: pipeline.inspect(),
                resources: window.__playTestInstrumentation?.snapshot?.() || null,
                boards: document.querySelectorAll('#chessboard').length, url: location.href
            };
        });
        expect(proof.preparedByPostGame.status).toBe('prepared');
        expect(proof.completed.status).toBe('completed');
        expect(proof.completed.value.progress.percentage).toBe(100);
        expect(proof.result.capabilities).toEqual({
            criticalMoments: false, errorClassification: false, knowledgeMapping: false,
            mentorExplanation: false, recommendations: false
        });
        expect(JSON.stringify(proof.result)).not.toMatch(/moveGrade|mentorText|strengths|weaknesses/i);
        expect(proof.postGame.mentor.analysisRun.status).toBe('prepared');
        expect(proof.boards).toBe(1);
        expect(proof.pipeline.storageWrites).toBe(0);
        expect(proof.url).not.toMatch(/(?:pgn|fen)=/i);
    });
}

test('imported boundary, cancellation, timeout and stale completion remain isolated from Analyze', async ({ page }) => {
    await page.goto('/play/games?simplified=1');
    const proof = await page.evaluate(async () => {
        await window.CaissaPlayLazyLoader.load('mentor-analysis', { qa: true });
        const options = {
            mentorId: 'academyMentorCaissa', playerLevel: 'novice', focus: 'general',
            analysisDepth: 'quick', criticalMomentLimit: 3, explanationStyle: 'balanced',
            knowledgeReleaseId: window.CaissaMentorCapabilities.releaseId
        };
        const made = window.CaissaMentorReviewRequest.fromAnalyzeSession({
            analyzeSessionId: 'analyze-session:browser-fixture', imported: true
        }, options);
        const request = window.CaissaMentorReviewRequestRegistry.register(made).value;
        const imported = Object.freeze({ analyzeSessionId: 'analyze-session:browser-fixture',
            imported: true, moves: ['e4', 'e5'], pgn: '1. e4 e5 *', result: '*',
            initialFen: null, mode: 'analysis' });
        let release;
        const delayed = {
            analyze: () => new Promise(resolve => { release = resolve; }),
            cancel: () => { release?.({ ok: false, reasonCode: 'RUN_CANCELED' }); return { ok: true }; },
            dispose: () => ({ ok: true }), inspect: () => ({ activeSearches: 0, workerPoolSize: 0 })
        };
        const pipeline = window.CaissaEducationalAnalysisPipeline.create({
            engine: delayed,
            importedSourceResolver: id => ({ ok: id === imported.analyzeSessionId, value: imported })
        });
        const prepared = pipeline.prepare(request.requestId);
        const starting = pipeline.start(prepared.value.runId);
        const canceled = pipeline.cancel(prepared.value.runId, 'user');
        const stale = await starting;
        const timeoutPipeline = window.CaissaEducationalAnalysisPipeline.create({
            engine: {
                analyze: async () => ({ ok: false, reasonCode: 'ENGINE_TIMEOUT' }),
                cancel: () => ({ ok: true }), dispose: () => ({ ok: true }),
                inspect: () => ({ activeSearches: 0, workerPoolSize: 0 })
            },
            importedSourceResolver: () => ({ ok: true, value: imported })
        });
        const timeoutPrepared = timeoutPipeline.prepare(request.requestId);
        const timed = await timeoutPipeline.start(timeoutPrepared.value.runId);
        return {
            canceled, stale, timed, url: location.href,
            analyzeBoard: !!window.CaissaAnalyzeSection?.board,
            play: window.__playTestInstrumentation?.snapshot?.() || null
        };
    });
    expect(proof.canceled.status).toBe('canceled');
    expect(proof.stale.status).toBe('canceled');
    expect(proof.timed.status).toBe('timed-out');
    expect(proof.analyzeBoard).toBe(false);
    expect(proof.url).not.toMatch(/(?:pgn|fen)=/i);
});
