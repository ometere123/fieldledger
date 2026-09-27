import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createAccount,createClient,chains,isSuccessful } from 'genlayer-js';
const manifest=JSON.parse(readFileSync('deployment.studio-dev.json','utf8')).contracts;
const profile=JSON.parse(readFileSync('apps/web/public/fee-profile.json','utf8'));
if(!['network-quoted-bootstrap','simulated','measured'].includes(profile.status))throw Error('Network-quoted 61997 bootstrap profile required');if(profile.status!=='measured')console.warn('Calibration only: fee allocation unmeasured; inspect every receipt and do not present this flow as production.');
const role=process.argv[2],step=process.argv[3];const privateKey=process.env[`${role?.toUpperCase()}_PRIVATE_KEY`];
if(!/^0x[0-9a-fA-F]{64}$/.test(privateKey??''))throw Error(`${role?.toUpperCase()}_PRIVATE_KEY required locally`);
const client=createClient({chain:chains.studioDevnet,endpoint:'https://studio-dev.genlayer.com/api',account:createAccount(privateKey)});
const flowFile='flow.studio-dev.json';const flow=existsSync(flowFile)?JSON.parse(readFileSync(flowFile,'utf8')):[];
const canonical=value=>typeof value==='bigint'?JSON.stringify(value.toString()):Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const serialise=value=>canonical(value);
async function read(contract,method,args){return await client.readContract({address:manifest[contract],functionName:method,args})}
async function alreadyApplied(contract,method,args){
 if(method==='register'){const raw=await read(contract,'get',[args[0]]);return raw?JSON.parse(raw):null}
 if(method==='propose_version'||method==='accept_version'){const raw=await read(contract,'get_version',[args[0],BigInt(method==='propose_version'?args[3]:args[1])]);return raw?JSON.parse(raw):null}
 if(method==='open_event'||method==='challenge_event_envelope'||method==='record_finalized'){const raw=await read(contract,'get',[args[0]]);return raw?JSON.parse(raw):null}
 if(method==='submit') {const raw=await read(contract,'get',[args[0]]);return raw?JSON.parse(raw):null}
 if(method==='close_window'){const raw=await read(contract,'manifest',[args[0]]);return raw?JSON.parse(raw):null}
 if(method==='determine'||method==='redeliver') {const raw=method==='determine'?await read(contract,'get',[args[0]]):await read('events','get',[args[0]]);return raw?JSON.parse(raw):null}
 if(method==='apply'){const raw=await read(contract,'get',args);return raw?JSON.parse(raw):null}
 if(method==='claim'){const raw=await read(contract,'get_claim',args);return raw?JSON.parse(raw):null}
 return null;
}
function assertSameState(method,args,state){
 if(method==='register'&&state){if(state.name!==args[1]||state.signer.toLowerCase()!==String(args[2]).toLowerCase()||state.role!==args[3])throw Error(`Organisation ${args[0]} already exists with different data`);return true}
 if(method==='propose_version'&&state){if(state.operator!==args[1]||state.counterparty!==args[2]||serialise(state.policy)!==serialise(JSON.parse(args[4])))throw Error(`Agreement ${args[0]} version ${args[3]} already exists with different terms`);return true}
 if(method==='accept_version'&&state?.accepted)return true;
 if(method==='open_event'&&state){const initial=state.eventTypeClaims?.[0];if(state.asset!==args[1]||state.operator!==args[2]||initial?.eventType!==args[3]||Number(state.openedMinute)!==Number(args[4])||serialise(state.links)!==serialise(JSON.parse(args[5])))throw Error(`Event ${args[0]} already exists with different envelope`);return true}
 if(method==='challenge_event_envelope'&&state){if(state.eventTypeClaims?.some(x=>x.eventType===args[1]&&Number(x.reportedMinute)===Number(args[2])))return true}
 if(method==='submit'&&state){if(state.event!==args[1]||state.organisation!==args[2]||state.digest!==args[4])throw Error(`Evidence ${args[0]} already exists with different commitment`);return true}
 if(method==='close_window'&&state?.digest)return true;
 if(method==='determine'&&state)return true;
 if(method==='redeliver'&&state?.finalResult)return true;
 if(method==='apply'&&state)return true;
 if(method==='claim'&&state)return true;
 return false;
}
async function settle(entry){
 const maxPolls=120;let tx;
 for(let attempt=0;attempt<maxPolls;attempt++){
  try{tx=await client.getTransaction({hash:entry.hash})}catch{}
  if(tx?.lifecycle?.state==='finalized'||tx?.lifecycle?.state==='appealed')break;
  entry.status=tx?.lifecycle?.state??'pending';writeFileSync(flowFile,JSON.stringify(flow,null,2)+'\n');
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!tx||tx.lifecycle?.state!=='finalized')throw Error(`Transaction ${entry.hash} is still pending; rerun this step to resume the recorded hash`);
 entry.status='FINALIZED';entry.execution=tx.txExecutionResultName??'unknown';entry.finalizedAt=new Date().toISOString();entry.feeDeposit=String(tx.fees?.deposit??'');entry.feeConsumed=String(tx.fees?.consumed?.executionConsumed??'');
 writeFileSync(flowFile,JSON.stringify(flow,null,2)+'\n');
 if(!isSuccessful(tx)||entry.execution!=='FINISHED_WITH_RETURN')throw Error(`Failed ${entry.hash}: ${entry.status}/${entry.execution}`);
 console.log('finalized',entry.hash);return tx;
}
async function write(contract,method,args){
 const key=createHash('sha256').update(`${role}|${contract}|${method}|${serialise(args)}`).digest('hex');
 const prior=flow.find(item=>item.key===key);
 if(prior){if(prior.status!=='FINALIZED')await settle(prior);else if(prior.execution!=='FINISHED_WITH_RETURN')throw Error(`Recorded transaction ${prior.hash} finalized unsuccessfully; inspect it before retrying`);else console.log('already finalized',prior.hash);return prior.hash}
 const current=await alreadyApplied(contract,method,args);
 if(assertSameState(method,args,current)){console.log('already applied onchain',method);return null}
 const p=profile.methods[method];if(!p)throw Error(`Missing fee profile for ${method}`);
 const q=await client.estimateTransactionFees({leaderTimeunitsAllocation:BigInt(p.leaderTimeunitsAllocation),validatorTimeunitsAllocation:BigInt(p.validatorTimeunitsAllocation),executionBudgetPerRound:BigInt(p.executionBudgetPerRound),totalMessageFees:BigInt(p.totalMessageFees),appealRounds:1n,rotations:[1n,1n]});
 const hash=await client.writeContract({address:manifest[contract],functionName:method,args,fees:{distribution:q.distribution,feeValue:q.feeValue}});
 const entry={key,hash,contract,method,args:JSON.parse(serialise(args)),role,status:'SUBMITTED',submittedAt:new Date().toISOString(),feeDeposit:q.feeValue.toString()};flow.push(entry);writeFileSync(flowFile,JSON.stringify(flow,null,2)+'\n');
 console.log('submitted',method,hash,'deposit',q.feeValue.toString());await settle(entry);return hash;
}
const event=process.env.DEMO_EVENT_ID??'FL-2026-184';const agreement=process.env.DEMO_AGREEMENT_ID??'MNT-2026-04';const version=BigInt(process.env.DEMO_AGREEMENT_VERSION??'1');const links=JSON.parse(process.env.DEMO_LINKS_JSON??JSON.stringify([{id:agreement,version:Number(version)}]));
function policyForAgreement(){if(process.env.DEMO_POLICY_JSON)return process.env.DEMO_POLICY_JSON;
 const fixture=JSON.parse(readFileSync(process.env.DEMO_POLICY_FILE??'fixtures/policies.json','utf8'));
 const item=fixture.agreements.find(x=>x.id===agreement);if(!item)throw Error(`No policy fixture for ${agreement}`);
 return JSON.stringify(item.policy)}
switch(step){
 case 'agreement':await write('agreements','propose_version',[agreement,process.env.DEMO_OPERATOR_ORG??'OP-WR',process.env.DEMO_COUNTERPARTY_ORG??JSON.parse(readFileSync(process.env.DEMO_POLICY_FILE??'fixtures/policies.json','utf8')).agreements.find(x=>x.id===agreement)?.counterparty??'MNT-SP',version,policyForAgreement()]);break;
 case 'accept':await write('agreements','accept_version',[agreement,version]);break;
 case 'event':await write('events','open_event',[event,process.env.DEMO_ASSET??'K-401B',process.env.DEMO_OPERATOR_ORG??'OP-WR',process.env.DEMO_EVENT_TYPE??'UNIT_TRIP',BigInt(process.env.DEMO_OPENED_MINUTE??String(Math.floor(Date.now()/60000))),JSON.stringify(links)]);break;
 case 'challenge-envelope':await write('events','challenge_event_envelope',[event,process.env.DEMO_EVENT_TYPE??'UNIT_TRIP',BigInt(process.env.DEMO_OPENED_MINUTE??String(Math.floor(Date.now()/60000)))]);break;
 case 'evidence':{const p=JSON.parse(readFileSync(process.env.EVIDENCE_RECEIPT_FILE??'evidence-receipt.json','utf8'));await write('evidence','submit',[p.evidenceId,event,p.organisation,p.type,p.digest,p.observedAt,p.targetEvidenceId||'',BigInt(p.packageBytes),BigInt(p.factCount)]);break}
 case 'challenge':throw Error('Create a CHALLENGE package with targetEvidenceId via package-evidence.mjs, then run evidence step');
 case 'freeze':await write('evidence','close_window',[event]);break;
 case 'determine':await write('consensus','determine',[event]);break;
 case 'redeliver':await write('consensus','redeliver',[event]);break;
 case 'effect':await write('obligations','apply',[event,agreement,version]);break;
 case 'claim':await write('obligations','claim',[event,agreement,version]);break;
 default:throw Error('Usage: node scripts/seed-flow.mjs operator|contractor agreement|accept|event|evidence|challenge|freeze|determine|redeliver|effect');
}
