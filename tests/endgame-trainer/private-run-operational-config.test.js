import test from 'node:test';
import assert from 'node:assert/strict';
import middleware from '../../middleware.js';
import {
  createPrivateRunOperationalConfig, fetchPrivateRunOperationalConfig,
  PRIVATE_RUN_AVAILABILITY_URL, validatePrivateRunOperationalConfig
} from '../../js/endgame-trainer/v2/private-run-operational-config.js';

const env=(enabled,mode,reason)=>({
  ...(enabled===undefined?{}:{CAISSA_PRIVATE_ENDGAME_RUN_ENABLED:enabled}),
  ...(mode===undefined?{}:{CAISSA_PRIVATE_ENDGAME_RUN_MODE:mode}),
  ...(reason===undefined?{}:{CAISSA_PRIVATE_ENDGAME_RUN_REASON:reason})
});
const response=value=>({ok:true,json:async()=>structuredClone(value)});

test('strict environment parsing enables only exact lowercase true and defaults safely disabled',()=>{
  assert.deepEqual(
    ['false',undefined,'','TRUE','False',' true ','1','yes'].map(value=>createPrivateRunOperationalConfig(env(value)).enabled),
    [false,false,false,false,false,false,false,false]
  );
  const enabled=createPrivateRunOperationalConfig(env('true'));
  assert.equal(enabled.enabled,true);assert.equal(enabled.mode,'enabled');assert.equal(enabled.reasonCode,'operational');
  for(const value of ['TRUE','False',' true ','unknown']){
    const config=createPrivateRunOperationalConfig(env(value));
    assert.equal(config.reasonCode,'configuration-invalid');assert.equal(config.enabled,false);
  }
});

test('disabled, maintenance and emergency modes are coherent and reason codes are allowlisted',()=>{
  assert.equal(createPrivateRunOperationalConfig(env('false')).mode,'disabled');
  const maintenance=createPrivateRunOperationalConfig(env('false','maintenance','scheduled-maintenance'));
  assert.equal(maintenance.mode,'maintenance');assert.equal(maintenance.enabled,false);
  const emergency=createPrivateRunOperationalConfig(env('false','emergency-disabled','incident-response'));
  assert.equal(emergency.mode,'emergency-disabled');assert.equal(emergency.enabled,false);
  for(const values of [
    env('true','disabled'),env('false','enabled'),env('false','unknown'),
    env('false','disabled','arbitrary-code')
  ]) assert.equal(createPrivateRunOperationalConfig(values).reasonCode,'configuration-invalid');
});

test('client validation rejects schema, mode, reason, fields and enabled-mode ambiguity',()=>{
  const base=createPrivateRunOperationalConfig(env('true'));
  assert.equal(validatePrivateRunOperationalConfig(base).enabled,true);
  for(const patch of [
    {schemaVersion:'2.0.0'},{featureId:'other'},{enabled:'true'},{mode:'unknown'},
    {reasonCode:'unknown'},{failClosed:false},{lastKnownSafeDefault:'enabled'},
    {effectivePolicy:'cache'},{configurationSource:'client'},{enabled:false}
  ]) assert.throws(()=>validatePrivateRunOperationalConfig({...base,...patch}),/configuration-invalid/);
});

test('availability request is same-origin, no-store, credential-free and fails closed for transport and payload errors',async()=>{
  const enabled=createPrivateRunOperationalConfig(env('true'));
  let request;
  assert.equal((await fetchPrivateRunOperationalConfig({fetchImpl:async(url,options)=>{request={url,options};return response(enabled);}})).enabled,true);
  assert.equal(request.url,PRIVATE_RUN_AVAILABILITY_URL);
  assert.equal(request.options.cache,'no-store');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');
  for(const fetchImpl of [
    async()=>({ok:false,status:503}),async()=>response({bad:true}),
    async()=>({ok:true,json:async()=>{throw new Error('bad-json');}}),
    async()=>{throw new Error('network');}
  ]) assert.equal((await fetchPrivateRunOperationalConfig({fetchImpl})).enabled,false);
});

test('availability timeout aborts and returns disabled without caching prior enabled state',async()=>{
  const config=await fetchPrivateRunOperationalConfig({
    timeoutMs:5,
    fetchImpl:async(_url,{signal})=>new Promise((resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    })
  });
  assert.equal(config.enabled,false);assert.equal(config.reasonCode,'configuration-unavailable');
});

test('edge-evaluated endpoint exposes only the minimal contract with no-store and no secrets',async()=>{
  const previous={
    enabled:process.env.CAISSA_PRIVATE_ENDGAME_RUN_ENABLED,
    secret:process.env.CAISSA_TEST_PRIVATE_SECRET
  };
  process.env.CAISSA_PRIVATE_ENDGAME_RUN_ENABLED='true';process.env.CAISSA_TEST_PRIVATE_SECRET='must-not-leak';
  const response=middleware(new Request('https://www.caissa-chess.org/api/endgame/private-run-availability'));
  const body=await response.json();
  assert.equal(response.status,200);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
  assert.equal(body.enabled,true);assert.doesNotMatch(JSON.stringify(body),/secret|must-not-leak|environment variable/i);
  assert.equal(middleware(new Request('https://www.caissa-chess.org/api/endgame/private-run-availability',{method:'POST'})).status,405);
  if(previous.enabled===undefined)delete process.env.CAISSA_PRIVATE_ENDGAME_RUN_ENABLED;else process.env.CAISSA_PRIVATE_ENDGAME_RUN_ENABLED=previous.enabled;
  if(previous.secret===undefined)delete process.env.CAISSA_TEST_PRIVATE_SECRET;else process.env.CAISSA_TEST_PRIVATE_SECRET=previous.secret;
});
