import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { prohibitedEconomicFieldName, validateEconomicUsageEvent } from '../api/_lib/economic-event-validator.js';

const base = () => ({
  eventId: crypto.randomUUID(), operationId: crypto.randomUUID(), reservationId: crypto.randomUUID(), userId: crypto.randomUUID(),
  capabilityId: 'mentor.shared_response', provider: 'TOGETHER', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', unit: 'INPUT_TOKEN', quantity: 12,
  usageAvailable: true, durationMs: 20, resultCode: 'SUCCESS', valueDeliveryState: 'VALUE_AVAILABLE',
  catalogRevision: 'mentor-economic-v1', schemaVersion: 1, occurredAt: new Date().toISOString()
});

test('strict economic event accepts only the approved content-free schema', () => assert.equal(validateEconomicUsageEvent(base()).ok, true));
test('privacy aliases and generic containers fail closed', () => {
  for (const key of ['PGN','p_g_n','Fen','prompt_content','provider_response','raw-error','e_mail','api-key','metadata','payload','details','__proto__','constructor']) {
    assert.equal(prohibitedEconomicFieldName(key), true, key);
    const value = JSON.parse(JSON.stringify(base())); Object.defineProperty(value,key,{value:'sensitive',enumerable:true,configurable:true});
    assert.equal(validateEconomicUsageEvent(value).ok, false, key);
  }
});
test('validator logs violation codes without rejected values', () => {
  const logs=[]; const value={...base(), payload:'do-not-log'};
  validateEconomicUsageEvent(value,{logViolation:code=>logs.push(code)});
  assert.deepEqual(logs,['PROHIBITED_FIELD_NAME']); assert.doesNotMatch(JSON.stringify(logs),/do-not-log/);
});
test('unknown model and nested arbitrary object are rejected', () => {
  assert.equal(validateEconomicUsageEvent({...base(),model:'unknown'}).ok,false);
  assert.equal(validateEconomicUsageEvent({...base(),quantity:{value:1}}).ok,false);
});
