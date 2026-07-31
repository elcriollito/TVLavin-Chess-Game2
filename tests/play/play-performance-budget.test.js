import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function load() {
    const context={globalThis:null,window:null,performance:{now:()=>10,getEntriesByType:()=>[]},document:{getElementsByTagName:()=>({length:4}),querySelectorAll:()=>({length:1})}};
    context.globalThis=context;context.window=context;
    for(const file of ['js/play/performance/play-performance-contracts.js','js/play/performance/play-performance-budget.js','js/play/performance/play-performance-probe.js'])
        vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
    return context;
}

test('contracts publish the complete immutable metric vocabulary',()=>{
    const C=load().CaissaPlayPerformanceContracts;
    assert.equal(C.VERSION,'1.0.0');
    assert.equal(Object.keys(C.METRICS).length,34);
    assert.ok(Object.isFrozen(C.METRICS));
    for(const id of ['first-board-render-ms','mobile-js-heap-bytes','play-worker-count','cumulative-layout-shift'])assert.equal(C.validId(id),true);
    assert.equal(C.validId('__proto__'),false);
});

test('budgets are measured, versioned, bounded, and unsupported is honest',()=>{
    const B=load().CaissaPlayPerformanceBudget;
    assert.equal(B.getBudget('initial-script-bytes').baseline,1594427);
    assert.equal(B.getBudget('mobile-js-heap-bytes').status,'unavailable');
    assert.equal(B.getBudget('mobile-js-heap-bytes').reliability,'unsupported');
    assert.equal(B.getBudget('unknown'),null);
    assert.ok(Object.isFrozen(B.getSnapshot()));
});

test('evaluator distinguishes pass, warning, fail, and hard invariants',()=>{
    const B=load().CaissaPlayPerformanceBudget;
    assert.equal(B.evaluate('initial-script-count',85).status,'pass');
    assert.equal(B.evaluate('initial-script-count',110).status,'warning');
    assert.equal(B.evaluate('initial-script-count',200).status,'fail');
    assert.equal(B.evaluate('mobile-js-heap-bytes',1).status,'unsupported');
    assert.equal(B.evaluate('board-count',1).status,'pass');
    assert.equal(B.evaluate('board-count',2).status,'fail');
    assert.equal(B.evaluateAll({'listener-growth':0,'active-timers':0,'active-observers':0,'live-region-count':2}).releaseBlocked,false);
});

test('probe records marks, measures, resources, and detached snapshots',()=>{
    const P=load().CaissaPlayPerformanceProbe;
    const start=P.mark('first-board-render-ms');
    assert.equal(P.measure('first-board-render-ms',start,start+5).value,5);
    const snapshot=P.getSnapshot();
    assert.equal(snapshot.domNodes,4);
    assert.equal(snapshot.boards,1);
    assert.ok(Object.isFrozen(snapshot));
    assert.equal(P.dispose().diagnostics.observers,0);
    assert.throws(()=>P.mark('first-board-render-ms'),/INVALID_MARK/);
});

test('static boundary excludes telemetry, product ownership, and dependencies',()=>{
    const sources=['js/play/performance/play-performance-contracts.js','js/play/performance/play-performance-budget.js','js/play/performance/play-performance-probe.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
    for(const forbidden of ['fetch(','XMLHttpRequest','WebSocket','localStorage','sessionStorage','new Worker','CaissaFairPlay','navigate(','innerHTML'])assert.equal(sources.includes(forbidden),false,forbidden);
    const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
    assert.equal(pkg.scripts['test:play:performance-budget'].includes('play-performance-budget'),true);
});

test('both SPA pages register performance assets once in dependency order',()=>{
    for(const file of ['index.html','yahoo-classic.html']){
        const html=fs.readFileSync(file,'utf8');
        for(const name of ['play-performance-contracts.js','play-performance-budget.js','play-performance-probe.js'])assert.equal(html.split(name).length-1,1);
        assert.ok(html.indexOf('play-performance-contracts.js')<html.indexOf('play-performance-budget.js'));
        assert.ok(html.indexOf('play-performance-budget.js')<html.indexOf('play-performance-probe.js'));
    }
});
