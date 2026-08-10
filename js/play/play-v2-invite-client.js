(function installInviteClient(root, document) {
    'use strict';
    if (document.body?.dataset.caissaPlayV2Entry !== 'invite-only') return;
    const state = { timer: null, disposed: false };
    const request = async path => { const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),10000); try{return await fetch(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});}finally{clearTimeout(timeout);} };
    function teardown(){if(state.disposed)return;state.disposed=true;clearInterval(state.timer);try{root.CaissaClockService?.stop?.('invite-access-closed');root.CaissaClockService?.dispose?.();}catch(_){}try{root.CaissaEngineRequestIsolation?.cancelSession?.();root.CaissaEngineRequestIsolation?.dispose?.();}catch(_){}try{root.CaissaPlayV2BotWorkerReadiness?.teardown?.('route-exit');}catch(_){}try{root.CaissaGameLifecycle?.dispose?.();}catch(_){}try{root.App?.boardAdapter?.dispose?.();}catch(_){}try{root.CaissaSimplifiedPlayShellInstance?.dispose?.();}catch(_){}document.dispatchEvent(new CustomEvent('caissa:play-v2-beta-disabled'));root.location.replace('/play/beta');}
    async function heartbeat(){try{const response=await request('/api/play-beta/status');const value=response.ok?await response.json():null;if(!response.ok||value?.enabled!==true)teardown();}catch(_){teardown();}}
    async function session(){const response=await request('/api/play-beta/session');if(!response.ok)return teardown();const value=await response.json();if(value?.authorized!==true)return teardown();document.dispatchEvent(new CustomEvent('caissa:play-v2-invite-authorized'));}
    session().then(()=>{if(!state.disposed)state.timer=setInterval(heartbeat,45000);}).catch(teardown);
})(window, document);
