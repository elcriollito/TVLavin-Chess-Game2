(function installPublicBetaUi(document){
    'use strict';
    if(document.body?.dataset.caissaPlayV2Entry!=='official')return;
    addEventListener('pagehide',()=>{try{window.CaissaClockService?.stop?.('official-play-exit');window.CaissaClockService?.dispose?.();}catch(_){}try{window.CaissaEngineRequestIsolation?.cancelSession?.();window.CaissaEngineRequestIsolation?.dispose?.();}catch(_){}try{window.CaissaPlayV2BotWorkerReadiness?.teardown?.('route-exit');}catch(_){}try{window.CaissaGameLifecycle?.dispose?.();}catch(_){}try{window.App?.boardAdapter?.dispose?.();}catch(_){}try{window.CaissaSimplifiedPlayShellInstance?.dispose?.();}catch(_){}},{once:true});
})(document);
