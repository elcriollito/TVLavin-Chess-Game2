import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMentorMaintenanceHandler, inspectMentorMaintenance, parseMaintenanceBatch } from '../api/_lib/mentor-maintenance.js';

const secret='cron-'+crypto.randomBytes(32).toString('base64');
const baseEnv={CRON_SECRET:secret,VERCEL_ENV:'production',CAISSA_MENTOR_MAINTENANCE_TARGET:'production',CAISSA_MENTOR_MAINTENANCE_SUPABASE_PROJECT_REF:'jczauvkfkweuvdpurpem',NEXT_PUBLIC_SUPABASE_URL:'https://jczauvkfkweuvdpurpem.supabase.co'};
const request=(authorization,query={})=>({method:'GET',headers:{authorization},query});
const response=()=>({statusCode:0,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}});
const run=async({authorization=`Bearer ${secret}`,query={},env=baseEnv,inspect=async()=>({release:1,consume:0,compensate:0,cleanup:2}),execute=async()=>({released:1,consumed:0,compensated:0,cleaned:2})}={})=>{const res=response();await createMentorMaintenanceHandler({db:{},env,inspect,execute})(request(authorization,query),res);return res;};

test('scheduler rejects unauthenticated and malformed authorization',async()=>{assert.equal((await run({authorization:null})).statusCode,401);assert.equal((await run({authorization:'Bearer wrong'})).statusCode,401);});
test('scheduler dry-run is authenticated, bounded, aggregate-only, and non-mutating',async()=>{let executions=0;const res=await run({query:{mode:'dry-run',batch:'25'},execute:async()=>{executions++;}});assert.equal(res.statusCode,200);assert.equal(res.body.batch,25);assert.deepEqual(Object.keys(res.body.planned).sort(),['cleanup','compensate','consume','release']);assert.equal(executions,0);assert.doesNotMatch(JSON.stringify(res.body),/user|email|cipher|prompt|fen|pgn/i);});
test('execute requires explicit enable and matching production destination',async()=>{assert.equal((await run({query:{mode:'execute'}})).statusCode,409);assert.equal((await run({query:{mode:'execute'},env:{...baseEnv,CAISSA_MENTOR_MAINTENANCE_EXECUTE_ENABLED:'true',NEXT_PUBLIC_SUPABASE_URL:'https://different.supabase.co'}})).statusCode,503);assert.equal((await run({query:{mode:'execute'},env:{...baseEnv,CAISSA_MENTOR_MAINTENANCE_EXECUTE_ENABLED:'true',VERCEL_ENV:'preview'}})).statusCode,503);});
test('valid execute returns aggregate actions only',async()=>{const res=await run({query:{mode:'execute',batch:'100'},env:{...baseEnv,CAISSA_MENTOR_MAINTENANCE_EXECUTE_ENABLED:'true'}});assert.equal(res.statusCode,200);assert.deepEqual(res.body.actions,{released:1,consumed:0,compensated:0,cleaned:2});});
test('batch parser accepts 1..500 only',()=>{for(const value of ['0','501','1e2',' 5','-1','abc'])assert.equal(parseMaintenanceBatch(value),null);assert.equal(parseMaintenanceBatch('1'),1);assert.equal(parseMaintenanceBatch('500'),500);});

function queryDb({ reservations, results }) {
  return { from(table) { const state={table,head:false,ids:null,live:false}; const chain={
    select(_columns,options={}){state.head=options.head===true;return this;},in(column,values){if(column==='reservation_id')state.ids=new Set(values);return this;},neq(){return this;},lte(){return this;},gt(){state.live=true;return this;},order(){return this;},
    limit(limit){return Promise.resolve(resolve(limit));},then(onFulfilled,onRejected){return Promise.resolve(resolve(500)).then(onFulfilled,onRejected);}
  }; function resolve(limit){if(table==='credit_reservations')return{data:reservations.slice(0,limit),error:null};const selected=results.filter(row=>(!state.ids||state.ids.has(row.reservation_id))&&(!state.live||row.live));return state.head?{data:null,error:null,count:selected.filter(row=>!row.live).length}:{data:selected.map(({reservation_id})=>({reservation_id})),error:null};} return chain; } };
}

test('inspection distinguishes release, consume, compensate, expired cleanup, and keeps live results',async()=>{const release=crypto.randomUUID(),consume=crypto.randomUUID(),compensate=crypto.randomUUID(),delivered=crypto.randomUUID();const db=queryDb({reservations:[{id:release,state:'RESERVED',value_delivery_state:'NOT_STARTED'},{id:consume,state:'RESERVED',value_delivery_state:'VALUE_AVAILABLE'},{id:compensate,state:'CONSUMED',value_delivery_state:'VALUE_AVAILABLE'},{id:delivered,state:'CONSUMED',value_delivery_state:'VALUE_DELIVERED'}],results:[{reservation_id:consume,live:true},{reservation_id:release,live:false},{reservation_id:compensate,live:false}]});assert.deepEqual(await inspectMentorMaintenance(db,100,new Date()),{release:1,consume:1,compensate:1,cleanup:2});});
