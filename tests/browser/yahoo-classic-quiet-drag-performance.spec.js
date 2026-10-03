import { test, expect } from '@playwright/test';
import { Chess } from 'chess.js';

const START_FEN = new Chess().fen();

function percentile(values, fraction) {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)] || 0;
}

async function openFixture(page) {
    await page.addInitScript(() => {
        localStorage.setItem('caissa_onboarding_completed', 'true');
        window.CAISSA_FICS_AUTO_GUEST_ENABLED = false;
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/yahoo-classic?quiet-drag-lab=1');
    await page.waitForFunction(() => window.CaissaYahooClassic && window.CaissaFICSClient);
    await page.evaluate(fen => {
        const section = window.CaissaYahooClassic;
        const client = window.CaissaFICSClient;
        document.getElementById('yahooClassicSection')?.classList.add('active');
        section.onEnter();
        client.sendMove = () => ({ ok: true });
        client.send = () => true;
        Object.assign(client, { connected: true, authenticated: true, connectionState: 'connected' });
        client.handleStyle12({
            fen, gameNumber: 1980, whiteName: 'BenchmarkWhite', blackName: 'BenchmarkBlack',
            relation: 1, userColor: 'w', sideToMove: 'w', lastMove: 'none',
            lastMoveVerbose: 'none', moveNumber: 1, whiteClock: 600, blackClock: 600,
            initialTime: 10, increment: 0, observedGame: false
        });
        document.getElementById('ycGameWindow')?.scrollIntoView({ block: 'center' });
    }, START_FEN);
    await page.waitForFunction(() => window.CaissaYahooClassic.getLegacyQuietDragSnapshot()
        && document.querySelectorAll('#ycClassicBoard .piece-417db').length === 32);
    await page.evaluate(() => {
        const section = window.CaissaYahooClassic;
        const tabs = name => [...section.elements.roomTabs].find(tab => tab.dataset.room === name);
        for (let index = 0; index < 10; index += 1) {
            section.selectRoom(tabs('Tournament Hall'));
            section.selectRoom(tabs('CAISSA Lobby'));
        }
    });
}

async function benchmark(page, mode) {
    const raw = await page.evaluate(async selectedMode => {
        window.CaissaLegacyQuietDragAdapter.setQaMode(selectedMode);
        const section = window.CaissaYahooClassic;
        const root = document.querySelector('#ycClassicBoard .board-b72b1');
        const source = root.querySelector('.square-e2 .piece-417db');
        if (!source) throw new Error('Benchmark source e2 is missing.');
        const sourceRect = source.getBoundingClientRect();
        const boardRect = root.querySelector('.square-55d63').getBoundingClientRect();
        const start = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
        const latencies = [];
        const frameIntervals = [];
        const separations = [];
        const longTasks = [];
        let previousFrame = 0;
        let handlerCpu = 0;
        let movementGeometryReads = 0;
        let pipelineActive = false;
        let styleMutations = 0;
        const originalRect = Element.prototype.getBoundingClientRect;
        const mutationObserver = new MutationObserver(records => {
            styleMutations += records.filter(record => record.type === 'attributes'
                && record.attributeName === 'style'
                && (record.target.classList?.contains('caissa-legacy-quiet-drag-piece')
                    || record.target.matches?.('body > .piece-417db'))).length;
        });
        const longTaskObserver = typeof PerformanceObserver === 'function'
            ? new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)))
            : null;

        const pointerId = 177;
        if (selectedMode === 'quiet') {
            source.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true,
                button: 0, buttons: 1, clientX: start.x, clientY: start.y
            }));
        } else {
            source.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true, cancelable: true, button: 0, buttons: 1,
                clientX: start.x, clientY: start.y
            }));
        }

        const warmup = { x: start.x + 8, y: start.y - 8 };
        const warmupEvent = selectedMode === 'quiet'
            ? new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId,
                pointerType: 'mouse', isPrimary: true, buttons: 1, clientX: warmup.x, clientY: warmup.y })
            : new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1,
                clientX: warmup.x, clientY: warmup.y });
        (selectedMode === 'quiet' ? root : window).dispatchEvent(warmupEvent);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const before = section.getLegacyQuietDragSnapshot();
        Element.prototype.getBoundingClientRect = function (...args) {
            if (pipelineActive) movementGeometryReads += 1;
            return originalRect.apply(this, args);
        };
        mutationObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] });
        try { longTaskObserver?.observe({ type: 'longtask' }); } catch (_) {}
        performance.mark(`caissa-yahoo-${selectedMode}-movement-start`);

        let latest = start;
        for (let frame = 1; frame <= 36; frame += 1) {
            let latestEventAt = performance.now();
            pipelineActive = true;
            const cpuStarted = performance.now();
            for (let sample = 1; sample <= 4; sample += 1) {
                const progress = (frame * 4 + sample) / 148;
                latest = {
                    x: start.x + Math.sin(progress * Math.PI * 2) * boardRect.width * 0.65,
                    y: start.y - Math.sin(progress * Math.PI) * boardRect.height * 0.35
                };
                latestEventAt = performance.now();
                const event = selectedMode === 'quiet'
                    ? new PointerEvent('pointermove', {
                        bubbles: true, cancelable: true, pointerId, pointerType: 'mouse', isPrimary: true,
                        buttons: 1, clientX: latest.x, clientY: latest.y
                    })
                    : new MouseEvent('mousemove', {
                        bubbles: true, cancelable: true, buttons: 1, clientX: latest.x, clientY: latest.y
                    });
                (selectedMode === 'quiet' ? root : window).dispatchEvent(event);
            }
            handlerCpu += performance.now() - cpuStarted;
            const frameTime = await new Promise(resolve => requestAnimationFrame(resolve));
            pipelineActive = false;
            latencies.push(Math.max(0, frameTime - latestEventAt));
            if (previousFrame) frameIntervals.push(frameTime - previousFrame);
            previousFrame = frameTime;
            const mover = selectedMode === 'quiet'
                ? root.querySelector('.caissa-legacy-quiet-drag-piece')
                : [...document.querySelectorAll('body > .piece-417db')]
                    .find(node => getComputedStyle(node).display !== 'none');
            if (mover) {
                let centerX;
                let centerY;
                if (selectedMode === 'quiet') {
                    const rect = mover.getBoundingClientRect();
                    centerX = rect.left + rect.width / 2;
                    centerY = rect.top + rect.height / 2;
                } else {
                    centerX = Number.parseFloat(mover.style.left) + sourceRect.width / 2 - scrollX;
                    centerY = Number.parseFloat(mover.style.top) + sourceRect.height / 2 - scrollY;
                }
                separations.push(Math.hypot(centerX - latest.x, centerY - latest.y));
            }
        }

        performance.mark(`caissa-yahoo-${selectedMode}-movement-end`);
        pipelineActive = true;
        const terminal = selectedMode === 'quiet'
            ? new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId,
                pointerType: 'mouse', isPrimary: true, buttons: 1, clientX: start.x, clientY: start.y })
            : new MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1,
                clientX: start.x, clientY: start.y });
        (selectedMode === 'quiet' ? root : window).dispatchEvent(terminal);
        await new Promise(resolve => requestAnimationFrame(resolve));
        pipelineActive = false;
        const up = selectedMode === 'quiet'
            ? new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId,
                pointerType: 'mouse', isPrimary: true, button: 0, buttons: 0,
                clientX: start.x, clientY: start.y })
            : new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, buttons: 0,
                clientX: start.x, clientY: start.y });
        (selectedMode === 'quiet' ? root : window).dispatchEvent(up);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        mutationObserver.takeRecords().forEach(record => {
            if (record.type === 'attributes' && record.attributeName === 'style') styleMutations += 1;
        });
        mutationObserver.disconnect();
        longTaskObserver?.disconnect();
        Element.prototype.getBoundingClientRect = originalRect;
        const after = section.getLegacyQuietDragSnapshot();
        return {
            mode: selectedMode,
            inputEvents: 145,
            visualWrites: selectedMode === 'quiet'
                ? after.movementVisualWrites - before.movementVisualWrites
                : styleMutations,
            framesRequested: selectedMode === 'quiet'
                ? after.controller.scheduler.framesRequested - before.controller.scheduler.framesRequested
                : frameIntervals.length + 1,
            movementGeometryReads,
            handlerCpuMs: handlerCpu,
            latencies,
            frameIntervals,
            separations,
            longTasks,
            listeners: after.controller.listenerCount,
            legacyInputAttached: after.legacyInput.attached
        };
    }, mode);
    return {
        mode: raw.mode,
        inputEvents: raw.inputEvents,
        visualWrites: raw.visualWrites,
        framesRequested: raw.framesRequested,
        geometryReadsDuringMove: raw.movementGeometryReads,
        forcedLayoutsDuringMove: raw.movementGeometryReads,
        movementHandlerCpuMs: Number(raw.handlerCpuMs.toFixed(3)),
        eventToVisualAverageMs: Number((raw.latencies.reduce((sum, value) => sum + value, 0)
            / raw.latencies.length).toFixed(3)),
        eventToVisualP95Ms: Number(percentile(raw.latencies, 0.95).toFixed(3)),
        frameP50Ms: Number(percentile(raw.frameIntervals, 0.5).toFixed(3)),
        frameP95Ms: Number(percentile(raw.frameIntervals, 0.95).toFixed(3)),
        temporalSeparationP95Px: Number(percentile(raw.separations, 0.95).toFixed(3)),
        longTasks: raw.longTasks.length,
        listenerCountAfterRoomCycles: raw.listeners,
        legacyInputAttached: raw.legacyInputAttached
    };
}

async function traceBenchmark(page, mode) {
    const session = await page.context().newCDPSession(page);
    const events = [];
    session.on('Tracing.dataCollected', payload => events.push(...payload.value));
    let complete;
    const completed = new Promise(resolve => { complete = resolve; });
    session.once('Tracing.tracingComplete', complete);
    await session.send('Tracing.start', {
        categories: 'devtools.timeline,toplevel,blink.user_timing',
        options: 'sampling-frequency=10000',
        transferMode: 'ReportEvents'
    });
    const metrics = await benchmark(page, mode);
    await session.send('Tracing.end');
    await completed;
    await session.detach();
    const completeEvents = events.filter(event => event.ph === 'X');
    const start = events.find(event => event.name === `caissa-yahoo-${mode}-movement-start`)?.ts || -Infinity;
    const end = events.find(event => event.name === `caissa-yahoo-${mode}-movement-end`)?.ts || Infinity;
    const movementEvents = completeEvents.filter(event => event.ts >= start && event.ts <= end);
    const count = (collection, name) => collection.filter(event => event.name === name).length;
    const durationMs = (collection, name) => collection.filter(event => event.name === name)
        .reduce((sum, event) => sum + (Number(event.dur) || 0) / 1000, 0);
    const layoutTime = durationMs(movementEvents, 'Layout');
    const styleTime = durationMs(movementEvents, 'UpdateLayoutTree');
    const paintTime = durationMs(movementEvents, 'Paint');
    return {
        ...metrics,
        movementPipelineMainThreadMs: Number((metrics.movementHandlerCpuMs
            + layoutTime + styleTime + paintTime).toFixed(3)),
        trace: {
            forcedLayouts: count(movementEvents, 'Layout'),
            styleRecalculations: count(movementEvents, 'UpdateLayoutTree'),
            paints: count(movementEvents, 'Paint'),
            forcedLayoutTimeMs: Number(layoutTime.toFixed(3)),
            styleRecalculationTimeMs: Number(styleTime.toFixed(3)),
            paintTimeMs: Number(paintTime.toFixed(3)),
            mainThreadTaskTimeMs: Number(durationMs(movementEvents, 'RunTask').toFixed(3))
        }
    };
}

test('Yahoo Legacy vs Quiet Drag performance certification', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium is the certified performance trace target.');
    await openFixture(page);
    const legacy = await traceBenchmark(page, 'legacy');
    await page.evaluate(fen => {
        const client = window.CaissaFICSClient;
        client.pendingMove = null;
        client.handleStyle12({
            fen, gameNumber: 1981, whiteName: 'BenchmarkWhite', blackName: 'BenchmarkBlack',
            relation: 1, userColor: 'w', sideToMove: 'w', lastMove: 'none',
            lastMoveVerbose: 'none', moveNumber: 1, whiteClock: 600, blackClock: 600,
            initialTime: 10, increment: 0, observedGame: false
        });
    }, START_FEN);
    await page.waitForFunction(() => document.querySelector('#ycClassicBoard .square-e2 .piece-417db'));
    await page.waitForTimeout(120);
    const quiet = await traceBenchmark(page, 'quiet');
    console.log('[QUIET DRAG PHASE 2B YAHOO PERFORMANCE]', JSON.stringify({ legacy, quiet }));
    expect(quiet.visualWrites).toBeLessThanOrEqual(quiet.framesRequested);
    expect(quiet.geometryReadsDuringMove).toBe(0);
    expect(quiet.forcedLayoutsDuringMove).toBe(0);
    expect(quiet.trace.forcedLayouts).toBe(0);
    expect(quiet.longTasks).toBe(0);
    expect(quiet.listenerCountAfterRoomCycles).toBe(5);
    expect(quiet.legacyInputAttached).toBe(false);
});
