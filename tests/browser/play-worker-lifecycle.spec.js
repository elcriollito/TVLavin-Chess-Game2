import { test, expect } from '@playwright/test';
import { instrumentPlay, openPlay } from '../play/playwright-helpers.js';

test('QA Play loads the lifecycle contract and mode changes retain one Play worker', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const proof = await page.evaluate(() => {
        const before = window.__caissaPlayHarness.snapshot();
        const engine = window.App.engine;
        const api = window.CaissaWorkerLifecycle;
        for (const mode of ['bots', 'coach', 'games', 'players', 'games']) {
            history.replaceState({}, '', `/?section=play&playMode=${mode}&simplifiedPlay=1`);
            window.dispatchEvent(new PopStateEvent('popstate'));
        }
        const after = window.__caissaPlayHarness.snapshot();
        return {
            version: api?.VERSION,
            immutable: Object.isFrozen(api),
            engineSame: engine === window.App.engine,
            workersBefore: before.workersCreated,
            workersAfter: after.workersCreated,
            contexts: api?.inspect()
        };
    });
    expect(proof).toMatchObject({
        version: '1.0.0', immutable: true, engineSame: true,
        workersBefore: 1, workersAfter: 1, contexts: []
    });
});

test('owner-scoped lifecycle disposal leaves independent contexts alive and no orphan', async ({ page }) => {
    await instrumentPlay(page, { autoReply: false });
    await openPlay(page);
    const proof = await page.evaluate(async () => {
        const service = window.CaissaWorkerLifecycle.createService();
        const create = owner => {
            let hooks;
            let terminated = 0;
            service.createContext({
                contextId: `${owner}-fixture`, owner, source: 'test-transport',
                transportFactory: supplied => {
                    hooks = supplied;
                    return {
                        send(command) {
                            if (command.type === 'uci') queueMicrotask(() => hooks.onMessage({ type: 'uciok' }));
                            if (command.type === 'isready') queueMicrotask(() => hooks.onMessage({ type: 'readyok' }));
                        },
                        terminate() { terminated += 1; },
                        detach() {}
                    };
                }
            });
            return () => terminated;
        };
        const counts = {};
        for (const owner of ['play', 'analyze', 'arena', 'mentor-analysis']) {
            counts[owner] = create(owner);
            await service.initialize(`${owner}-fixture`);
        }
        service.disposeAll('play');
        const isolated = Object.fromEntries(service.inspect().map(x => [x.owner, x.state]));
        service.disposeAll();
        return {
            isolated,
            final: service.inspect().map(x => x.state),
            terminations: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, value()])),
            rawWorkerExposed: service.inspect().some(x => 'worker' in x)
        };
    });
    expect(proof.isolated).toEqual({
        play: 'disposed', analyze: 'ready', arena: 'ready', 'mentor-analysis': 'ready'
    });
    expect(proof.final.every(state => state === 'disposed')).toBe(true);
    expect(proof.terminations).toEqual({ play: 1, analyze: 1, arena: 1, 'mentor-analysis': 1 });
    expect(proof.rawWorkerExposed).toBe(false);
});
