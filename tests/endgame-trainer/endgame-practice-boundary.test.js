import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEndgamePracticeReleaseBoundary, createPrivateRunOperationalConfig,
  resolveEndgamePracticeAvailability
} from '../../js/endgame-trainer/v2/private-run-operational-config.js';
import { validatePrivateRunOperationalSearch } from '../../js/endgame-trainer/v2/private-five-item-run-operational-page.js';

const config=(release,runtime='false',mode=runtime==='true'?'enabled':'disabled')=>
  createPrivateRunOperationalConfig({
    ...(release===undefined?{}:{CAISSA_ENDGAME_PRACTICE_RELEASE_MODE:release}),
    CAISSA_PRIVATE_ENDGAME_RUN_ENABLED:runtime,
    CAISSA_PRIVATE_ENDGAME_RUN_MODE:mode
  });

test('release boundary is exact, allowlisted and safely defaults to unreleased',()=>{
  for(const value of [undefined,''])assert.deepEqual(createEndgamePracticeReleaseBoundary(
    value===undefined?{}:{CAISSA_ENDGAME_PRACTICE_RELEASE_MODE:value}
  ),{mode:'unreleased',configurationValid:true,source:'server-environment',safeDefault:'unreleased'});
  for(const value of ['unreleased','internal-preview','limited-preview','paused'])
    assert.equal(createEndgamePracticeReleaseBoundary({CAISSA_ENDGAME_PRACTICE_RELEASE_MODE:value}).mode,value);
  for(const value of ['INTERNAL-PREVIEW',' internal-preview','internal-preview ','unknown','true']){
    const boundary=createEndgamePracticeReleaseBoundary({CAISSA_ENDGAME_PRACTICE_RELEASE_MODE:value});
    assert.equal(boundary.mode,'unreleased');assert.equal(boundary.configurationValid,false);
  }
});

test('state precedence keeps release separate from runtime',()=>{
  assert.deepEqual(resolveEndgamePracticeAvailability(config(undefined,'false')),{state:'unreleased',canStart:false});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('unreleased','true')),{state:'unreleased',canStart:false});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('internal-preview','false')),{state:'runtime-disabled',canStart:false});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('internal-preview','false','maintenance')),{state:'maintenance',canStart:false});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('internal-preview','true')),{state:'internal-preview',canStart:true});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('limited-preview','true')),{state:'limited-preview',canStart:true});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('paused','true')),{state:'paused',canStart:false});
  assert.deepEqual(resolveEndgamePracticeAvailability(config('unknown','true')),{state:'configuration-failure',canStart:false});
});

test('preview entry selector is allowlisted but cannot authorize a release mode',()=>{
  const valid='?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item&previewEntry=endgame-practice';
  assert.equal(validatePrivateRunOperationalSearch(valid),true);
  for(const search of [
    `${valid}&previewEntry=endgame-practice`,valid.replace('endgame-practice',''),
    valid.replace('endgame-practice','../internal'),`${valid}&preview=1`
  ])assert.throws(()=>validatePrivateRunOperationalSearch(search),/selector-invalid/);
});
