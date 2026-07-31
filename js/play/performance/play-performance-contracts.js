(function(root,factory){root.CaissaPlayPerformanceContracts=factory();})(typeof globalThis!=='undefined'?globalThis:window,function(){
'use strict';
const VERSION='1.0.0',STATUSES=Object.freeze(['pass','warning','fail','unsupported','unavailable']),DIRECTIONS=Object.freeze(['lower','upper','exact']);
const definitions=[
['first-board-render-ms','ms','lower'],['play-interaction-ready-ms','ms','lower'],['quick-play-ready-ms','ms','lower'],
['mode-switch-cached-ms','ms','lower'],['mode-switch-cold-ms','ms','lower'],['start-game-request-ms','ms','lower'],
['engine-initialization-ms','ms','lower'],['engine-ready-ms','ms','lower'],['worker-stop-ms','ms','lower'],
['lazy-group-load-ms','ms','lower'],['mentor-action-load-ms','ms','lower'],['analyze-action-load-ms','ms','lower'],
['postgame-render-ms','ms','lower'],['initial-script-count','count','lower'],['initial-script-bytes','bytes','lower'],
['deferred-script-bytes','bytes','lower'],['stylesheet-count','count','lower'],['stylesheet-bytes','bytes','lower'],
['initial-image-count','count','lower'],['initial-image-bytes','bytes','lower'],['initial-dom-nodes','count','lower'],
['active-listeners','count','lower'],['listener-growth','count','exact'],['active-timers','count','exact'],
['active-observers','count','exact'],['board-count','count','exact'],['play-worker-count','count','exact'],
['live-region-count','count','exact'],['long-task-count','count','lower'],['longest-task-ms','ms','lower'],
['cumulative-layout-shift','score','lower'],['mobile-js-heap-bytes','bytes','lower'],['mobile-dom-nodes','count','lower'],
['mobile-listeners','count','lower']
].map(([metricId,unit,direction])=>Object.freeze({schemaVersion:VERSION,metricId,unit,direction}));
const METRICS=Object.freeze(Object.fromEntries(definitions.map(d=>[d.metricId,d])));
const validId=value=>typeof value==='string'&&Object.hasOwn(METRICS,value);
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
return freeze({VERSION,STATUSES,DIRECTIONS,METRICS,validId,freeze});
});
