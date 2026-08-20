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
const inspected=await db.rpc('inspect_mentor_operation',{p_operation_id:operationId});
if(inspected.error||!inspected.data||typeof inspected.data!=='object')throw new Error('Inspection failed.');
const value=inspected.data;
console.log(JSON.stringify({
  target,
  operationId,
  found:value.found===true,
  reservation:value.reservation??null,
  ledger:Array.isArray(value.ledger)?value.ledger:[],
  usage:Array.isArray(value.usage)?value.usage:[],
  result:value.result??{exists:false,expiresAt:null,replayCount:null,deliveredAt:null,createdAt:null}
}));
