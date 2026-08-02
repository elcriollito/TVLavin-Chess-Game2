import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function source(name) {
    return readFile(new URL(`../../js/play/performance/${name}`, import.meta.url), 'utf8');
}
async function loadContext() {
    const appended = [];
    let context;
    const head = { appendChild(node) {
        appended.push(node);
        const path = node.src || node.href || '';
        if (path.includes('bots-panel')) context.CaissaBotsPanel = { create() {} };
        if (path.includes('coach-panel')) context.CaissaCoachPanel = { create() {} };
        if (path.includes('mentor-foundation')) context.CaissaMentorFoundation = { createRequest() {} };
        if (path.includes('educational-analysis-pipeline')) context.CaissaEducationalAnalysisPipeline = { prepare() {} };
        if (path.includes('critical-moment-selector')) context.CaissaCriticalMoments = { select() {} };
        if (path.includes('mentor-guided-replay')) context.CaissaMentorGuidedReplay = { prepare() {} };
        if (path.includes('guided-replay-view')) context.CaissaGuidedReplayView = { mount() {} };
        if (path.includes('educational-concept-mapper')) context.CaissaEducationalConceptMapper = { map() {} };
        if (path.includes('knowledge-mapping-registry')) context.CaissaKnowledgeMappingRegistry = { register() {} };
        if (path.includes('mentor-summary.js')) context.CaissaMentorSummary = { generate() {} };
        if (path.includes('analyze-session')) context.CaissaAnalyzeSession = { createSession() {} };
        if (path.includes('analyze-section')) context.AnalyzeSection = { onEnter() {} };
        queueMicrotask(() => node.onload?.());
    } };
    const document = {
        currentScript: { src: 'https://caissa.test/js/play/performance/play-lazy-loader.js' },
        createElement(tag) { return { tagName: tag.toUpperCase(), dataset: {} }; },
        querySelectorAll() { return []; }, head
    };
    context = vm.createContext({ globalThis: null, window: null, document, location: { href: 'https://caissa.test/play/games', origin: 'https://caissa.test' }, URL, Date, queueMicrotask });
    context.globalThis = context; context.window = context;
    new vm.Script(await readFile(new URL('../../js/play/play-v2-fics-isolation.js', import.meta.url), 'utf8')).runInContext(context);
    for (const name of ['play-lazy-load-contracts.js','play-load-registry.js','play-prefetch-policy.js','play-lazy-loader.js'])
        new vm.Script(await source(name), { filename: name }).runInContext(context);
    return { context, appended };
}

test('contracts are versioned, immutable, bounded, hostile-safe and cycle transitions fail closed', async () => {
    const { context } = await loadContext(); const c = context.CaissaPlayLazyLoadContracts;
    assert.equal(c.VERSION, '1.0.0'); assert.equal(c.STATES.length, 8);
    assert.equal(c.canTransition('registered','loading'), true);
    assert.equal(c.canTransition('disposed','loading'), false);
    assert.throws(() => c.snapshot({ resourceId: '__proto__' }));
    assert.throws(() => c.snapshot({ schemaVersion: '2.0.0', resourceId: 'bots-stack' }));
    assert.equal(Object.isFrozen(c.snapshot({ resourceId: 'bots-stack' })), true);
    assert.equal(c.validateGraph([{resourceId:'a',dependencies:['b']},{resourceId:'b',dependencies:[]}]),true);
    assert.throws(()=>c.validateGraph([{resourceId:'a',dependencies:['a']}]),/DEPENDENCY_CYCLE/);
    assert.throws(()=>c.validateGraph([{resourceId:'a',dependencies:['missing']}]),/MISSING_DEPENDENCY/);
});

test('production registry is fixed, ordered, QA-bounded, and contains no fixture', async () => {
    const { context } = await loadContext(); const definitions=context.CaissaPlayLoadRegistry.definitions();
    assert.equal(JSON.stringify(definitions.map(x=>x.resourceId)), JSON.stringify([
        'bots-stack','coach-stack','mentor-foundation','mentor-analysis',
        'mentor-critical-moments','mentor-guided-replay','mentor-knowledge','mentor-summary','analyze-deep'
    ]));
    assert.equal(definitions.filter(x=>x.resourceId!=='analyze-deep')
        .every(x=>Object.isFrozen(x)&&x.qaOnly&&!x.productionEligible), true);
    assert.equal(definitions.find(x=>x.resourceId==='analyze-deep').productionEligible, true);
    assert.equal(JSON.stringify(definitions).includes('fixture'), false);
    assert.equal(definitions.some(x=>x.resourceId==='players-stack'), false);
});

test('duplicate loads reuse one promise and sequential scripts become loaded once', async () => {
    const { context, appended } = await loadContext(); const loader=context.CaissaPlayLazyLoader;
    const first=loader.load('bots-stack',{qa:true}), second=loader.load('bots-stack',{qa:true});
    assert.equal(first,second); const loaded=await first;
    assert.equal(loaded.state,'loaded'); assert.equal(appended.length,8);
    await loader.load('bots-stack',{qa:true}); assert.equal(appended.length,8);
    assert.equal(loader.inspect().peakConcurrentLoads,1);
});

test('QA denial, save-data suppression, unknown IDs, and disposal are truthful', async () => {
    const { context } = await loadContext(); const loader=context.CaissaPlayLazyLoader;
    await assert.rejects(loader.load('players-stack',{qa:true}),/UNKNOWN_RESOURCE/);
    assert.equal((await loader.prefetch('coach-stack',{qa:true,saveData:true,intent:'idle'})).status,'suppressed');
    await assert.rejects(loader.load('missing',{qa:true}),/UNKNOWN_RESOURCE/);
    const disposed=loader.dispose(); assert.equal(disposed.disposed,true);
    await assert.rejects(loader.load('bots-stack',{qa:true}),/LOADER_DISPOSED/);
});

test('static guardrails exclude Worker, routing, storage, eval, arbitrary imports and external assets', async () => {
    const all=(await Promise.all(['play-lazy-load-contracts.js','play-load-registry.js','play-prefetch-policy.js','play-lazy-loader.js'].map(source))).join('\n');
    assert.doesNotMatch(all, /\bnew\s+Worker\b|\beval\s*\(|localStorage|sessionStorage|pushState|replaceState|import\s*\(/);
    assert.doesNotMatch(all, /lichess|chess\.com|https:\/\/(?!caissa\.test)/i);
});

test('entry points keep critical resources eager and deferred groups out of executable script tags', async () => {
    for(const page of ['index.html','yahoo-classic.html']){
        const html=await readFile(new URL(`../../${page}`,import.meta.url),'utf8');
        for(const critical of ['chessboard-adapter.js','evaluation-rail.js','games-panel.js','play-lazy-loader.js','simplified-play-shell.js']) assert.equal(html.includes(critical),true);
        assert.doesNotMatch(html,/<script src="js\/play\/(?:bots\/|coach\/|players\/(?:presence|player-presence|challenge|human-play)|bots-panel|coach-panel|players-panel)/);
    }
});
