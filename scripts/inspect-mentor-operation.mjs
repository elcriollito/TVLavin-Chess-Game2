import { createClient } from '@supabase/supabase-js';

const operationId=process.argv[2];
const target=process.argv[3];
const projectRef=process.argv[4];
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId||''))throw new Error('Provide a valid operation UUID.');
if(!['production','preview'].includes(target)||!/^[a-z0-9]{20}$/.test(projectRef||''))throw new Error('Provide an explicit target and Supabase project ref.');
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||new URL(url).hostname!==`${projectRef}.supabase.co`)throw new Error('Destination guard failed.');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const [reservation,ledger,usage,result]=await Promise.all([
  db.from('credit_reservations').select('id,operation_id,requested_amount,reserved_amount,state,result_code,expires_at,provider_attempt_state,value_delivery_state,created_at,updated_at').eq('operation_id',operationId),
  db.from('credit_events').select('operation_id,reservation_id,action,delta,balance_after,result_code,event_kind,catalog_revision,created_at').eq('operation_id',operationId),
  db.from('economic_usage_events').select('operation_id,reservation_id,capability_id,provider,model,unit,quantity,usage_available,duration_ms,result_code,value_delivery_state,catalog_revision,schema_version,occurred_at').eq('operation_id',operationId),
  db.from('mentor_operation_results').select('operation_id,reservation_id,schema_version,content_type,plaintext_bytes,expires_at,replay_count,delivered_at,created_at').eq('operation_id',operationId)
]);
if([reservation,ledger,usage,result].some(item=>item.error))throw new Error('Inspection failed.');
console.log(JSON.stringify({target,operationId,reservations:reservation.data||[],ledger:ledger.data||[],usage:usage.data||[],results:result.data||[]}));
