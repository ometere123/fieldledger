import { createClient, chains } from 'genlayer-js';
import { createTransactionKit } from '@genlayer/transaction-kit';
export const CHAIN_ID = 61997;
export const RPC = 'https://studio-dev.genlayer.com/api';
export const EXPLORER = 'https://explorer-studio-dev.genlayer.com';
export type Address = `0x${string}`;
export type Deployment = { participants:Address; agreements:Address; events:Address; evidence:Address; consensus:Address; obligations:Address };
export function deployment(): Deployment | null {
  const raw = process.env.NEXT_PUBLIC_CONTRACTS_JSON;
  if (!raw) return null;
  try { const x = JSON.parse(raw) as Record<string,string>; const names = ['participants','agreements','events','evidence','consensus','obligations']; return names.every(n => /^0x[0-9a-fA-F]{40}$/.test(x[n] ?? '')) ? x as Deployment : null; } catch { return null; }
}
export function publicClient() { return createClient({ chain: chains.studioDevnet, endpoint: RPC }); }
export function walletClient(provider: any, account: Address) { return createClient({ chain: chains.studioDevnet, endpoint: RPC, provider, account }); }
export async function assertChain(provider: { request(args:{method:string}):Promise<unknown> }) {
  const id = await provider.request({method:'eth_chainId'});
  if (Number(id) !== CHAIN_ID) throw new Error('Switch your wallet to Studio Dev (61997).');
}
export type ActionState = {phase:'idle'|'quoting'|'signing'|'pending'|'accepted'|'finalized'|'failed'; hash?:string; deposit?:string; error?:string};
export function successfulFinal(tx: {statusName?:string;txExecutionResultName?:string}) { return tx.statusName === 'FINALIZED' && tx.txExecutionResultName === 'FINISHED_WITH_RETURN'; }
export async function submitAction(provider:any, account:Address, address:Address, functionName:string, args:(string|bigint)[], onState:(state:ActionState)=>void) {
  await assertChain(provider);
  onState({phase:'quoting'});
  // A measured fee profile is required for production writes. No guessed fee budget.
  const profile = await fetch('/fee-profile.json').then(r => r.ok ? r.json() : null);
  const entry = profile?.methods?.[functionName];
  if (!entry || profile?.status !== 'measured') throw new Error(`Measured fee profile missing for ${functionName}. Run the 61997 profiling suite first.`);
  if (String(profile?.chainId) !== String(CHAIN_ID)) throw new Error('Fee profile does not match Studio Dev (61997).');
  const kit = createTransactionKit({chain:chains.studioDevnet,provider,account,suggestions:profile});
  const tx = {kind:'write' as const,address,method:functionName,args};
  const quote = await kit.estimate({preset:'standard'},tx);
  if (quote.verification.status !== 'verified') throw new Error(`Live fee policy verification is ${quote.verification.status}; refusing to request a signature.`);
  const deposit = quote.feeValue.toString();
  onState({phase:'signing',deposit});
  const submitted = await kit.submit(quote,tx);
  const hash = submitted.genlayerTxId;
  onState({phase:'pending',hash,deposit});
  const final = await kit.track(hash,status => {
    if (status.genlayerTxId && status.phase === 'decided') onState({phase:'accepted',hash:status.genlayerTxId,deposit});
  },{until:'finalized'});
  if (final.statusName !== 'FINALIZED' || final.executionResultName !== 'FINISHED_WITH_RETURN' || !final.successful) throw new Error(`Final execution failed: ${final.statusName ?? 'unknown'} / ${final.executionResultName ?? 'unknown'}`);
  onState({phase:'finalized',hash,deposit});
  return {...final,hash};
}
export async function appeal(provider:any, account:Address, txId:Address) {
  await assertChain(provider);
  const client = walletClient(provider, account);
  const charge = await client.getAppealCharge({txId});
  return {charge, submit:() => client.appealTransaction({txId,value:charge})};
}
