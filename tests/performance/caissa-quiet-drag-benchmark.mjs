import { chromium } from '@playwright/test';

const cases = [
    { label: 'before', url: process.env.CAISSA_QUIET_DRAG_BEFORE_URL },
    { label: 'after', url: process.env.CAISSA_QUIET_DRAG_AFTER_URL }
].filter(entry => entry.url);

if (cases.length !== 2) {
    throw new Error('Set CAISSA_QUIET_DRAG_BEFORE_URL and CAISSA_QUIET_DRAG_AFTER_URL.');
}

function percentile(values, fraction) {
    if (!values.length) return 0;
    const ordered = [...values].sort((a, b) => a - b);
    return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

async function measure(browser, entry) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');
    await page.goto(entry.url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.caissaBoardReady === true);

    await page.evaluate(() => {
        const root = window.caissaBoardHarness.root();
        const piece = window.caissaBoardHarness.pieceNode('e2');
        const nativeRect = Element.prototype.getBoundingClientRect;
        const counters = {
            boardReads: 0,
            pieceReads: 0,
            styleWrites: 0,
            longTasks: [],
            frameIntervals: []
        };
        Element.prototype.getBoundingClientRect = function patchedRect() {
            if (this === root) counters.boardReads += 1;
            if (this === piece) counters.pieceReads += 1;
            return nativeRect.call(this);
        };
        const mutationObserver = new MutationObserver(records => {
            counters.styleWrites += records.filter(record => record.target === piece && record.attributeName === 'style').length;
        });
        mutationObserver.observe(piece, { attributes: true, attributeFilter: ['style'] });
        const longTaskObserver = new PerformanceObserver(list => {
            counters.longTasks.push(...list.getEntries().map(item => item.duration));
        });
        try { longTaskObserver.observe({ type: 'longtask', buffered: true }); } catch (_) {}
        let previous = performance.now();
        let running = true;
        const sampleFrame = now => {
            counters.frameIntervals.push(now - previous);
            previous = now;
            if (running) requestAnimationFrame(sampleFrame);
        };
        requestAnimationFrame(sampleFrame);
        window.__quietDragBenchmark = {
            counters,
            stop() {
                running = false;
                mutationObserver.disconnect();
                longTaskObserver.disconnect();
                Element.prototype.getBoundingClientRect = nativeRect;
            }
        };
    });

    const metricsBefore = await session.send('Performance.getMetrics');
    const result = await page.evaluate(async () => {
        const api = window.caissaBoardHarness;
        const root = api.root();
        const piece = api.pieceNode('e2');
        const rect = piece.getBoundingClientRect();
        const start = { x: rect.left + rect.width * 0.27, y: rect.top + rect.height * 0.68 };
        const end = { x: start.x + rect.width * 0.7, y: start.y - rect.height * 2.05 };
        const pointer = (type, x, y, buttons) => root.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 41,
            pointerType: 'mouse',
            isPrimary: true,
            button: type === 'pointerdown' ? 0 : -1,
            buttons,
            clientX: x,
            clientY: y
        }));
        pointer('pointerdown', start.x, start.y, 1);
        const readsAfterStart = {
            board: window.__quietDragBenchmark.counters.boardReads,
            piece: window.__quietDragBenchmark.counters.pieceReads
        };
        const handlerDurations = [];
        const count = 180;
        for (let index = 1; index <= count; index += 1) {
            const progress = index / count;
            const x = start.x + (end.x - start.x) * progress;
            const y = start.y + (end.y - start.y) * progress + Math.sin(progress * Math.PI * 6) * 18;
            const began = performance.now();
            pointer('pointermove', x, y, 1);
            handlerDurations.push(performance.now() - began);
            await new Promise(resolve => setTimeout(resolve, 2));
        }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const presentation = {
            draggingPieces: root.querySelectorAll('.caissa-board__piece[data-dragging="true"]').length,
            sourcePieces: root.querySelectorAll('.caissa-board__piece[data-square="e2"]:not([data-dragging="true"])').length,
            transform: piece.style.transform
        };
        const readsAfterMoves = {
            board: window.__quietDragBenchmark.counters.boardReads,
            piece: window.__quietDragBenchmark.counters.pieceReads
        };
        pointer('pointercancel', end.x, end.y, 0);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rendererMetrics = api.getMetrics().renderer?.quietDrag || null;
        window.__quietDragBenchmark.stop();
        return {
            inputEvents: count,
            handlerDurations,
            readsAtStart: readsAfterStart,
            geometryReadsDuringMove: (readsAfterMoves.board - readsAfterStart.board)
                + (readsAfterMoves.piece - readsAfterStart.piece),
            presentation,
            rendererMetrics,
            counters: window.__quietDragBenchmark.counters
        };
    });
    const metricsAfter = await session.send('Performance.getMetrics');
    await page.close();

    const beforeMap = new Map(metricsBefore.metrics.map(item => [item.name, item.value]));
    const afterMap = new Map(metricsAfter.metrics.map(item => [item.name, item.value]));
    const delta = name => (afterMap.get(name) || 0) - (beforeMap.get(name) || 0);
    const frameIntervals = result.counters.frameIntervals.filter(value => value < 100);
    return {
        label: entry.label,
        inputEvents: result.inputEvents,
        visualWrites: result.rendererMetrics?.scheduler?.visualWrites ?? result.counters.styleWrites,
        observedStyleWrites: result.counters.styleWrites,
        geometryReadsAtStart: result.rendererMetrics?.geometryReadsAtStart
            ?? (result.readsAtStart.board + result.readsAtStart.piece),
        geometryReadsDuringMove: result.rendererMetrics?.geometryReadsDuringMove
            ?? result.geometryReadsDuringMove,
        movementHandlerCpuMs: Number(result.handlerDurations.reduce((sum, value) => sum + value, 0).toFixed(3)),
        movementHandlerP95Ms: Number(percentile(result.handlerDurations, 0.95).toFixed(3)),
        mainThreadTaskMs: Number((delta('TaskDuration') * 1000).toFixed(3)),
        scriptMs: Number((delta('ScriptDuration') * 1000).toFixed(3)),
        layoutMs: Number((delta('LayoutDuration') * 1000).toFixed(3)),
        styleRecalcMs: Number((delta('RecalcStyleDuration') * 1000).toFixed(3)),
        forcedLayouts: Math.round(delta('LayoutCount')),
        styleRecalculations: Math.round(delta('RecalcStyleCount')),
        frameP95Ms: Number(percentile(frameIntervals, 0.95).toFixed(3)),
        frameP99Ms: Number(percentile(frameIntervals, 0.99).toFixed(3)),
        longTasks: result.counters.longTasks.length,
        maxLongTaskMs: Number(Math.max(0, ...result.counters.longTasks).toFixed(3)),
        onePieceVisible: result.presentation.draggingPieces === 1 && result.presentation.sourcePieces === 0,
        transformUsed: result.presentation.transform.startsWith('translate3d(')
    };
}

const browser = await chromium.launch({ headless: true });
try {
    const report = [];
    for (const entry of cases) report.push(await measure(browser, entry));
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser.close();
}
