(function installPublicBetaUi(document){
    'use strict';
    if(document.body?.dataset.caissaPlayV2Entry!=='official')return;
    const playNavigation=document.querySelector('#mainNav [data-section="play"]');
    if(playNavigation){document.querySelector('#mainNav .nav-items')?.prepend(playNavigation);playNavigation.classList.add('active');playNavigation.setAttribute('aria-current','page');}
    addEventListener('pagehide',()=>{try{window.CaissaClockService?.stop?.('official-play-exit');window.CaissaClockService?.dispose?.();}catch(_){}try{window.CaissaEngineRequestIsolation?.cancelSession?.();window.CaissaEngineRequestIsolation?.dispose?.();}catch(_){}try{window.CaissaPlayV2BotWorkerReadiness?.teardown?.('route-exit');}catch(_){}try{window.CaissaGameLifecycle?.dispose?.();}catch(_){}try{window.App?.boardAdapter?.dispose?.();}catch(_){}try{window.CaissaSimplifiedPlayShellInstance?.dispose?.();}catch(_){}},{once:true});
})(document);
