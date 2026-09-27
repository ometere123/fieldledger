import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({estimate:vi.fn(),submit:vi.fn(),track:vi.fn(),charge:vi.fn(),appeal:vi.fn()}));
vi.mock('genlayer-js',()=>({chains:{studioDevnet:{id:61997}},createClient:()=>({getAppealCharge:mocks.charge,appealTransaction:mocks.appeal})}));
vi.mock('@genlayer/transaction-kit',()=>({createTransactionKit:()=>({estimate:mocks.estimate,submit:mocks.submit,track:mocks.track})}));
import {submitAction,appeal} from '../apps/web/src/lib/genlayer';
const provider=(network='0xf22d')=>({request:async()=>network}); // 61997 hex
const account=('0x'+'1'.repeat(40)) as `0x${string}`;
const profile={status:'measured',chainId:61997,methods:{determine:{leaderTimeunitsAllocation:'10',validatorTimeunitsAllocation:'10',executionBudgetPerRound:'100',totalMessageFees:'200'}}};
beforeEach(()=>{vi.stubGlobal('fetch',async()=>new Response(JSON.stringify(profile)));mocks.estimate.mockReset().mockResolvedValue({feeValue:500n,verification:{status:'verified'}});mocks.submit.mockReset().mockResolvedValue({genlayerTxId:'0x'+'a'.repeat(64)});mocks.track.mockReset().mockImplementation(async(_hash:string,onUpdate:(x:any)=>void)=>{onUpdate({phase:'decided',genlayerTxId:'0x'+'a'.repeat(64)});return {phase:'finalized',statusName:'FINALIZED',executionResultName:'FINISHED_WITH_RETURN',successful:true,genlayerTxId:'0x'+'a'.repeat(64)}});mocks.charge.mockReset().mockResolvedValue(200n);mocks.appeal.mockReset().mockResolvedValue('0x'+'b'.repeat(64))});
afterEach(()=>vi.unstubAllGlobals());
describe('frontend transaction lifecycle',()=>{
 it('shows accepted as pending and only marks finalized after successful final execution',async()=>{const states:string[]=[];await submitAction(provider('0xf22d'),account,account,'determine',['EV1'],s=>states.push(s.phase));expect(states).toEqual(['quoting','signing','pending','accepted','finalized'])});
 it('rejects wrong wallet network before fee estimation or signature',async()=>{await expect(submitAction(provider('0x1'),account,account,'determine',['EV1'],()=>{})).rejects.toThrow('61997');expect(mocks.estimate).not.toHaveBeenCalled()});
 it('fails closed when fee estimation or child funding fails',async()=>{mocks.estimate.mockRejectedValue(Error('child message budget insufficient'));await expect(submitAction(provider('0xf22d'),account,account,'determine',['EV1'],()=>{})).rejects.toThrow('child message');expect(mocks.submit).not.toHaveBeenCalled()});
 it('rejects unverified fee policy before requesting a signature',async()=>{mocks.estimate.mockResolvedValue({feeValue:500n,verification:{status:'mismatch'}});await expect(submitAction(provider('0xf22d'),account,account,'determine',['EV1'],()=>{})).rejects.toThrow('mismatch');expect(mocks.submit).not.toHaveBeenCalled()});
 it('rejects unsuccessful final execution after the tracking lifecycle',async()=>{mocks.track.mockResolvedValue({phase:'finalized',statusName:'FINALIZED',executionResultName:'FINISHED_WITH_ERROR',successful:false});await expect(submitAction(provider('0xf22d'),account,account,'determine',['EV1'],()=>{})).rejects.toThrow('Final execution failed')});
 it('uses protocol appeal charge and submit transaction',async()=>{const a=await appeal(provider('0xf22d'),account,'0x'+'a'.repeat(64) as `0x${string}`);expect(a.charge).toBe(200n);await a.submit();expect(mocks.appeal).toHaveBeenCalledWith({txId:'0x'+'a'.repeat(64),value:200n})});
});
