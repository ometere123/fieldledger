import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const fixtures=JSON.parse(readFileSync(process.env.DEMO_POLICY_FILE??'fixtures/policies.json','utf8'));
if(fixtures.synthetic!==true||fixtures.agreements.length<5)throw Error('Expected synthetic multi-policy reference fixture');
const signerRole={'MNT-SP':'contractor','OEM-K':'oem','JV-PARTNER':'jv','INSPECTOR-1':'inspector'};
function step(role,action,entry,extra={}){
 const env={...process.env,DEMO_AGREEMENT_ID:entry.id,DEMO_COUNTERPARTY_ORG:entry.counterparty,DEMO_AGREEMENT_VERSION:String(entry.version),...extra};
 const result=spawnSync(process.execPath,['scripts/seed-flow.mjs',role,action],{env,stdio:'inherit'});
 if(result.status!==0)throw Error(`${entry.id} ${action} failed (${result.status??result.error})`);
}
const command=process.argv[2];
if(command==='agreements'){
 for(const entry of fixtures.agreements){step('operator','agreement',entry);step(signerRole[entry.counterparty],'accept',entry)}
}else if(command==='event'){
 step('operator','event',fixtures.agreements[0],{DEMO_LINKS_JSON:JSON.stringify(fixtures.agreements.map(x=>({id:x.id,version:x.version}))) });
}else if(command==='effects'){
 for(const entry of fixtures.agreements)step('operator','effect',entry);
}else throw Error('Usage: node scripts/demo-run.mjs agreements|event|effects');
