import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const contracts=fs.readFileSync(new URL('../../js/play/performance/event-lifecycle-contracts.js',import.meta.url),'utf8');
const lifecycle=fs.readFileSync(new URL('../../js/play/performance/event-lifecycle.js',import.meta.url),'utf8');
function fixture(){
    let timerId=0;const timers=new Map();
    const context=vm.createContext({globalThis:null,window:null,document:{},Date,
        setTimeout(fn){const id=++timerId;timers.set(id,['timeout',fn]);return id;},
        clearTimeout(id){timers.delete(id);},setInterval(fn){const id=++timerId;timers.set(id,['interval',fn]);return id;},
        clearInterval(id){timers.delete(id);}});
    context.globalThis=context;context.window=context;
    new vm.Script(contracts).runInContext(context);new vm.Script(lifecycle).runInContext(context);
    return {api:context.CaissaEventLifecycle,timers};
}
class Target{constructor(){this.records=[];}addEventListener(type,handler,options){this.records.push({type,handler,options});}removeEventListener(type,handler){this.records=this.records.filter(r=>r.type!==type||r.handler!==handler);}emit(type){this.records.filter(r=>r.type===type).forEach(r=>r.handler());}}

test('contract and lifecycle snapshots are versioned, bounded, immutable and payload-free',()=>{
    const {api}=fixture(),scope=api.createScope({owner:'shell'});
    assert.equal(api.VERSION,'1.0.0');assert.equal(scope.state,'active');assert.equal(Object.isFrozen(scope),true);
    assert.throws(()=>api.createScope({owner:'unknown'}),/INVALID_OWNER/);
    assert.doesNotMatch(JSON.stringify(api.inspect()),/handler|target":/);
});
test('duplicate listener registration reuses identity and invokes once',()=>{
    const {api}=fixture(),scope=api.createScope({owner:'panel'}),target=new Target();let calls=0;const handler=()=>calls++;
    const first=api.add(scope.scopeId,target,'click',handler),second=api.add(scope.scopeId,target,'click',handler);
    assert.equal(first.listenerId,second.listenerId);assert.equal(second.duplicate,true);target.emit('click');assert.equal(calls,1);
    assert.equal(api.inspect().duplicateSuppressions,1);
});
test('scoped removal and repeated disposal are isolated and terminal',()=>{
    const {api}=fixture(),a=api.createScope({owner:'shell'}),b=api.createScope({owner:'panel'}),target=new Target();
    api.add(a.scopeId,target,'click',()=>{});api.add(b.scopeId,target,'change',()=>{});
    assert.equal(api.disposeScope(a.scopeId).listeners[0].active,false);assert.equal(api.inspect().activeListeners,1);
    assert.equal(api.disposeScope(a.scopeId).state,'disposed');assert.throws(()=>api.add(a.scopeId,target,'click',()=>{}),/SCOPE_NOT_ACTIVE/);
});
test('timers clear, observers disconnect, and stale callbacks cannot execute',()=>{
    const {api,timers}=fixture(),scope=api.createScope({owner:'test'});let calls=0,disconnects=0;
    api.addTimeout(scope.scopeId,()=>calls++,20);api.addInterval(scope.scopeId,()=>calls++,20);
    api.trackObserver(scope.scopeId,{disconnect(){disconnects++;}});
    assert.equal(api.inspect().activeTimers,2);assert.equal(api.inspect().activeObservers,1);
    api.disposeScope(scope.scopeId);assert.equal(timers.size,0);assert.equal(disconnects,1);assert.equal(calls,0);
    assert.equal(api.inspect().activeTimers,0);assert.equal(api.inspect().activeObservers,0);
});
test('static guardrails exclude routing, game, Worker, storage, arbitrary selectors and fixtures',()=>{
    const text=contracts+'\n'+lifecycle;
    assert.doesNotMatch(text,/new\s+Worker|pushState|replaceState|localStorage|sessionStorage|querySelector|innerHTML|fixture/i);
});
test('entry points register lifecycle once before the shell and protected architecture stays untouched',()=>{
    for(const page of ['index.html','yahoo-classic.html']){
        const html=fs.readFileSync(new URL(`../../${page}`,import.meta.url),'utf8');
        assert.equal((html.match(/event-lifecycle\.js/g)||[]).length,1);
        assert.ok(html.indexOf('event-lifecycle.js')<html.indexOf('simplified-play-shell.js'));
    }
});
