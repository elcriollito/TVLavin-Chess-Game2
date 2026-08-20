import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { evaluateMentorReservationEligibility, parseMentorCanaryAllowlist } from '../api/_lib/mentor-canary-policy.js';

const internalId = crypto.randomUUID();
const db = id => ({ from: name => { assert.equal(name, 'users'); return { select() { return this; }, eq(column) { assert.equal(column, 'clerk_id'); return this; }, async maybeSingle() { return { data: id ? { id } : null, error: id ? null : { code: 'missing' } }; } }; } });
const enabled = allowlist => ({ CAISSA_MENTOR_RESERVATIONS_ENABLED: 'true', CAISSA_MENTOR_RESERVATION_CANARY_USER_IDS: allowlist });

test('allowlist accepts bounded unique canonical internal UUIDs',()=>{const second=crypto.randomUUID();const parsed=parseMentorCanaryAllowlist(`${internalId},${second}`);assert.equal(parsed.ok,true);assert.equal(parsed.count,2);});
test('allowlist rejects missing, whitespace, duplicates, non-UUIDs, uppercase, and excess entries',()=>{for(const value of [undefined,'',` ${internalId}`,`${internalId},${internalId}`,'clerk_user',internalId.toUpperCase(),Array.from({length:11},()=>crypto.randomUUID()).join(',')])assert.equal(parseMentorCanaryAllowlist(value).ok,false);});
test('flag OFF and BYO never query eligibility and remain outside reservations',async()=>{const unavailable={from(){throw new Error('must not query');}};assert.deepEqual(await evaluateMentorReservationEligibility({db:unavailable,env:{},clerkId:'clerk',byo:false}),{ok:true,enabled:false});assert.deepEqual(await evaluateMentorReservationEligibility({db:unavailable,env:enabled(internalId),clerkId:'clerk',byo:true}),{ok:true,enabled:false});});
test('global ON defaults deny without a valid allowlist',async()=>{assert.equal((await evaluateMentorReservationEligibility({db:db(internalId),env:enabled(undefined),clerkId:'clerk',byo:false})).ok,false);});
test('wrong internal user stays on legacy and allowlisted internal user is eligible',async()=>{assert.equal((await evaluateMentorReservationEligibility({db:db(crypto.randomUUID()),env:enabled(internalId),clerkId:'clerk',byo:false})).enabled,false);assert.equal((await evaluateMentorReservationEligibility({db:db(internalId),env:enabled(internalId),clerkId:'clerk',byo:false})).enabled,true);});
