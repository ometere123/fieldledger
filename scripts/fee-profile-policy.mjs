export const feeDimensions=['leaderTimeunitsAllocation','validatorTimeunitsAllocation','executionBudgetPerRound','totalMessageFees'];
export function worstCaseProfile(samples){
 if(!Array.isArray(samples)||samples.length===0)throw Error('At least one representative finalized measurement required');
 const profile=Object.fromEntries(feeDimensions.map(key=>[key,samples.reduce((max,sample)=>{
  const value=BigInt(sample[key]);if(value<0n)throw Error(`Negative ${key}`);return value>max?value:max;
 },0n).toString()]));
 profile.rotationsPerRound=samples.reduce((max,sample)=>{const value=BigInt(sample.rotationsPerRound??'1');return value>max?value:max},1n).toString();
 profile.sampleCount=samples.length;
 return profile;
}
export function assertRepresentativeCoverage(transactions,methods=['open_event','submit','determine','apply']){
 if(!Array.isArray(transactions)||transactions.length===0)throw Error('Finalized transaction observations required');
 const hashes=new Set();for(const item of transactions){if(!/^0x[0-9a-fA-F]{64}$/.test(item.hash??''))throw Error('Every fee case needs its actual transaction hash');const hash=item.hash.toLowerCase();if(hashes.has(hash))throw Error(`Duplicate transaction receipt reused: ${item.hash}`);hashes.add(hash)}
 for(const method of methods){const cases=transactions.filter(c=>c.method===method);const scenarios=new Set(cases.map(c=>c.scenario).filter(x=>typeof x==='string'&&x.length>0));
  if(cases.length<2||scenarios.size<2)throw Error(`Two distinct representative ${method} scenarios required`);
 }
}
