import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createAccount,createClient,chains,isSuccessful,MessageType,MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,deriveInternalMessageCallKey,encodeInternalMessageFeeParams } from 'genlayer-js';
const deployment=JSON.parse(readFileSync('deployment.studio-dev.json','utf8'));
if(deployment.network!=='studio-dev'||deployment.chainId!==61997)throw Error('Studio Dev chain 61997 deployment required');
const manifest=process.env.DEMO_CONTRACTS_JSON?JSON.parse(process.env.DEMO_CONTRACTS_JSON):deployment.contracts;
if(!['participants','agreements','events','evidence','consensus','obligations'].every(name=>/^0x[0-9a-fA-F]{40}$/.test(manifest[name]??'')))throw Error('Complete contract map required');
const profile=JSON.parse(readFileSync('apps/web/public/fee-profile.json','utf8'));
if(!['network-quoted-bootstrap','simulated','measured','unmeasured'].includes(profile.status)||profile.network!=='studio-dev'||profile.chainId!==61997)throw Error('Studio Dev 61997 fee profile required');if(profile.status!=='measured')console.warn('Calibration only: fee path unmeasured; each write still receives a fresh SDK quote and receipts require review; browser writes remain disabled.');
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
 let prior=flow.find(item=>item.key===key),previousFailure;
 if(prior){if(prior.status!=='FINALIZED')await settle(prior);else if(prior.execution!=='FINISHED_WITH_RETURN'){previousFailure={hash:prior.hash,status:prior.status,execution:prior.execution,finalizedAt:prior.finalizedAt};flow.splice(flow.indexOf(prior),1);writeFileSync(flowFile,JSON.stringify(flow,null,2)+'\n');prior=undefined}else{console.log('already finalized',prior.hash);return prior.hash}if(prior)return prior.hash}
 const current=await alreadyApplied(contract,method,args);
 if(assertSameState(method,args,current)){console.log('already applied onchain',method);return null}
 const p=profile.methods[method];if(!p)throw Error(`Missing fee profile for ${method}`);
 const feeOptions={leaderTimeunitsAllocation:BigInt(p.leaderTimeunitsAllocation),validatorTimeunitsAllocation:BigInt(p.validatorTimeunitsAllocation),executionBudgetPerRound:BigInt(p.executionBudgetPerRound),appealRounds:1n,rotations:[BigInt(p.rotationsPerRound??'1'),BigInt(p.rotationsPerRound??'1')]};
 let allocations;
 if(method==='determine'||method==='redeliver'){
  const child=profile.methods.record_finalized;if(!manifest.events||!child)throw Error('EventRegistry child fee preset is required');
  const childQuote=await client.estimateTransactionFees({leaderTimeunitsAllocation:BigInt(child.leaderTimeunitsAllocation),validatorTimeunitsAllocation:BigInt(child.validatorTimeunitsAllocation),executionBudgetPerRound:BigInt(child.executionBudgetPerRound),totalMessageFees:BigInt(child.totalMessageFees??'0'),appealRounds:0n,rotations:[BigInt(child.rotationsPerRound??'0')]});
  const budget=BigInt(p.childFeeQuote?.reservedBudget??((childQuote.feeValue*12000n+9999n)/10000n));if(budget<childQuote.feeValue)throw Error('Finalized child allocation is below the current fee quote');
  const d=childQuote.distribution;allocations=[{messageType:MessageType.Internal,onAcceptance:false,parentIndex:MESSAGE_ALLOCATION_ROOT_PARENT_INDEX,recipient:manifest.events,callKey:deriveInternalMessageCallKey('record_finalized'),budget,feeParams:encodeInternalMessageFeeParams({leaderTimeunitsAllocation:d.leaderTimeunitsAllocation,validatorTimeunitsAllocation:d.validatorTimeunitsAllocation,appealRounds:d.appealRounds,executionBudgetPerRound:d.executionBudgetPerRound,rotations:d.rotations,maxPriceGenPerTimeUnit:d.maxPriceGenPerTimeUnit,storageFeeMaxGasPrice:d.storageFeeMaxGasPrice,receiptFeeMaxGasPrice:d.receiptFeeMaxGasPrice})}];
 }
 const q=await client.estimateTransactionFees({...feeOptions,...(allocations?{messageAllocations:allocations}:{totalMessageFees:BigInt(p.totalMessageFees??'0')})});
 const hash=await client.writeContract({address:manifest[contract],functionName:method,args,fees:{distribution:q.distribution,feeValue:q.feeValue,...(q.messageAllocations?.length?{messageAllocations:q.messageAllocations}:allocations?{messageAllocations:allocations}:{})}});
 const entry={key,hash,contract,method,args:JSON.parse(serialise(args)),role,status:'SUBMITTED',submittedAt:new Date().toISOString(),feeDeposit:q.feeValue.toString(),...(previousFailure?{previousFailure}:{})};flow.push(entry);writeFileSync(flowFile,JSON.stringify(flow,null,2)+'\n');
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
