import {readFileSync} from 'node:fs';
const gateway=process.env.GATEWAY_URL,token=process.env.SUPABASE_ACCESS_TOKEN;
if(!gateway||!token)throw Error('GATEWAY_URL and SUPABASE_ACCESS_TOKEN required locally');
const entries=JSON.parse(readFileSync(process.argv[2]||'flow.studio-dev.json','utf8'));
for(const item of entries){const r=await fetch(`${gateway}/v1/transactions/track`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({hash:item.hash})});if(!r.ok)throw Error(`Cannot track ${item.hash}: ${r.status}`);console.log('tracked',item.method,item.hash)}
console.log('Worker Cron will verify recipients, methods, finality, execution and onchain postconditions.');
