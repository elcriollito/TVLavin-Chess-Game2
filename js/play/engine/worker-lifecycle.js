(function(root, factory) {
    const api = factory(root.CaissaWorkerLifecycleContracts, root.CaissaWorkerFallbackPolicy);
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CaissaWorkerLifecycle = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function(Contracts, Fallback) {
    'use strict';
    if (!Contracts && typeof require === 'function') Contracts=require('./worker-lifecycle-contracts.js');
    if (!Fallback && typeof require === 'function') Fallback=require('./worker-fallback-policy.js');
    function createService(options={}) {
        const contexts=new Map(), clock=options.clock||Date.now, setTimer=options.setTimer||setTimeout, clearTimer=options.clearTimer||clearTimeout;
        const initTimeout=Math.max(50,Number(options.initTimeoutMs)||8000), requestTimeout=Math.max(50,Number(options.requestTimeoutMs)||30000);
        const fallback=options.fallbackPolicy||Fallback.create(); let sequence=0;
        const snap=e=>Contracts.normalizeContext({...e.data,diagnostics:e.diagnostics});
        const get=id=>{const e=contexts.get(id);if(!e)throw new Error('Unknown worker context');return e;};
        const patch=(e,p)=>{e.data={...e.data,...p};return snap(e);};
        const move=(e,state)=>{if(e.data.state===state)return snap(e);if(!Contracts.canTransition(e.data.state,state))throw new Error(`Invalid worker transition: ${e.data.state} -> ${state}`);return patch(e,{state});};
        const id=prefix=>`${prefix}-${sequence=sequence>=999999?1:sequence+1}`;
        function clear(e,key){if(e.timers[key]){clearTimer(e.timers[key]);e.timers[key]=null;e.diagnostics.timers--;}}
        function timer(e,key,fn,ms){clear(e,key);e.diagnostics.timers++;e.timers[key]=setTimer(()=>{e.timers[key]=null;e.diagnostics.timers--;fn();},ms);}
        function detach(e){e.transport?.detach?.();e.transport=null;e.diagnostics.listeners=0;}
        function kill(e){detach(e);e.controls?.terminate?.();e.controls=null;e.diagnostics.terminations++;}
        function reject(e,error){if(!e.active)return;clear(e,'request');e.active.reject(error);e.active=null;patch(e,{activeRequestId:null,activeSearchId:null});}
        function createContext(input={}) {
            const data=Contracts.normalizeContext(input); if(contexts.has(data.contextId))throw new Error('Duplicate worker context');
            if(typeof input.transportFactory!=='function')throw new TypeError('Controlled transport factory required');
            contexts.set(data.contextId,{data,factory:input.transportFactory,transport:null,controls:null,initPromise:null,resolve:null,reject:null,active:null,queued:null,paused:null,timers:{init:null,request:null},diagnostics:{listeners:0,timers:0,queuedRequests:0,staleResponses:0,terminations:0}});
            return data;
        }
        function initialize(contextId) {
            const e=get(contextId); if(e.initPromise)return e.initPromise;
            if(['terminated','disposed'].includes(e.data.state))return Promise.reject(new Error('Terminal worker context'));
            move(e,'loading'); const generation=e.data.workerGeneration+1; patch(e,{workerGeneration:generation,initializedAt:clock(),fallbackState:'none'});
            e.initPromise=new Promise((resolve,reject)=>{e.resolve=resolve;e.reject=reject;});
            try {
                const t=e.factory({generation,onMessage:m=>receive(contextId,generation,m),onError:()=>fail(contextId,generation,'worker-error'),onMessageError:()=>fail(contextId,generation,'message-error')});
                if(!t||typeof t.send!=='function'||typeof t.terminate!=='function')throw new TypeError('Invalid controlled transport');
                e.transport=t;e.controls={send:t.send.bind(t),terminate:t.terminate.bind(t)};e.diagnostics.listeners=3;
                move(e,'initializing');e.controls.send(Object.freeze({type:'uci'}));timer(e,'init',()=>fail(contextId,generation,'init-timeout'),initTimeout);
            } catch(error) { fail(contextId,generation,'constructor-failure',error); }
            return e.initPromise;
        }
        function receive(contextId,generation,event) {
            const e=get(contextId);if(generation!==e.data.workerGeneration||['terminated','disposed'].includes(e.data.state)){e.diagnostics.staleResponses++;return false;}
            if(event?.type==='uciok'&&e.data.state==='initializing'){e.controls.send(Object.freeze({type:'isready'}));return true;}
            if(event?.type==='readyok'&&e.data.state==='initializing'){clear(e,'init');move(e,'ready');patch(e,{readyAt:clock()});e.resolve?.(snap(e));e.resolve=e.reject=null;return true;}
            if(!e.active||event?.requestId!==e.active.id||event?.searchId!==e.active.searchId){e.diagnostics.staleResponses++;return false;}
            if(event.type==='result'){clear(e,'request');const active=e.active;e.active=null;patch(e,{activeRequestId:null,activeSearchId:null});move(e,'ready');active.resolve(event.result);drain(e);return true;}
            return event.type==='info';
        }
        function start(e,command) {
            if(e.data.state==='stopped')move(e,'busy');else move(e,'busy');
            const requestId=id('request'),searchId=id('search');patch(e,{activeRequestId:requestId,activeSearchId:searchId});
            const promise=new Promise((resolve,reject)=>{e.active={id:requestId,searchId,resolve,reject};});
            e.controls.send(Object.freeze({...command,requestId,searchId}));
            timer(e,'request',()=>{reject(e,new Error('Worker request timed out'));if(e.data.state==='busy')move(e,'degraded');},requestTimeout);
            return promise;
        }
        function request(contextId,command) {
            const e=get(contextId);if(!command||typeof command!=='object'||!['move-generation','evaluation'].includes(command.type))return Promise.reject(new TypeError('Unsupported structured worker command'));
            if(e.data.state==='paused'){e.paused=command;e.diagnostics.queuedRequests=1;return Promise.resolve(Object.freeze({status:'paused'}));}
            if(!['ready','busy','stopped'].includes(e.data.state))return Promise.reject(new Error('Worker context is not ready'));
            if(e.active){e.controls.send(Object.freeze({type:'stop',requestId:e.active.id,searchId:e.active.searchId}));reject(e,new Error('Worker request superseded'));move(e,'stopping');move(e,'stopped');}
            return start(e,command);
        }
        function drain(e){if(e.queued){const q=e.queued;e.queued=null;e.diagnostics.queuedRequests=0;start(e,q).catch(()=>{});}}
        function stop(contextId) {
            const e=get(contextId);if(['created','stopped','paused','terminated','disposed'].includes(e.data.state))return snap(e);
            if(e.data.state==='ready'){move(e,'stopping');move(e,'stopped');return patch(e,{stoppedAt:clock()});}
            if(e.data.state==='busy'){move(e,'stopping');e.controls.send(Object.freeze({type:'stop',requestId:e.active?.id,searchId:e.active?.searchId}));reject(e,new Error('Worker request stopped'));move(e,'stopped');return patch(e,{stoppedAt:clock()});}
            return snap(e);
        }
        function pause(contextId){const e=get(contextId);if(e.data.state==='busy')stop(contextId);if(['ready','stopped'].includes(e.data.state))move(e,'paused');return snap(e);}
        function resume(contextId){const e=get(contextId);if(e.data.state!=='paused')return snap(e);move(e,'ready');if(e.paused){const q=e.paused;e.paused=null;e.diagnostics.queuedRequests=0;start(e,q).catch(()=>{});}return snap(e);}
        function fail(contextId,generation,reason,error) {
            const e=get(contextId);if(generation!==e.data.workerGeneration){e.diagnostics.staleResponses++;return snap(e);}
            clear(e,'init');reject(e,error||new Error(reason));e.reject?.(error||new Error(reason));e.resolve=e.reject=null;kill(e);
            if(Contracts.canTransition(e.data.state,'failed'))move(e,'failed');return patch(e,{fallbackState:fallback.decide(reason,e.data.restartCount).state});
        }
        function restart(contextId,reason='worker-error') {
            const e=get(contextId),decision=fallback.decide(reason,e.data.restartCount);
            if(decision.action!=='restart'){if(Contracts.canTransition(e.data.state,'degraded'))move(e,'degraded');return Promise.resolve(patch(e,{fallbackState:'unavailable'}));}
            if(e.data.state==='busy')stop(contextId);move(e,'restarting');kill(e);e.initPromise=null;patch(e,{restartCount:e.data.restartCount+1,fallbackState:'retrying'});return initialize(contextId);
        }
        function terminate(contextId) {
            const e=get(contextId);if(['terminated','disposed'].includes(e.data.state))return snap(e);clear(e,'init');clear(e,'request');reject(e,new Error('Worker context terminated'));e.reject?.(new Error('Worker context terminated'));e.resolve=e.reject=null;move(e,'terminating');kill(e);move(e,'terminated');return patch(e,{terminatedAt:clock()});
        }
        function dispose(contextId){const e=get(contextId);if(!['terminated','disposed'].includes(e.data.state))terminate(contextId);if(e.data.state==='terminated')move(e,'disposed');e.factory=e.queued=e.paused=null;e.diagnostics.queuedRequests=0;return snap(e);}
        const inspect=()=>Object.freeze([...contexts.values()].map(snap));
        const disposeAll=owner=>{contexts.forEach(e=>{if(!owner||e.data.owner===owner)dispose(e.data.contextId);});return inspect();};
        return Object.freeze({VERSION:'1.0.0',createContext,initialize,request,stop,pause,resume,restart,terminate,dispose,disposeAll,getSnapshot:id=>snap(get(id)),inspect});
    }
    const service=createService();
    return Object.freeze({VERSION:'1.0.0',createService,...service});
});
