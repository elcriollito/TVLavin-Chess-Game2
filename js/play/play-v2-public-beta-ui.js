(function installPublicBetaUi(document){
    'use strict';
    if(document.body?.dataset.caissaPlayV2Entry!=='public-beta'||document.querySelector('.caissa-public-beta-note'))return;
    const note=document.createElement('aside');note.className='caissa-public-beta-note';note.setAttribute('aria-label','Public Beta information');
    note.innerHTML='<strong>Public Beta</strong><span>Play v2 is in public beta. Features may change while we review feedback and ship improvements.</span>';
    document.body.append(note);
    addEventListener('pagehide',()=>{try{window.CaissaClockService?.stop?.('public-beta-exit');window.CaissaClockService?.dispose?.();}catch(_){}try{window.CaissaEngineRequestIsolation?.cancelSession?.();window.CaissaEngineRequestIsolation?.dispose?.();}catch(_){}try{window.CaissaPlayV2BotWorkerReadiness?.teardown?.('route-exit');}catch(_){}try{window.CaissaGameLifecycle?.dispose?.();}catch(_){}try{window.App?.boardAdapter?.dispose?.();}catch(_){}try{window.CaissaSimplifiedPlayShellInstance?.dispose?.();}catch(_){}},{once:true});
})(document);
