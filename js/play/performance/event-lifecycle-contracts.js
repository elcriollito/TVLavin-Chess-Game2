(function(root,factory){root.CaissaEventLifecycleContracts=factory();})(typeof globalThis!=='undefined'?globalThis:window,function(){
'use strict';
const VERSION='1.0.0';
const OWNERS=Object.freeze(['application','shell','route','panel','game-session','board','modal','worker-context','accessibility-manager','lazy-loader','provider-adapter','test']);
const STATES=Object.freeze(['created','active','disposing','disposed']);
const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9:-]{0,95}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const validEvent=value=>typeof value==='string'&&/^[a-z][a-z0-9:-]{0,63}$/.test(value);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
return freeze({VERSION,OWNERS,STATES,validId,validEvent});
});
