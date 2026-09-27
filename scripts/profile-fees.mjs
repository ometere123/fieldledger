import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createClient,chains} from 'genlayer-js';
import {worstCaseProfile,assertRepresentativeCoverage} from './fee-profile-policy.mjs';
const client=createClient({chain:chains.studioDevnet,endpoint:'https://studio-dev.genlayer.com/api'});
const path='apps/web/public/fee-profile.json';const serialize=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v));
const command=process.argv[2];
if(command==='init-ledger'){
 const ledgerPath='fee-measurements.json';
 if(existsSync(ledgerPath))throw Error(`${ledgerPath} already exists; refusing to replace recorded observations`);
 const manifest=JSON.parse(readFileSync('deployment.studio-dev.json','utf8'));
 if(manifest.network!=='studio-dev'||manifest.chainId!==61997)throw Error('Live manifest is not Studio Dev 61997');
 const transactions=Object.entries(manifest.deployments).map(([contract,item])=>({
  kind:'deploy',contract,hash:item.txHash,scenario:`deployment-${contract}`
 }));
 const bind=manifest.binding?.fixedAttempt;
 if(bind?.status==='FINALIZED'&&bind.execution==='FINISHED_WITH_RETURN')transactions.push({
  kind:'write',contract:'events',method:'bind_consensus',hash:bind.hash,scenario:'consensus-binding'
 });
 for(const item of manifest.liveTransactions??[]){
  if(item.status!=='FINALIZED'||item.execution!=='FINISHED_WITH_RETURN')continue;
  if(!item.hash||!item.contract||!item.method)throw Error(`Incomplete live transaction record ${item.label??''}`);
  transactions.push({kind:'write',contract:item.contract,method:item.method,hash:item.hash,scenario:item.label??`${item.method}-${transactions.length}`});
 }
 const hashes=new Set();for(const item of transactions){const hash=item.hash.toLowerCase();if(hashes.has(hash))throw Error(`Duplicate live receipt in manifest: ${item.hash}`);hashes.add(hash)}
 const ledger={network:'studio-dev',chainId:61997,transactions};
 writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n');
 console.log(`Created fee measurement ledger with ${transactions.length} distinct finalized transaction hashes; future representative cases remain to be added.`);
}else if(command==='bootstrap'){
 const allocations={leaderTimeunitsAllocation:BigInt(process.env.FEE_LEADER_TIMEUNITS||'100'),validatorTimeunitsAllocation:BigInt(process.env.FEE_VALIDATOR_TIMEUNITS||'200'),executionBudgetPerRound:BigInt(process.env.FEE_EXECUTION_BUDGET||'25000000000000000'),totalMessageFees:BigInt(process.env.FEE_CHILD_MESSAGE_BUDGET||'0'),rotationsPerRound:'0'};
 const policy=await client.getCurrentFeePolicy();const quote=await client.estimateTransactionFees({...allocations,appealRounds:3n,rotations:[0n,0n,0n,0n]});
 const profile={version:3,network:'studio-dev',chainId:61997,status:'network-quoted-bootstrap',generatedAt:new Date().toISOString(),feePolicy:serialize(policy),bootstrapQuote:serialize({feeValue:quote.feeValue}),deploy:serialize(allocations),methods:Object.fromEntries(['bind_consensus','register','rotate_signer','propose_version','accept_version','open_event','submit','close_window','determine','redeliver','record_finalized','apply','claim'].map(name=>[name,serialize(allocations)])),warning:'Bootstrap allocations are unmeasured; run representative simulations and multi-party live flows before production writes.'};
 writeFileSync(path,JSON.stringify(profile,null,2)+'\n');console.log('Network quote obtained; bootstrap profile is not measured.');
}else if(command==='quote-child'){
 const profile=JSON.parse(readFileSync(path,'utf8'));
 const contracts=JSON.parse(readFileSync('deployment.studio-dev.json','utf8')).contracts;
 const child=profile.methods.record_finalized;
 if(!contracts.events||!child)throw Error('Deployed EventRegistry and record_finalized fee preset required');
 // `determine` and `redeliver` emit this internal message only on finalization.
 // Quote the child's known fee preset from current Studio Dev prices, then keep
 // 20% extra budget for variation in its small state write. This is a quote,
 // not a measured profile; successful child receipts are still required.
 const childQuote=await client.estimateTransactionFees({
  leaderTimeunitsAllocation:BigInt(child.leaderTimeunitsAllocation),
  validatorTimeunitsAllocation:BigInt(child.validatorTimeunitsAllocation),
  executionBudgetPerRound:BigInt(child.executionBudgetPerRound),
  totalMessageFees:BigInt(child.totalMessageFees??'0'),
  appealRounds:0n,
  rotations:[BigInt(child.rotationsPerRound??'0')],
 });
 const childMessageBudget=(childQuote.feeValue*12000n+9999n)/10000n;
 for(const method of ['determine','redeliver']){
  const preset=profile.methods[method];
  // These parent calls may need an appeal round, so persist the same rotation
  // count that the quote uses. Otherwise protocol.mjs reads the old zero value
  // and quotes a deposit that omits the appeal-capable transaction path.
  preset.rotationsPerRound='1';
  const parentRotations=BigInt(preset.rotationsPerRound);
  const parentQuote=await client.estimateTransactionFees({
   leaderTimeunitsAllocation:BigInt(preset.leaderTimeunitsAllocation),
   validatorTimeunitsAllocation:BigInt(preset.validatorTimeunitsAllocation),
   executionBudgetPerRound:BigInt(preset.executionBudgetPerRound),
   totalMessageFees:childMessageBudget,
   appealRounds:1n,
   rotations:[parentRotations,parentRotations],
  });
  preset.totalMessageFees=String(parentQuote.distribution.totalMessageFees);
  preset.childFeeQuote={
   method:'record_finalized',
   recipient:contracts.events,
   childFeeValue:childQuote.feeValue.toString(),
   reservedBudget:childMessageBudget.toString(),
   headroomBps:'12000',
   rotationsPerRound:parentRotations.toString(),
   parentFeeValue:parentQuote.feeValue.toString(),
   quotedAt:new Date().toISOString(),
  };
  console.log(method,JSON.stringify(preset.childFeeQuote));
 }
 profile.warning='Bootstrap and child-message allocations are network quoted, not measured. Browser writes remain disabled until representative finalized receipts, appeal history, successful child delivery and refunds are measured.';
 writeFileSync(path,JSON.stringify(profile,null,2)+'\n');
 console.log('Added current-price finalized-child budgets; fee-profile status remains',profile.status);
}else if(command==='simulate'){
 const profile=JSON.parse(readFileSync(path,'utf8'));const addresses=JSON.parse(readFileSync('deployment.studio-dev.json','utf8')).contracts;
 const fixture=JSON.parse(readFileSync(process.argv[3]||'fixtures/fee-cases.json','utf8'));const cases=Array.isArray(fixture)?fixture:fixture.cases;
 if(!Array.isArray(cases)||!cases.length)throw Error('Non-empty real scenario fee cases required');
 const simulated={};
 for(const c of cases){const address=addresses[c.contract];if(!address)throw Error(`Contract ${c.contract} not deployed`);
  const args=c.args.map(v=>v&&typeof v==='object'&&'bigint' in v?BigInt(v.bigint):v);
  const sim=await client.simulateWriteContract({address,functionName:c.method,args,includeReceipt:true});if(!sim.feeAccounting)throw Error(`Fee accounting unavailable for ${c.method}`);
  const estimate=await client.estimateTransactionFeesFromSimulation({simulation:sim,appealRounds:1n,rotations:[1n,1n]});
  const usage=serialize(sim.feeAccounting);if(c.method==='determine'&&!(Number(usage.message_fee_budget)>0||Number(usage.message_fee_consumed)>0))throw Error('Finalized child message funding not represented in determine simulation');
  (simulated[c.method]??=[]).push({leaderTimeunitsAllocation:String(estimate.distribution?.leaderTimeunitsAllocation??profile.deploy.leaderTimeunitsAllocation),validatorTimeunitsAllocation:String(estimate.distribution?.validatorTimeunitsAllocation??profile.deploy.validatorTimeunitsAllocation),executionBudgetPerRound:String(estimate.distribution?.executionBudgetPerRound??profile.deploy.executionBudgetPerRound),totalMessageFees:String(estimate.distribution?.totalMessageFees??usage.message_fee_budget??'0'),rotationsPerRound:'1'});
  console.log(c.method,'simulated',estimate.feeValue.toString());
 }
 for(const [method,samples] of Object.entries(simulated))profile.methods[method]={...worstCaseProfile(samples),simulatedAt:new Date().toISOString()};
 profile.status='simulated';profile.generatedAt=new Date().toISOString();writeFileSync(path,JSON.stringify(profile,null,2)+'\n');
 console.log('Simulation profile recorded. Inspect live consumed/refunded fees, child delivery and appeals before changing status to measured.');
}else if(command==='measure'){
 const pathCases=process.argv[3]||'fee-measurements.json';const cases=JSON.parse(readFileSync(pathCases,'utf8'));
 const profile=JSON.parse(readFileSync(path,'utf8'));const contracts=JSON.parse(readFileSync('deployment.studio-dev.json','utf8')).contracts;
 if(cases.network!=='studio-dev'||cases.chainId!==61997||!Array.isArray(cases.transactions))throw Error('Fee measurements must be a Studio Dev 61997 transaction ledger');
 assertRepresentativeCoverage(cases.transactions);
 const required=['register','rotate_signer','bind_consensus','propose_version','accept_version','open_event','submit','close_window','determine','apply','claim','redeliver'];
 const methods={};const deploy=[];const observations=[];
 const receipt=async hash=>{const r=await fetch('https://studio-dev.genlayer.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'eth_getTransactionByHash',params:[hash],id:1})});const v=await r.json();if(!r.ok||v.error||String(v.result?.hash??v.result?.tx_id).toLowerCase()!==hash.toLowerCase())throw Error('Transaction unavailable '+hash);return v.result};
 const roundCount=r=>Array.isArray(r.consensus_history)?r.consensus_history.length:Number(r.last_round?.round??0)+1;
 for(const c of cases.transactions){if(!/^0x[0-9a-fA-F]{64}$/.test(c.hash))throw Error('Invalid transaction hash');const tx=await client.getTransaction({hash:c.hash});const r=await receipt(c.hash);
  if(String(r.statusName??r.status??r.status_name).toLowerCase()!=='finalized'||String(r.txExecutionResultName).toLowerCase()!=='finishedwithreturn'||!r.fees?.distribution)throw Error('Unsuccessful or fee-disabled receipt '+c.hash);
  if(c.kind==='deploy'){if(tx.txDataDecoded?.type!=='deploy'||String(tx.recipient).toLowerCase()!==String(contracts[c.contract]).toLowerCase())throw Error('Deployment mismatch '+c.contract);deploy.push(r.fees.distribution)}
  else {const decoded=tx.txDataDecoded?.callData;if(decoded?.['']!==c.method||String(tx.recipient).toLowerCase()!==String(contracts[c.contract]).toLowerCase())throw Error('Method or recipient mismatch '+c.hash);const d=r.fees.distribution;(methods[c.method]??=[]).push({leaderTimeunitsAllocation:d.leaderTimeunitsAllocation,validatorTimeunitsAllocation:d.validatorTimeunitsAllocation,executionBudgetPerRound:d.executionBudgetPerRound,totalMessageFees:d.totalMessageFees,rotationsPerRound:d.rotations?.[0]??'1'});}
  observations.push({hash:c.hash,method:c.method||'deploy',scenario:c.scenario??c.name??'unnamed',contract:c.contract,fees:r.fees,rounds:roundCount(r)});
 }
 if(deploy.length!==6||required.some(m=>!methods[m]))throw Error('Six deploys and all required method cases missing');
 const determination=cases.transactions.find(t=>t.method==='determine'&&observations.some(o=>o.hash===t.hash&&o.rounds>=2));if(!determination)throw Error('Appealed determination sample missing');const parent=await receipt(determination.hash);if(parent.appealed!==true||roundCount(parent)<2)throw Error('Explorer does not confirm an appeal on the determination');const children=await client.getTriggeredTransactionIds({hash:determination.hash});if(!children.length||new Set(children.map(x=>x.toLowerCase())).size!==children.length||children.some(x=>x.toLowerCase()===determination.hash.toLowerCase()))throw Error('Finalized child IDs are missing or duplicated');
 const childReceipts=await Promise.all(children.map(receipt));if(!childReceipts.some(r=>String(r.statusName??r.status??r.status_name).toLowerCase()==='finalized'&&String(r.txExecutionResultName).toLowerCase()==='finishedwithreturn'&&String(r.recipient).toLowerCase()===String(contracts.events).toLowerCase()))throw Error('No successful EventRegistry child');
 if(roundCount(parent)<2)throw Error('Appeal round not observed on determination');
 profile.deploy=worstCaseProfile(deploy);
 profile.methods=Object.fromEntries(Object.entries(methods).map(([method,samples])=>[method,{...worstCaseProfile(samples),...(profile.methods[method]?.childFeeQuote?{childFeeQuote:profile.methods[method].childFeeQuote}:{})}]));profile.status='measured';profile.generatedAt=new Date().toISOString();profile.observations=observations;profile.childObservations=childReceipts.map(r=>({id:r.id,fees:r.fees}));
 writeFileSync(path,JSON.stringify(profile,null,2)+'\n');console.log('Validated measured profile from finalized fee-bearing 61997 receipts, child delivery and appeal round.');
}else if(command==='account'){
 const hash=process.argv[3];if(!/^0x[0-9a-fA-F]{64}$/.test(hash??''))throw Error('Transaction hash required');
 const tx=await client.getTransaction({hash});const response=await fetch('https://studio-dev.genlayer.com/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'eth_getTransactionByHash',params:[hash],id:1})});const raw=await response.json();const rounds=raw.result?.consensus_history;const last=raw.result?.last_round;const validatorResults=(raw.result?.consensus_data?.validators??[]).map(v=>({vote:v.vote,result:Buffer.from(v.result??'','base64').toString('utf8').replace(/^\u0002/,''),gasUsed:v.gas_used,executionResult:v.execution_result,stderr:v.genvm_result?.stderr||undefined,rawError:v.genvm_result?.raw_error??undefined,errorCode:v.genvm_result?.error_code??undefined,errorDescription:v.genvm_result?.error_description??undefined,hostCalls:v.execution_stats?.call_counts??undefined}));console.log(JSON.stringify(serialize({status:tx.statusName??tx.status,execution:tx.txExecutionResultName,from:raw.result?.from_address,recipient:raw.result?.recipient,rounds:{historyCount:Array.isArray(rounds)?rounds.length:undefined,lastRound:last?.round,votesCommitted:last?.votes_committed,votesRevealed:last?.votes_revealed,appealed:raw.result?.appealed},validatorResults,fees:raw.result?.fees,childTransactions:await client.getTriggeredTransactionIds({hash})}),null,2));
}else throw Error('Usage: node scripts/profile-fees.mjs init-ledger|bootstrap|quote-child|simulate [cases.json]|measure [receipts.json]|account <txhash>');
