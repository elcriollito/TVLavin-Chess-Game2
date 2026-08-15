const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');const {Client}=require('pg');
const connectionString=process.env.CAISSA_MENTOR_ECONOMIC_REHEARSAL_DATABASE_URL;if(!connectionString)throw new Error('isolated Mentor economic rehearsal database URL required');
const sql=fs.readFileSync('supabase/migrations/20260815_mentor_economic_foundation.sql','utf8');
const client=()=>new Client({connectionString,application_name:'caissa-s0.2p.4-rehearsal'});const op=()=>crypto.randomUUID();
async function service(db,query,params=[]){await db.query('begin');try{await db.query('set local role service_role');const r=await db.query(query,params);await db.query('commit');return r;}catch(e){await db.query('rollback');throw e;}}
(async()=>{const admin=client();await admin.connect();const clerk=`synthetic_${crypto.randomUUID()}`,uid=crypto.randomUUID();try{
 await admin.query(sql);await admin.query(sql);await admin.query('insert into public.users(id,clerk_id,credits,is_premium) values($1,$2,1,false)',[uid,clerk]);const before=(await admin.query('select credits from public.users where id=$1',[uid])).rows[0].credits;assert.equal(before,1);
 const operationA=op(),operationB=op(),expiry=new Date(Date.now()+300000);const reserve=(operation)=>{const db=client();return db.connect().then(()=>service(db,'select * from public.reserve_credits($1,$2,$3,1,$4,$5)',[clerk,operation,'mentor.shared_response',expiry,'mentor-economic-v1']).finally(()=>db.end()));};
 const results=await Promise.all([reserve(operationA),reserve(operationB)]);assert.equal(results.flatMap(r=>r.rows).filter(r=>r.success).length,1);assert.equal((await admin.query('select credits from public.users where id=$1',[uid])).rows[0].credits,1);
 const won=results.flatMap(r=>r.rows).find(r=>r.success);const duplicate=await reserve(won.reservation_id===results[0].rows[0].reservation_id?operationA:operationB);assert.equal(duplicate.rows[0].reservation_id,won.reservation_id);
 await service(admin,'select * from public.release_reservation($1,$2)',[won.reservation_id,'PROVIDER_FAILED']);assert.equal((await admin.query('select credits from public.users where id=$1',[uid])).rows[0].credits,1);
 await admin.query('begin');await admin.query('delete from public.users where id=$1',[uid]);await admin.query('rollback');assert.equal((await admin.query('select credits from public.users where id=$1',[uid])).rows[0].credits,1);
 for(const role of ['anon','authenticated']){await admin.query('begin');await admin.query(`set local role ${role}`);await assert.rejects(admin.query('select * from public.credit_reservations'),/permission denied/i);await admin.query('rollback');}
 console.log('Mentor economic PostgreSQL rehearsal passed');
}finally{await admin.query('delete from public.users where id=$1',[uid]).catch(()=>{});await admin.end();}})().catch(e=>{console.error(e);process.exitCode=1;});
